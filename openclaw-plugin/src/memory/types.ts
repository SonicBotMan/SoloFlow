/**
 * SoloFlow Memory — Type Definitions
 *
 * Three-tier cognitive memory system inspired by human memory:
 *   Working   → Current workflow context, step results (volatile)
 *   Episodic  → Past workflow executions (compressed via DAG)
 *   Semantic  → Facts, preferences, skills (with forgetting curve)
 */

import type { WorkflowId, StepId, WorkflowState, AgentDiscipline } from "../types.js";

// ─── Memory Namespace ────────────────────────────────────────────────

export type MemoryNamespace = string;

export interface MemoryNamespaceConfig {
  /** Unique namespace identifier (e.g. userId, agentId) */
  id: MemoryNamespace;
  /** Max working-memory entries before eviction */
  workingCapacity?: number;
  /** Max episodic entries before DAG compression triggers */
  episodicCapacity?: number;
  /** Forgetting curve stability in ms (default: 14 days) */
  retrievalHalfLife?: number;
  /** Compression threshold in ms (default: 12 hours) */
  compressionThreshold?: number;
}

// ─── Base Memory Entry ───────────────────────────────────────────────

export interface MemoryEntry {
  readonly id: string;
  readonly namespace: MemoryNamespace;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly tags: string[];
}

// ─── Working Memory ──────────────────────────────────────────────────

export type WorkingEntrySourceType = "step_result" | "workflow_context" | "user_input" | "system";

export interface WorkingEntry extends MemoryEntry {
  key: string;
  value: unknown;
  source: WorkingEntrySourceType;
  /** Associated workflow, if any */
  workflowId?: WorkflowId;
  /** Associated step, if any */
  stepId?: StepId;
}

// ─── Episodic Memory ─────────────────────────────────────────────────

export type EpisodicEntrySourceType = "workflow_execution" | "workflow_snapshot" | "compressed_dag";

export interface EpisodicEntry extends MemoryEntry {
  workflowId: WorkflowId;
  workflowName: string;
  /** Final state of the workflow */
  finalState: WorkflowState;
  /** Total duration in ms */
  durationMs: number;
  /** Step-level summary (compressed) */
  stepSummary: ReadonlyArray<{
    stepId: StepId;
    name: string;
    discipline: AgentDiscipline;
    durationMs: number;
    success: boolean;
  }>;
  /** Whether this entry has been DAG-compressed */
  compressed: boolean;
  /** Raw execution data — undefined after compression */
  rawData?: unknown;
  source: EpisodicEntrySourceType;
}

// ─── Semantic Memory ─────────────────────────────────────────────────

export type SemanticCategory = "fact" | "preference" | "skill" | "pattern" | "rule";

export interface SemanticEntry extends MemoryEntry {
  key: string;
  value: unknown;
  category: SemanticCategory;
  /** Importance 0–1 (affects forgetting curve decay) */
  importance: number;
  /** How many times this fact has been retrieved */
  accessCount: number;
  /** Last retrieval timestamp */
  lastAccessedAt: number;
  /** Stability parameter for forgetting curve */
  stability: number;
  /** Current retrievability (0–1), computed via R(t) = base × e^(-t/stability) */
  retrievability: number;
  /** Optional vector embedding for semantic search */
  embedding?: number[];
}

// ─── Queries & Results ───────────────────────────────────────────────

export type MemoryTier = "working" | "episodic" | "semantic";

export interface MemoryQuery {
  /** Which tier(s) to search — defaults to all */
  tiers?: MemoryTier[];
  /** Namespace scope (defaults to "default") */
  namespace?: MemoryNamespace;
  /** Text search (fuzzy match on keys, tags, values) */
  text?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by category (semantic only) */
  category?: SemanticCategory;
  /** Filter by workflowId (episodic only) */
  workflowId?: WorkflowId;
  /** Vector similarity search (semantic only) */
  embedding?: number[];
  /** Max results per tier (default: 10) */
  limit?: number;
  /** Minimum retrievability threshold (semantic only, default: 0.45) */
  minRetrievability?: number;
}

export interface MemoryResultEntry {
  tier: MemoryTier;
  entry: WorkingEntry | EpisodicEntry | SemanticEntry;
  /** Relevance score 0–1 */
  score: number;
}

export interface MemoryResult {
  entries: MemoryResultEntry[];
  /** Total matches before limit */
  totalMatches: number;
  /** Query that produced this result */
  query: MemoryQuery;
}

// ─── Forgetting Curve ────────────────────────────────────────────────

export interface ForgettingCurveConfig {
  /** Base retrievability (default: 1.0) */
  base: number;
  /** Stability in ms — time for retrievability to drop to ~37% (default: 14 days) */
  stability: number;
  /** Below this threshold entries are candidates for pruning (default: 0.45) */
  importanceThreshold: number;
}

// ─── Bridge ───────────────────────────────────────────────────────────

export interface LobsterPressAdapter {
  /** Whether the lobster-press backend is connected */
  readonly connected: boolean;
  /** Store a semantic entry via lobster-press */
  storeSemantic(entry: SemanticEntry): Promise<void>;
  /** Query semantic entries via lobster-press */
  querySemantic(query: MemoryQuery): Promise<SemanticEntry[]>;
  /** Run DAG compression on episodic entries */
  compressEpisodic(entries: EpisodicEntry[]): Promise<EpisodicEntry[]>;
  /** Initialize the adapter */
  init(): Promise<void>;
  /** Graceful shutdown */
  close(): Promise<void>;
}
