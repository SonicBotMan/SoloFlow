/**
 * Unified Retriever — merges episodic FTS5, vector embeddings, and semantic
 * memory into a single RRF-fused result set.
 */

import type { MemoryResultEntry, MemoryTier } from "./types.js";

export interface UnifiedRetrieverConfig {
  /** RRF constant k (default: 60) */
  rrfK?: number;
  /** Weight for episodic results (default: 0.4) */
  episodicWeight?: number;
  /** Weight for vector results (default: 0.3) */
  vectorWeight?: number;
  /** Weight for semantic results (default: 0.3) */
  semanticWeight?: number;
}

interface UnifiedCandidate {
  id: string;
  tier: MemoryTier;
  score: number;
  entry: any;
}

export class UnifiedRetriever {
  private readonly config: Required<UnifiedRetrieverConfig>;

  private ftsSearchFn: ((query: string, limit: number) => string[]) | null = null;
  private vectorSearchFn: ((query: string, limit: number) => Promise<Array<{id: string; score: number}>>) | null = null;
  private loadEpisodicByIdFn: ((id: string) => any | null) | null = null;

  constructor(config?: UnifiedRetrieverConfig) {
    this.config = {
      rrfK: 60,
      episodicWeight: 0.4,
      vectorWeight: 0.3,
      semanticWeight: 0.3,
      ...config,
    };
  }

  setFTSSearch(fn: (query: string, limit: number) => string[]): void {
    this.ftsSearchFn = fn;
  }

  setVectorSearch(fn: (query: string, limit: number) => Promise<Array<{id: string; score: number}>>): void {
    this.vectorSearchFn = fn;
  }

  setEpisodicLoader(fn: (id: string) => any | null): void {
    this.loadEpisodicByIdFn = fn;
  }

  async search(
    queryText: string,
    episodicResults: MemoryResultEntry[],
    semanticResults: MemoryResultEntry[],
    limit = 10,
  ): Promise<MemoryResultEntry[]> {
    const allCandidates: UnifiedCandidate[] = [];
    const prefetchLimit = limit * 4;
    const seenIds = new Set<string>();

    // Source 1: In-memory episodic (always available)
    for (const r of episodicResults) {
      seenIds.add(r.entry.id);
      allCandidates.push({ id: r.entry.id, tier: "episodic", score: r.score, entry: r.entry });
    }

    // Source 2: FTS5 episodic
    if (this.ftsSearchFn) {
      try {
        const ftsIds = this.ftsSearchFn(queryText, prefetchLimit);
        for (const id of ftsIds) {
          if (seenIds.has(id)) continue;
          const entry = this.loadEpisodicByIdFn?.(id);
          if (entry) {
            seenIds.add(id);
            allCandidates.push({ id, tier: "episodic", score: 0.6, entry });
          }
        }
      } catch { /* FTS5 not available */ }
    }

    // Source 3: Vector search
    if (this.vectorSearchFn) {
      try {
        const vectorResults = await this.vectorSearchFn(queryText, prefetchLimit);
        for (const vr of vectorResults) {
          if (seenIds.has(vr.id)) {
            const existing = allCandidates.find(c => c.id === vr.id);
            if (existing) existing.score *= (1 + vr.score);
          } else {
            seenIds.add(vr.id);
            allCandidates.push({
              id: vr.id,
              tier: "episodic",
              score: vr.score,
              entry: {
                id: vr.id,
                workflowId: vr.id.replace(/^(wf_|step_)/, "").split("_")[0],
                workflowName: vr.id,
              },
            });
          }
        }
      } catch { /* Vector not available */ }
    }

    // Source 4: Semantic memory (already scored by forgetting curve)
    for (const r of semanticResults) {
      if (seenIds.has(r.entry.id)) continue;
      seenIds.add(r.entry.id);
      allCandidates.push({ id: r.entry.id, tier: "semantic", score: r.score * 1.2, entry: r.entry });
    }

    // RRF fusion
    const rrfScores = this.reciprocalRankFusion(allCandidates);

    const results: MemoryResultEntry[] = [];
    for (const [id, rrfScore] of rrfScores) {
      const candidate = allCandidates.find(c => c.id === id);
      if (!candidate) continue;
      results.push({ tier: candidate.tier, entry: candidate.entry, score: rrfScore });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private reciprocalRankFusion(candidates: UnifiedCandidate[]): Map<string, number> {
    const { rrfK } = this.config;
    const scores = new Map<string, number>();
    const ranked = [...candidates].sort((a, b) => b.score - a.score);

    for (let rank = 0; rank < ranked.length; rank++) {
      const c = ranked[rank]!;
      const weight = c.tier === "semantic" ? this.config.semanticWeight : this.config.episodicWeight;
      const rrf = weight / (rrfK + rank + 1);
      scores.set(c.id, (scores.get(c.id) ?? 0) + rrf);
    }

    return scores;
  }
}
