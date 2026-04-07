import type {
  LobsterPressAdapter,
  SemanticEntry,
  EpisodicEntry,
  MemoryQuery,
} from "./types.js";

interface LobsterPressModule {
  SemanticMemory: new (config?: { dbPath?: string }) => {
    store: (key: string, value: unknown, meta?: unknown) => Promise<void>;
    query: (q: string, limit?: number) => Promise<Array<{ key: string; value: unknown; meta?: unknown }>>;
    close: () => Promise<void>;
  };
  DAGCompressor: new () => {
    compress: (data: unknown[]) => Promise<unknown[]>;
  };
}

export class LobsterPressBridge implements LobsterPressAdapter {
  private _connected = false;
  private semanticBackend: InstanceType<LobsterPressModule["SemanticMemory"]> | null = null;
  private compressorBackend: InstanceType<LobsterPressModule["DAGCompressor"]> | null = null;
  private readonly dbPath: string | undefined;

  constructor(config?: { dbPath?: string }) {
    this.dbPath = config?.dbPath;
  }

  get connected(): boolean {
    return this._connected;
  }

  async init(): Promise<void> {
    try {
      const mod = await this.tryImport();
      if (!mod) {
        this._connected = false;
        return;
      }

      this.semanticBackend = new mod.SemanticMemory(
        this.dbPath ? { dbPath: this.dbPath } : undefined,
      );
      this.compressorBackend = new mod.DAGCompressor();
      this._connected = true;
    } catch (e) { console.warn(`error: ${e}`);
      this._connected = false;
    }
  }

  async storeSemantic(entry: SemanticEntry): Promise<void> {
    if (!this.semanticBackend) throw new Error("lobster-press not connected");
    await this.semanticBackend.store(entry.key, entry.value, {
      id: entry.id,
      namespace: entry.namespace,
      category: entry.category,
      importance: entry.importance,
      tags: entry.tags,
      embedding: entry.embedding,
      stability: entry.stability,
      retrievability: entry.retrievability,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }

  async querySemantic(query: MemoryQuery): Promise<SemanticEntry[]> {
    if (!this.semanticBackend) throw new Error("lobster-press not connected");

    const results = await this.semanticBackend.query(
      query.text ?? "",
      query.limit ?? 10,
    );

    return results.map((r) => {
      const meta = r.meta as Record<string, unknown> | undefined;
      return {
        id: (meta?.["id"] as string) ?? `lp_${Date.now()}`,
        namespace: (meta?.["namespace"] as string) ?? "default",
        key: r.key,
        value: r.value,
        category: (meta?.["category"] as SemanticEntry["category"]) ?? "fact",
        importance: (meta?.["importance"] as number) ?? 0.5,
        accessCount: (meta?.["accessCount"] as number) ?? 0,
        lastAccessedAt: (meta?.["lastAccessedAt"] as number) ?? Date.now(),
        stability: (meta?.["stability"] as number) ?? 1,
        retrievability: (meta?.["retrievability"] as number) ?? 1,
        embedding: meta?.["embedding"] as number[] | undefined,
        tags: (meta?.["tags"] as string[]) ?? [],
        createdAt: (meta?.["createdAt"] as number) ?? Date.now(),
        updatedAt: (meta?.["updatedAt"] as number) ?? Date.now(),
      } satisfies SemanticEntry;
    });
  }

  async compressEpisodic(entries: EpisodicEntry[]): Promise<EpisodicEntry[]> {
    if (!this.compressorBackend) throw new Error("lobster-press not connected");

    const withData = entries.filter((e) => e.rawData != null);
    if (withData.length === 0) return entries;

    const rawArray = withData.map((e) => e.rawData);
    const compressed = await this.compressorBackend.compress(rawArray as unknown[]);

    return entries.map((entry, i) => {
      if (entry.rawData == null) return entry;
      return {
        ...entry,
        rawData: compressed[i] ?? entry.rawData,
        compressed: true,
        source: "compressed_dag" as const,
        tags: [...entry.tags, "compressed"],
        updatedAt: Date.now(),
      };
    });
  }

  async close(): Promise<void> {
    if (this.semanticBackend) {
      try {
        await this.semanticBackend.close();
      } catch (e) { console.warn(`error: ${e}`);
        // best-effort close
      }
    }
    this.semanticBackend = null;
    this.compressorBackend = null;
    this._connected = false;
  }

  private async tryImport(): Promise<LobsterPressModule | null> {
    try {
      const moduleName = "lobster-press";
      return await import(moduleName) as LobsterPressModule;
    } catch (e) { console.warn(`error: ${e}`);
      return null;
    }
  }
}

export class InMemoryFallbackAdapter implements LobsterPressAdapter {
  private readonly _store = new Map<string, SemanticEntry>();

  get connected(): boolean {
    return true;
  }

  async init(): Promise<void> {
    // no-op for in-memory
  }

  async storeSemantic(entry: SemanticEntry): Promise<void> {
    this._store.set(entry.id, entry);
  }

  async querySemantic(query: MemoryQuery): Promise<SemanticEntry[]> {
    const text = query.text?.toLowerCase();
    const results: SemanticEntry[] = [];

    for (const entry of this._store.values()) {
      if (text) {
        const haystack = `${entry.key} ${JSON.stringify(entry.value)}`.toLowerCase();
        if (!haystack.includes(text)) continue;
      }
      if (query.category && entry.category !== query.category) continue;
      results.push(entry);
    }

    return results.slice(0, query.limit ?? 10);
  }

  async compressEpisodic(entries: EpisodicEntry[]): Promise<EpisodicEntry[]> {
    return entries.map((entry) => ({
      ...entry,
      rawData: undefined,
      compressed: true,
      source: "compressed_dag" as const,
      tags: [...entry.tags, "compressed"],
      updatedAt: Date.now(),
    }));
  }

  async close(): Promise<void> {
    this._store.clear();
  }
}
