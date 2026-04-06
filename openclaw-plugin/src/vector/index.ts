import type { Workflow, WorkflowStep, WorkflowId } from "../types.js";
import type {
  VectorQuery,
  VectorResult,
  VectorSearchSystemConfig,
  IndexStats,
  VectorSearchSystemResult,
} from "./types.js";
import { DEFAULT_SEARCH_OPTIONS } from "./types.js";
import { createEmbedder, type Embedder } from "./embedder.js";
import { HybridRetriever } from "./retriever.js";
import { VectorIndexer } from "./indexer.js";
import type { SemanticMemory } from "../memory/semantic-memory.js";
import type { EpisodicMemory } from "../memory/episodic-memory.js";

export class VectorSearchSystem {
  readonly embedder: Embedder;
  readonly indexer: VectorIndexer;
  readonly retriever: HybridRetriever;

  private semanticMemory: SemanticMemory | null = null;
  private episodicMemory: EpisodicMemory | null = null;
  private initialized = false;

  constructor(config: VectorSearchSystemConfig) {
    this.embedder = createEmbedder(config.embedding);

    this.indexer = new VectorIndexer(
      this.embedder,
      config.dbPath,
    );

    this.retriever = new HybridRetriever(
      this.embedder,
      this.indexer,
      config.search,
    );
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.indexer.init();
    this.initialized = true;
  }

  async searchWorkflows(query: string, topK?: number): Promise<Workflow[]> {
    this.ensureReady();

    const results = await this.retriever.search(query, topK);
    const workflowIds = new Set(
      results
        .filter((r) => !r.stepId)
        .map((r) => r.workflowId),
    );

    for (const r of results) {
      workflowIds.add(r.workflowId);
    }

    return Array.from(workflowIds).map((id) => ({
      id,
      name: results.find((r) => r.workflowId === id)?.title ?? "Unknown",
      description: "",
      steps: new Map(),
      dag: { nodes: new Map(), edges: [], layers: [] },
      state: "completed",
      currentSteps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {},
    }));
  }

  async searchSteps(query: string, topK?: number): Promise<Array<{ step: WorkflowStep; workflowId: WorkflowId }>> {
    this.ensureReady();

    const results = await this.retriever.search(query, topK);
    const stepResults = results.filter((r) => r.stepId);

    return stepResults.map((r) => ({
      workflowId: r.workflowId,
      step: {
        id: r.stepId!,
        name: r.title,
        discipline: (r.metadata["discipline"] as string ?? "quick") as WorkflowStep["discipline"],
        dependencies: [],
        config: (r.metadata["config"] as Record<string, unknown>) ?? {},
        state: (r.metadata["state"] as WorkflowStep["state"]) ?? "completed",
        result: r.metadata["result"],
        startedAt: r.timestamp,
        completedAt: r.timestamp,
      } satisfies WorkflowStep,
    }));
  }

  async search(query: string | VectorQuery): Promise<VectorSearchSystemResult> {
    this.ensureReady();

    const resolvedQuery = typeof query === "string"
      ? { text: query, mode: "auto" as const }
      : query;

    const topK = resolvedQuery.topK ?? DEFAULT_SEARCH_OPTIONS.defaultTopK;
    const results = await this.retriever.search(resolvedQuery.text, topK);

    const workflowIds = new Set(results.map((r) => r.workflowId));
    const workflows: Workflow[] = Array.from(workflowIds).map((id) => {
      const topResult = results.find((r) => r.workflowId === id)!;
      return {
        id,
        name: topResult.title,
        description: "",
        steps: new Map(),
        dag: { nodes: new Map(), edges: [], layers: [] },
        state: "completed",
        currentSteps: [],
        createdAt: topResult.timestamp,
        updatedAt: topResult.timestamp,
        metadata: topResult.metadata,
      };
    });

    const steps = results
      .filter((r) => r.stepId)
      .map((r) => ({
        step: {
          id: r.stepId!,
          name: r.title,
          discipline: (r.metadata["discipline"] as string ?? "quick") as WorkflowStep["discipline"],
          dependencies: [],
          config: (r.metadata["config"] as Record<string, unknown>) ?? {},
          state: (r.metadata["state"] as WorkflowStep["state"]) ?? "completed",
          result: r.metadata["result"],
          startedAt: r.timestamp,
          completedAt: r.timestamp,
        } satisfies WorkflowStep,
        workflowId: r.workflowId,
      }));

    return { workflows, steps, results };
  }

  async indexWorkflow(workflow: Workflow): Promise<string[]> {
    this.ensureReady();
    return this.indexer.indexWorkflowWithSteps(workflow);
  }

  async removeFromIndex(workflowId: WorkflowId): Promise<number> {
    this.ensureReady();
    return this.indexer.deleteByWorkflow(workflowId);
  }

  setSemanticMemory(memory: SemanticMemory): void {
    this.semanticMemory = memory;
  }

  setEpisodicMemory(memory: EpisodicMemory): void {
    this.episodicMemory = memory;
  }

  async searchWithMemory(query: string, topK?: number): Promise<{
    vectorResults: VectorResult[];
    semanticFacts: Array<{ key: string; value: unknown; score: number }>;
    episodicMatches: Array<{ workflowName: string; score: number }>;
  }> {
    this.ensureReady();

    const vectorResults = await this.retriever.search(query, topK);

    const semanticFacts: Array<{ key: string; value: unknown; score: number }> = [];
    if (this.semanticMemory) {
      const memResults = await this.semanticMemory.getFacts({
        text: query,
        limit: 5,
      });
      for (const r of memResults) {
        if ("key" in r.entry) {
          const entry = r.entry as { key: string; value: unknown };
          semanticFacts.push({ key: entry.key, value: entry.value, score: r.score });
        }
      }
    }

    const episodicMatches: Array<{ workflowName: string; score: number }> = [];
    if (this.episodicMemory) {
      const epResults = this.episodicMemory.searchExecutions({
        text: query,
        limit: 5,
      });
      for (const r of epResults) {
        if ("workflowName" in r.entry) {
          const entry = r.entry as { workflowName: string };
          episodicMatches.push({ workflowName: entry.workflowName, score: r.score });
        }
      }
    }

    return { vectorResults, semanticFacts, episodicMatches };
  }

  getStats(): IndexStats {
    return this.indexer.getStats();
  }

  async close(): Promise<void> {
    await this.indexer.close();
    this.initialized = false;
  }

  private ensureReady(): void {
    if (!this.initialized) throw new Error("VectorSearchSystem not initialized. Call init() first.");
  }
}

export { createEmbedder, type Embedder } from "./embedder.js";
export { HybridRetriever, type RetrievalStore } from "./retriever.js";
export { VectorIndexer } from "./indexer.js";

export type {
  Embedding,
  SerializedEmbedding,
  VectorQuery,
  VectorResult,
  ScoreBreakdown,
  SearchOptions,
  RRFConfig,
  MMRConfig,
  TimeDecayConfig,
  NormalizationConfig,
  EmbeddingProviderConfig,
  EmbeddingProviderType,
  IndexedDocument,
  IndexStats,
  VectorSearchSystemConfig,
} from "./types.js";
