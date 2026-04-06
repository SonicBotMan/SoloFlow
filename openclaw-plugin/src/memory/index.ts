import type { Workflow } from "../types.js";
import type {
  MemoryNamespace,
  MemoryQuery,
  MemoryResult,
  MemoryResultEntry,
  MemoryTier,
  SemanticCategory,
  SemanticEntry,
  LobsterPressAdapter,
  ForgettingCurveConfig,
} from "./types.js";

import { WorkingMemory } from "./working-memory.js";
import { EpisodicMemory } from "./episodic-memory.js";
import { SemanticMemory } from "./semantic-memory.js";
import { LobsterPressBridge, InMemoryFallbackAdapter } from "./bridge.js";

const DEFAULT_NAMESPACE = "default";

export interface MemorySystemConfig {
  namespace?: MemoryNamespace;
  workingCapacity?: number;
  episodicCapacity?: number;
  compressionThresholdMs?: number;
  forgetting?: Partial<ForgettingCurveConfig>;
  lobsterPressDbPath?: string;
  /** Disable lobster-press even if installed */
  disableLobsterPress?: boolean;
}

export class MemorySystem {
  readonly working: WorkingMemory;
  readonly episodic: EpisodicMemory;
  readonly semantic: SemanticMemory;

  private bridge: LobsterPressBridge | null = null;
  private fallback: InMemoryFallbackAdapter | null = null;
  private initialized = false;
  private readonly namespace: MemoryNamespace;
  private readonly config: MemorySystemConfig;

  constructor(config: MemorySystemConfig = {}) {
    this.config = config;
    this.namespace = config.namespace ?? DEFAULT_NAMESPACE;

    this.working = new WorkingMemory(this.namespace, config.workingCapacity);
    this.episodic = new EpisodicMemory(
      this.namespace,
      config.episodicCapacity,
      config.compressionThresholdMs,
    );
    this.semantic = new SemanticMemory(this.namespace, config.forgetting);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    let adapter: LobsterPressAdapter;

    if (!this.config.disableLobsterPress && !this.bridge) {
      this.bridge = new LobsterPressBridge({
        dbPath: this.config.lobsterPressDbPath,
      });
      await this.bridge.init();

      if (this.bridge.connected) {
        adapter = this.bridge;
      } else {
        this.fallback = new InMemoryFallbackAdapter();
        await this.fallback.init();
        adapter = this.fallback;
      }

      this.semantic.setAdapter(adapter);
    }

    this.initialized = true;
  }

  async query(query: MemoryQuery): Promise<MemoryResult> {
    const resolvedQuery = this.resolveQuery(query);
    const tiers = resolvedQuery.tiers ?? (["working", "episodic", "semantic"] as MemoryTier[]);
    const allResults: MemoryResultEntry[] = [];

    if (tiers.includes("working")) {
      allResults.push(...this.working.query(resolvedQuery));
    }

    if (tiers.includes("episodic")) {
      allResults.push(...this.episodic.searchExecutions(resolvedQuery));
    }

    if (tiers.includes("semantic")) {
      const semanticResults = await this.semantic.getFacts(resolvedQuery);
      allResults.push(...semanticResults);
    }

    allResults.sort((a, b) => b.score - a.score);

    const limit = resolvedQuery.limit ?? 10;
    const sliced = allResults.slice(0, limit);

    return {
      entries: sliced,
      totalMatches: allResults.length,
      query: resolvedQuery,
    };
  }

  async storeWorkflowExecution(workflow: Workflow): Promise<void> {
    this.episodic.storeExecution(workflow);
  }

  async storeFact(
    key: string,
    value: unknown,
    importance = 0.5,
    extra?: { category?: SemanticCategory; tags?: string[]; embedding?: number[] },
  ): Promise<SemanticEntry> {
    return this.semantic.storeFact(key, value, importance, extra);
  }

  getStats(): MemorySystemStats {
    return {
      namespace: this.namespace,
      initialized: this.initialized,
      lobsterPressConnected: this.bridge?.connected ?? false,
      working: { entries: this.working.size },
      episodic: { entries: this.episodic.size },
      semantic: { entries: this.semantic.size },
    };
  }

  async prune(): Promise<{ forgottenFacts: number; compressedEpisodes: number }> {
    const forgottenFacts = this.semantic.pruneForgotten();
    const compressedEpisodes = this.episodic.compressOldEntries();
    return { forgottenFacts, compressedEpisodes };
  }

  async close(): Promise<void> {
    if (this.bridge) {
      await this.bridge.close();
      this.bridge = null;
    }
    if (this.fallback) {
      await this.fallback.close();
      this.fallback = null;
    }
    this.working.clear();
    this.initialized = false;
  }

  private resolveQuery(query: MemoryQuery): MemoryQuery {
    return {
      ...query,
      namespace: query.namespace ?? this.namespace,
      limit: query.limit ?? 10,
    };
  }
}

export interface MemorySystemStats {
  namespace: MemoryNamespace;
  initialized: boolean;
  lobsterPressConnected: boolean;
  working: { entries: number };
  episodic: { entries: number };
  semantic: { entries: number };
}

export {
  WorkingMemory,
  EpisodicMemory,
  SemanticMemory,
  LobsterPressBridge,
  InMemoryFallbackAdapter,
};

export type {
  MemoryEntry,
  MemoryNamespace,
  MemoryNamespaceConfig,
  WorkingEntry,
  EpisodicEntry,
  SemanticEntry,
  SemanticCategory,
  MemoryQuery,
  MemoryResult,
  MemoryResultEntry,
  MemoryTier,
  ForgettingCurveConfig,
  LobsterPressAdapter,
} from "./types.js";
