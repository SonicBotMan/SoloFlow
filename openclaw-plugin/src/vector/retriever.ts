import type {
  Embedding,
  VectorResult,
  SearchOptions,
  FTSResult,
  VectorSearchResult,
  RRFCandidate,
  MMRCandidate,
  IndexedDocument,
} from "./types";
import { DEFAULT_SEARCH_OPTIONS as defaultOpts } from "./types";
import type { Embedder } from "./embedder";
import { cosineSimilarity } from "./embedder";

export interface RetrievalStore {
  ftsSearch(query: string, limit: number): Promise<FTSResult[]>;
  vectorSearch(embedding: Embedding, limit: number): Promise<VectorSearchResult[]>;
  getDocuments(ids: string[]): Promise<Map<string, IndexedDocument>>;
  getAllEmbeddings(ids: string[]): Promise<Map<string, Embedding>>;
}

export class HybridRetriever {
  private readonly options: SearchOptions;

  constructor(
    private readonly embedder: Embedder,
    private readonly store: RetrievalStore,
    options?: Partial<SearchOptions>,
  ) {
    this.options = {
      rrf: { ...defaultOpts.rrf, ...options?.rrf },
      mmr: { ...defaultOpts.mmr, ...options?.mmr },
      timeDecay: { ...defaultOpts.timeDecay, ...options?.timeDecay },
      normalization: { ...defaultOpts.normalization, ...options?.normalization },
      defaultTopK: options?.defaultTopK ?? defaultOpts.defaultTopK,
    };
  }

  async search(query: string, topK?: number): Promise<VectorResult[]> {
    const k = topK ?? this.options.defaultTopK;
    const queryEmbedding = await this.embedder.embed(query);
    const prefetchLimit = Math.max(k * this.options.mmr.prefetchFactor, 50);

    const [ftsResults, vectorResults] = await Promise.all([
      this.store.ftsSearch(query, prefetchLimit),
      this.store.vectorSearch(queryEmbedding, prefetchLimit),
    ]);

    const rrfCandidates = this.reciprocalRankFusion(ftsResults, vectorResults);

    const allIds = rrfCandidates.map((c) => c.id);
    const [docMap, embeddingMap] = await Promise.all([
      this.store.getDocuments(allIds),
      this.store.getAllEmbeddings(allIds),
    ]);

    const mmrCandidates = this.mmrDeduplicate(
      rrfCandidates,
      embeddingMap,
      k,
    );

    const now = Date.now();
    const scored = mmrCandidates.map((cand) => {
      const doc = docMap.get(cand.id);
      const timeDecay = this.computeTimeDecay(doc?.createdAt ?? now, now);
      const finalScore = cand.mmrScore * timeDecay;

      return { candidate: cand, doc, timeDecay, finalScore };
    });

    const maxScore = Math.max(...scored.map((s) => s.finalScore), 1e-9);
    const results: VectorResult[] = [];

    for (const item of scored) {
      const normalized = item.finalScore / maxScore;
      if (normalized < this.options.normalization.minScore) continue;

      const doc = item.doc;
      if (!doc) continue;

      results.push({
        id: item.candidate.id,
        workflowId: doc.workflowId,
        stepId: doc.stepId,
        title: doc.title,
        snippet: doc.content.slice(0, 300),
        score: normalized,
        scoreBreakdown: {
          ftsScore: item.candidate.ftsScore,
          vectorScore: item.candidate.vectorScore,
          rrfScore: item.candidate.rrfScore,
          mmrScore: item.candidate.mmrScore,
          timeDecay: item.timeDecay,
          finalScore: normalized,
        },
        similarity: item.candidate.vectorScore,
        timestamp: doc.createdAt,
        metadata: doc.metadata,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  private reciprocalRankFusion(
    ftsResults: FTSResult[],
    vectorResults: VectorSearchResult[],
  ): RRFCandidate[] {
    const { k, ftsWeight, vectorWeight } = this.options.rrf;
    const candidateMap = new Map<string, RRFCandidate>();

    for (const result of ftsResults) {
      const rrf = ftsWeight / (k + result.rank + 1);
      candidateMap.set(result.id, {
        id: result.id,
        rrfScore: rrf,
        ftsRank: result.rank,
        vectorRank: Infinity,
        ftsScore: result.score,
        vectorScore: 0,
      });
    }

    for (const result of vectorResults) {
      const rrf = vectorWeight / (k + result.rank + 1);
      const existing = candidateMap.get(result.id);
      if (existing) {
        existing.rrfScore += rrf;
        existing.vectorRank = result.rank;
        existing.vectorScore = result.similarity;
      } else {
        candidateMap.set(result.id, {
          id: result.id,
          rrfScore: rrf,
          ftsRank: Infinity,
          vectorRank: result.rank,
          ftsScore: 0,
          vectorScore: result.similarity,
        });
      }
    }

    const candidates = Array.from(candidateMap.values());
    candidates.sort((a, b) => b.rrfScore - a.rrfScore);
    return candidates;
  }

  private mmrDeduplicate(
    candidates: RRFCandidate[],
    embeddingMap: Map<string, Embedding>,
    topK: number,
  ): MMRCandidate[] {
    const { lambda } = this.options.mmr;
    const selected: MMRCandidate[] = [];
    const remaining = candidates.map((c): MMRCandidate => ({
      ...c,
      mmrScore: c.rrfScore,
      embedding: embeddingMap.get(c.id) ?? new Float32Array(0),
    }));

    while (selected.length < topK && remaining.length > 0) {
      let bestIdx = 0;
      let bestMMR = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i]!;
        const relevance = cand.rrfScore;

        let maxSimToSelected = 0;
        for (const sel of selected) {
          const sim = cosineSimilarity(cand.embedding, sel.embedding);
          if (sim > maxSimToSelected) maxSimToSelected = sim;
        }

        const mmr = lambda * relevance - (1 - lambda) * maxSimToSelected;
        if (mmr > bestMMR) {
          bestMMR = mmr;
          bestIdx = i;
        }
      }

      const chosen = remaining.splice(bestIdx, 1)[0]!;
      chosen.mmrScore = bestMMR;
      selected.push(chosen);
    }

    return selected;
  }

  private computeTimeDecay(createdAt: number, now: number): number {
    const { halfLifeMs } = this.options.timeDecay;
    if (halfLifeMs <= 0) return 1;
    const elapsed = now - createdAt;
    return Math.pow(0.5, elapsed / halfLifeMs);
  }
}
