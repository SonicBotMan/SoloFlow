/**
 * Unified Retriever — merges episodic FTS5, vector embeddings, and semantic
 * memory into a single RRF-fused result set.
 */

import type { MemoryResultEntry, MemoryTier } from "./types.js";

function normalize(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, " ");
}

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
      } catch (e) { console.warn(`FTS5 not available: ${e}`); }
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
      } catch (e) { console.warn(`Vector not available: ${e}`); }
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

    // Apply time decay
    const now = Date.now();
    for (const r of results) {
      const createdAt = (r.entry as any).createdAt ?? (r.entry as any).timestamp ?? now;
      r.score = this.timeDecay(r.score, createdAt as number);
    }

    // Apply MMR for diversity
    const diversified = this.maximalMarginalRelevance(results, 0.7, limit);
    return diversified;
  }

  /**
   * Search workflow templates by keyword matching.
   * Uses RRF fusion + MMR reranking.
   */
  searchTemplates(
    query: string,
    templates: Array<{
      id: string;
      name: string;
      description?: string;
      triggers?: string[];
      tags?: string[];
    }>,
    limit = 10,
  ): Array<{ template: typeof templates[number]; score: number }> {
    if (templates.length === 0) return [];

    const queryTokens = new Set(normalize(query).split(/[^\w\u4e00-\u9fff]+/).filter(t => t.length >= 2));
    if (queryTokens.size === 0) return [];

    // Score each template across multiple fields, then RRF
    const fieldGroups: Array<Array<{ idx: number; score: number }>> = [];

    // Name matches
    const nameScores: Array<{ idx: number; score: number }> = [];
    // Description matches
    const descScores: Array<{ idx: number; score: number }> = [];
    // Trigger matches
    const triggerScores: Array<{ idx: number; score: number }> = [];
    // Tag matches
    const tagScores: Array<{ idx: number; score: number }> = [];

    for (let i = 0; i < templates.length; i++) {
      const t = templates[i]!;
      const nameTokens = normalize(t.name).split(/[^\w\u4e00-\u9fff]+/);
      const nameHits = nameTokens.filter(tk => queryTokens.has(tk)).length;
      const nameScore = nameTokens.length > 0 ? nameHits / nameTokens.length : 0;
      nameScores.push({ idx: i, score: nameScore });

      if (t.description) {
        const descTokens = normalize(t.description).split(/[^\w\u4e00-\u9fff]+/);
        const descHits = descTokens.filter(tk => queryTokens.has(tk)).length;
        const descScore = descTokens.length > 0 ? descHits / descTokens.length : 0;
        descScores.push({ idx: i, score: descScore });
      }

      if (t.triggers?.length) {
        let bestTriggerScore = 0;
        for (const tr of t.triggers) {
          const trTokens = normalize(tr).split(/[^\w\u4e00-\u9fff]+/);
          const trHits = trTokens.filter(tk => queryTokens.has(tk)).length;
          bestTriggerScore = Math.max(bestTriggerScore, trTokens.length > 0 ? trHits / trTokens.length : 0);
        }
        triggerScores.push({ idx: i, score: bestTriggerScore });
      }

      if (t.tags?.length) {
        const tagTokens = t.tags.flatMap(tag => normalize(tag).split(/[^\w\u4e00-\u9fff]+/));
        const tagHits = tagTokens.filter(tk => queryTokens.has(tk)).length;
        const tagScore = tagTokens.length > 0 ? tagHits / tagTokens.length : 0;
        tagScores.push({ idx: i, score: tagScore });
      }
    }

    fieldGroups.push(nameScores, descScores, triggerScores, tagScores);

    // RRF across fields
    const rrfScores = new Map<number, number>();
    for (const group of fieldGroups) {
      const ranked = [...group].sort((a, b) => b.score - a.score);
      for (let rank = 0; rank < ranked.length; rank++) {
        const { idx } = ranked[rank]!;
        const rrf = 1 / (this.config.rrfK + rank + 1);
        rrfScores.set(idx, (rrfScores.get(idx) ?? 0) + rrf);
      }
    }

    // Build candidates
    const candidates: MemoryResultEntry[] = [];
    for (const [idx, score] of rrfScores) {
      if (score === 0) continue;
      candidates.push({
        tier: "semantic",
        entry: { ...templates[idx], _templateIdx: idx } as any,
        score,
      });
    }

    const diversified = this.maximalMarginalRelevance(candidates, 0.7, limit);
    return diversified.map(r => {
      const idx = (r.entry as any)._templateIdx as number;
      return {
        template: templates[idx]!,
        score: r.score,
      };
    });
  }

  /**
   * Apply time decay to a score.
   * Recent results retain high weight; 14-day-old results drop to ~0.3x.
   */
  private timeDecay(score: number, createdAtMs: number, halfLifeDays = 14): number {
    const ageMs = Date.now() - createdAtMs;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    if (ageDays < 0) return score;
    return score * (0.3 + 0.7 * Math.pow(0.5, ageDays / halfLifeDays));
  }

  /**
   * Maximal Marginal Relevance — rerank for diversity.
   * Greedily selects candidates maximizing: rel - (1-λ) * max_sim_to_selected.
   * Similarity approximated by id prefix or tier match.
   */
  private maximalMarginalRelevance(
    candidates: MemoryResultEntry[],
    lambda = 0.7,
    limit: number,
  ): MemoryResultEntry[] {
    if (candidates.length <= limit) return [...candidates];

    const selected: MemoryResultEntry[] = [];
    const remaining = [...candidates];

    // Pick the highest-scoring candidate first
    remaining.sort((a, b) => b.score - a.score);
    selected.push(remaining.shift()!);

    while (selected.length < limit && remaining.length > 0) {
      let bestIdx = 0;
      let bestMmr = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const c = remaining[i]!;
        const rel = c.score;

        // Max similarity to any already-selected item
        let maxSim = 0;
        for (const s of selected) {
          const sim = this.candidateSimilarity(c, s);
          if (sim > maxSim) maxSim = sim;
        }

        const mmr = rel - (1 - lambda) * maxSim;
        if (mmr > bestMmr) {
          bestMmr = mmr;
          bestIdx = i;
        }
      }

      selected.push(remaining.splice(bestIdx, 1)[0]!);
    }

    return selected;
  }

  /** Approximate similarity between two candidates (no vectors available). */
  private candidateSimilarity(a: MemoryResultEntry, b: MemoryResultEntry): number {
    // Same tier = partial similarity
    if (a.tier === b.tier) {
      // Id prefix match (e.g. same workflow)
      const idA = (a.entry as any).id ?? "";
      const idB = (b.entry as any).id ?? "";
      const prefixLen = this.commonPrefixLength(idA, idB);
      if (prefixLen > 3) return 0.8;
      return 0.3;
    }
    return 0;
  }

  private commonPrefixLength(a: string, b: string): number {
    let len = 0;
    const max = Math.min(a.length, b.length);
    while (len < max && a[len] === b[len]) len++;
    return len;
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
