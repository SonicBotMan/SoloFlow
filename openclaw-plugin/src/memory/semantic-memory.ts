import type {
  MemoryNamespace,
  SemanticEntry,
  SemanticCategory,
  MemoryQuery,
  MemoryResultEntry,
  ForgettingCurveConfig,
  LobsterPressAdapter,
} from "./types.js";

const DEFAULT_FORGETTING_CONFIG: ForgettingCurveConfig = {
  base: 1.0,
  stability: 14 * 24 * 60 * 60 * 1000,
  importanceThreshold: 0.45,
};

export class SemanticMemory {
  private readonly store = new Map<string, SemanticEntry>();
  private readonly namespace: MemoryNamespace;
  private readonly forgettingConfig: ForgettingCurveConfig;
  private adapter: LobsterPressAdapter | null = null;

  constructor(
    namespace: MemoryNamespace,
    forgettingConfig?: Partial<ForgettingCurveConfig>,
  ) {
    this.namespace = namespace;
    this.forgettingConfig = { ...DEFAULT_FORGETTING_CONFIG, ...forgettingConfig };
  }

  setAdapter(adapter: LobsterPressAdapter): void {
    this.adapter = adapter;
  }

  async storeFact(
    key: string,
    value: unknown,
    importance = 0.5,
    extra?: {
      category?: SemanticCategory;
      tags?: string[];
      embedding?: number[];
    },
  ): Promise<SemanticEntry> {
    const existing = this.findByKey(key);
    const now = Date.now();

    const stability = this.computeStability(importance);
    const retrievability = this.computeRetrievability(now, now, stability, importance);

    if (existing) {
      const updated: SemanticEntry = {
        ...existing,
        value,
        importance,
        category: extra?.category ?? existing.category,
        tags: extra?.tags ?? existing.tags,
        embedding: extra?.embedding ?? existing.embedding,
        stability,
        retrievability,
        updatedAt: now,
      };
      this.store.set(existing.id, updated);
      await this.persistToAdapter(updated);
      return updated;
    }

    const entry: SemanticEntry = {
      id: `sm_${this.namespace}_${now}_${Math.random().toString(36).slice(2, 8)}`,
      namespace: this.namespace,
      key,
      value,
      category: extra?.category ?? "fact",
      importance,
      accessCount: 0,
      lastAccessedAt: now,
      stability,
      retrievability,
      embedding: extra?.embedding,
      tags: extra?.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(entry.id, entry);
    await this.persistToAdapter(entry);
    return entry;
  }

  async getFacts(query: MemoryQuery): Promise<MemoryResultEntry[]> {
    const entries = this.adapter?.connected
      ? await this.queryFromAdapter(query)
      : this.queryLocal(query);

    for (const result of entries) {
      if ("accessCount" in result.entry) {
        const sem = result.entry as SemanticEntry;
        const now = Date.now();
        const updated: SemanticEntry = {
          ...sem,
          accessCount: sem.accessCount + 1,
          lastAccessedAt: now,
          retrievability: this.computeRetrievability(sem.createdAt, now, sem.stability, sem.importance),
          updatedAt: now,
        };
        this.store.set(sem.id, updated);
      }
    }

    return entries;
  }

  get(key: string): SemanticEntry | undefined {
    const entry = this.findByKey(key);
    if (!entry) return undefined;

    const now = Date.now();
    const retrievability = this.computeRetrievability(
      entry.createdAt,
      now,
      entry.stability,
      entry.importance,
    );
    if (retrievability < this.forgettingConfig.importanceThreshold) return undefined;

    const updated: SemanticEntry = {
      ...entry,
      accessCount: entry.accessCount + 1,
      lastAccessedAt: now,
      retrievability,
      updatedAt: now,
    };
    this.store.set(entry.id, updated);
    return updated;
  }

  delete(key: string): boolean {
    const entry = this.findByKey(key);
    if (!entry) return false;
    return this.store.delete(entry.id);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  all(): SemanticEntry[] {
    return Array.from(this.store.values());
  }

  pruneForgotten(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [id, entry] of this.store) {
      const r = this.computeRetrievability(entry.createdAt, now, entry.stability, entry.importance);
      if (r < this.forgettingConfig.importanceThreshold) {
        this.store.delete(id);
        pruned++;
      }
    }

    return pruned;
  }

  refreshRetrievability(): void {
    const now = Date.now();
    for (const [id, entry] of this.store) {
      const r = this.computeRetrievability(entry.createdAt, now, entry.stability, entry.importance);
      this.store.set(id, { ...entry, retrievability: r });
    }
  }

  private computeRetrievability(
    createdAt: number,
    now: number,
    stability: number,
    importance: number,
  ): number {
    const elapsed = now - createdAt;
    if (stability <= 0) return 0;
    const decay = this.forgettingConfig.base * Math.exp(-elapsed / stability);
    return Math.max(0, Math.min(1, decay * importance));
  }

  private computeStability(importance: number): number {
    return this.forgettingConfig.stability * (0.5 + importance);
  }

  private queryLocal(query: MemoryQuery): MemoryResultEntry[] {
    const now = Date.now();
    const text = query.text?.toLowerCase();
    const tags = query.tags;
    const minR = query.minRetrievability ?? this.forgettingConfig.importanceThreshold;
    const results: MemoryResultEntry[] = [];

    for (const entry of this.store.values()) {
      const r = this.computeRetrievability(entry.createdAt, now, entry.stability, entry.importance);
      if (r < minR) continue;

      if (query.category && entry.category !== query.category) continue;

      let score = r;

      if (text) {
        const haystack = `${entry.key} ${JSON.stringify(entry.value)} ${entry.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(text)) continue;
        score *= 0.5 + 0.5 * (text.length / haystack.length);
      }

      if (tags?.length) {
        const hasAll = tags.every((t) => entry.tags.includes(t));
        if (!hasAll) continue;
      }

      if (query.embedding && entry.embedding) {
        const similarity = cosineSimilarity(query.embedding, entry.embedding);
        score *= similarity;
      }

      results.push({
        tier: "semantic",
        entry: { ...entry, retrievability: r },
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, query.limit ?? 10);
  }

  private async queryFromAdapter(query: MemoryQuery): Promise<MemoryResultEntry[]> {
    if (!this.adapter?.connected) return this.queryLocal(query);

    try {
      const adapterResults = await this.adapter.querySemantic(query);
      return adapterResults.map((entry) => ({
        tier: "semantic" as const,
        entry,
        score: entry.retrievability,
      }));
    } catch {
      return this.queryLocal(query);
    }
  }

  private async persistToAdapter(entry: SemanticEntry): Promise<void> {
    if (!this.adapter?.connected) return;
    try {
      await this.adapter.storeSemantic(entry);
    } catch {
      // adapter write failure — local copy is still valid
    }
  }

  private findByKey(key: string): SemanticEntry | undefined {
    for (const entry of this.store.values()) {
      if (entry.key === key) return entry;
    }
    return undefined;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
