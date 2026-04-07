/**
 * SoloFlow Vector Retrieval — Type Definitions
 *
 * Semantic search over workflow history using vector embeddings
 * with RRF (Reciprocal Rank Fusion) and MMR (Maximal Marginal Relevance).
 */

import type { WorkflowId, StepId, Workflow, WorkflowStep } from "../types.js";

// ─── Embedding ────────────────────────────────────────────────────────

/** A dense vector embedding (float32 array) */
export type Embedding = Float32Array;

/** Serializable embedding representation stored in SQLite */
export interface SerializedEmbedding {
  /** Base64-encoded Float32Array */
  data: string;
  /** Embedding dimension */
  dimensions: number;
}

// ─── Vector Query ─────────────────────────────────────────────────────

export type VectorSearchMode = "workflow" | "step" | "auto";

export interface VectorQuery {
  /** Natural language query string */
  text: string;
  /** Pre-computed query embedding (skips embed() if provided) */
  embedding?: Embedding;
  /** Search scope */
  mode: VectorSearchMode;
  /** Filter by workflow IDs */
  workflowIds?: WorkflowId[];
  /** Filter by step disciplines */
  disciplines?: string[];
  /** Maximum number of results (default: 10) */
  topK?: number;
  /** Minimum score threshold (default: 0.45) */
  minScore?: number;
}

// ─── Vector Result ────────────────────────────────────────────────────

export interface VectorResult {
  /** Unique result ID (hash of content) */
  id: string;
  /** Source workflow ID */
  workflowId: WorkflowId;
  /** Source step ID (undefined for workflow-level results) */
  stepId?: StepId;
  /** Display title */
  title: string;
  /** Content snippet */
  snippet: string;
  /** Final relevance score after all pipeline stages (0–1) */
  score: number;
  /** Individual pipeline scores for debugging */
  scoreBreakdown: ScoreBreakdown;
  /** Raw embedding similarity */
  similarity: number;
  /** Timestamp of the source document */
  timestamp: number;
  /** Metadata from source */
  metadata: Record<string, unknown>;
}

export interface ScoreBreakdown {
  /** FTS5 text relevance (raw) */
  ftsScore: number;
  /** Vector cosine similarity (raw) */
  vectorScore: number;
  /** RRF fused score */
  rrfScore: number;
  /** Score after MMR deduplication */
  mmrScore: number;
  /** Time-decay multiplier */
  timeDecay: number;
  /** Final normalized score */
  finalScore: number;
}

// ─── Search Options ───────────────────────────────────────────────────

export interface RRFConfig {
  /** Reciprocal Rank Fusion constant k (default: 60) */
  k: number;
  /** Weight for FTS5 rank in fusion (default: 0.5) */
  ftsWeight: number;
  /** Weight for vector rank in fusion (default: 0.5) */
  vectorWeight: number;
}

export interface MMRConfig {
  /** Lambda: relevance vs diversity trade-off (default: 0.7) */
  lambda: number;
  /** Maximum results to consider from RRF before MMR (default: topK * 3) */
  prefetchFactor: number;
}

export interface TimeDecayConfig {
  /** Half-life in milliseconds (default: 14 days) */
  halfLifeMs: number;
}

export interface NormalizationConfig {
  /** Minimum score threshold after normalization (default: 0.45) */
  minScore: number;
}

export interface SearchOptions {
  /** RRF fusion parameters */
  rrf: RRFConfig;
  /** MMR deduplication parameters */
  mmr: MMRConfig;
  /** Time-decay parameters */
  timeDecay: TimeDecayConfig;
  /** Normalization and thresholding */
  normalization: NormalizationConfig;
  /** Default top-K results to return */
  defaultTopK: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  rrf: { k: 60, ftsWeight: 0.5, vectorWeight: 0.5 },
  mmr: { lambda: 0.7, prefetchFactor: 3 },
  timeDecay: { halfLifeMs: 14 * 24 * 60 * 60 * 1000 },
  normalization: { minScore: 0.45 },
  defaultTopK: 10,
};

// ─── Embedding Provider ───────────────────────────────────────────────

export type EmbeddingProviderType = "openai" | "local" | "mock" | "glm" | "minimax";

export interface EmbeddingProviderConfig {
  /** Provider type */
  type: EmbeddingProviderType;
  /** Model name / identifier (default varies by provider) */
  model?: string;
  /** Embedding dimensions (default varies by model) */
  dimensions?: number;
  /** OpenAI-compatible API base URL */
  apiBase?: string;
  /** API key (for OpenAI provider) */
  apiKey?: string;
  /** Batch size for bulk embedding (default: 32) */
  batchSize?: number;
}

// ─── Index Storage ────────────────────────────────────────────────────

export interface IndexedDocument {
  /** Unique document ID */
  id: string;
  /** Source workflow ID */
  workflowId: WorkflowId;
  /** Source step ID */
  stepId?: StepId;
  /** Document type */
  docType: "workflow" | "step";
  /** Searchable text content */
  content: string;
  /** Document title */
  title: string;
  /** Serialized embedding vector */
  embedding: SerializedEmbedding;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

export interface IndexStats {
  /** Total indexed documents */
  totalDocuments: number;
  /** Workflow-level documents */
  workflowDocuments: number;
  /** Step-level documents */
  stepDocuments: number;
  /** Embedding dimensions */
  dimensions: number;
  /** Provider type in use */
  provider: EmbeddingProviderType;
  /** Index size estimate in bytes */
  estimatedSizeBytes: number;
}

// ─── Pipeline Stage Results (internal) ────────────────────────────────

export interface FTSResult {
  id: string;
  rank: number;
  score: number;
}

export interface VectorSearchResult {
  id: string;
  similarity: number;
  rank: number;
}

export interface RRFCandidate {
  id: string;
  rrfScore: number;
  ftsRank: number;
  vectorRank: number;
  ftsScore: number;
  vectorScore: number;
}

export interface MMRCandidate extends RRFCandidate {
  mmrScore: number;
  embedding: Embedding;
}

// ─── Integration ──────────────────────────────────────────────────────

export interface VectorSearchSystemConfig {
  /** Embedding provider configuration */
  embedding: EmbeddingProviderConfig;
  /** Search pipeline options */
  search: Partial<SearchOptions>;
  /** SQLite database path (default: in-memory) */
  dbPath?: string;
  /** Namespace for memory integration */
  namespace?: string;
}

export interface VectorSearchSystemResult {
  workflows: Workflow[];
  steps: Array<{ step: WorkflowStep; workflowId: WorkflowId }>;
  results: VectorResult[];
}
