/**
 * SoloFlow — Workflow Orchestration Plugin for OpenClaw
 * Shared type definitions
 */

// ─── Primitive Aliases ───────────────────────────────────────────────

export type WorkflowId = string & { readonly __brand: unique symbol };
export type StepId = string & { readonly __brand: unique symbol };

// ─── Discipline Agents ───────────────────────────────────────────────

export const AGENT_DISCIPLINES = ["deep", "quick", "visual", "ultrabrain"] as const;
export type AgentDiscipline = (typeof AGENT_DISCIPLINES)[number];

export interface AgentConfig {
  discipline: AgentDiscipline;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: string[];
}

export interface AgentResult {
  stepId: StepId;
  discipline: AgentDiscipline;
  output: unknown;
  tokensUsed?: number;
  durationMs?: number;
  error?: string;
}

// ─── DAG Scheduler ───────────────────────────────────────────────────

export interface DAGEdge {
  from: StepId;
  to: StepId;
}

export interface DAGNode {
  id: StepId;
  dependencies: StepId[];
  discipline: AgentDiscipline;
  action: string;
}

export interface DAG {
  readonly nodes: ReadonlyMap<StepId, DAGNode>;
  readonly edges: readonly DAGEdge[];
  /** Topologically-sorted execution layers (parallelisable within each layer) */
  readonly layers: readonly (readonly StepId[])[];
}

export interface SchedulerOptions {
  maxConcurrency?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  onStepStart?: (stepId: StepId) => void;
  onStepComplete?: (stepId: StepId, result: AgentResult) => void;
  onStepError?: (stepId: StepId, error: Error) => void;
}

export interface SchedulerResult {
  workflowId: WorkflowId;
  completed: StepId[];
  failed: Array<{ stepId: StepId; error: string }>;
  totalDurationMs: number;
}

// ─── FSM (Finite State Machine) ──────────────────────────────────────

export const WORKFLOW_STATES = [
  "idle",
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const WORKFLOW_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  idle: ["queued"],
  queued: ["running", "cancelled"],
  running: ["paused", "completed", "failed", "cancelled"],
  paused: ["running", "cancelled"],
  completed: [],
  failed: ["queued"],
  cancelled: ["queued"],
};

export const STEP_STATES = ["pending", "running", "completed", "failed", "skipped"] as const;
export type StepState = (typeof STEP_STATES)[number];

// ─── Workflow ────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: StepId;
  name: string;
  discipline: AgentDiscipline;
  dependencies: StepId[];
  config: Record<string, unknown>;
  state: StepState;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Workflow {
  id: WorkflowId;
  name: string;
  description: string;
  ownerId?: string;  // undefined = legacy/no auth
  steps: Map<StepId, WorkflowStep>;
  dag: DAG;
  state: WorkflowState;
  currentSteps: StepId[];
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

export interface WorkflowTemplate {
  name: string;
  description: string;
  steps: Omit<WorkflowStep, "state" | "result" | "error" | "startedAt" | "completedAt">[];
}

// ─── Commands ────────────────────────────────────────────────────────

export interface CommandContext {
  args: string[];
  workflowId?: WorkflowId;
  options: Record<string, unknown>;
  reply: (message: string) => void;
  replyError: (message: string) => void;
}

export interface CommandRegistration {
  name: string;
  description: string;
  aliases?: string[];
  handler: (ctx: CommandContext) => Promise<void> | void;
  subcommands?: CommandRegistration[];
}

// ─── RPC ─────────────────────────────────────────────────────────────

export interface RPCRequest {
  method: string;
  params: Record<string, unknown>;
  id?: string | number;
}

export interface RPCResponse<T = unknown> {
  id?: string | number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export interface RPCMethod {
  name: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
  schema?: Record<string, unknown>;
  description?: string;
}

// ─── Plugin Services ─────────────────────────────────────────────────

export interface WorkflowService {
  create(template: WorkflowTemplate): Promise<Workflow>;
  get(id: WorkflowId): Promise<Workflow | undefined>;
  list(filter?: { state?: WorkflowState }): Promise<Workflow[]>;
  start(id: WorkflowId): Promise<void>;
  pause(id: WorkflowId): Promise<void>;
  resume(id: WorkflowId): Promise<void>;
  cancel(id: WorkflowId): Promise<void>;
  retry(id: WorkflowId, stepId?: StepId): Promise<void>;
  delete(id: WorkflowId): Promise<void>;
}

export interface SchedulerService {
  schedule(workflow: Workflow, options?: SchedulerOptions): Promise<SchedulerResult>;
  cancel(workflowId: WorkflowId): Promise<void>;
  getStatus(workflowId: WorkflowId): Promise<SchedulerResult | undefined>;
}

export interface AgentService {
  execute(step: WorkflowStep, config?: AgentConfig): Promise<AgentResult>;
  getCapabilities(): AgentDiscipline[];
}

export interface StateService {
  getWorkflow(id: WorkflowId): Workflow | undefined;
  setWorkflow(workflow: Workflow): void;
  deleteWorkflow(id: WorkflowId): void;
  listWorkflows(filter?: { state?: WorkflowState }): Workflow[];
  subscribe(listener: (event: StateEvent) => void): () => void;
}

// ─── Events ──────────────────────────────────────────────────────────

export type StateEvent =
  | { type: "workflow:created"; workflowId: WorkflowId }
  | { type: "workflow:state_changed"; workflowId: WorkflowId; from: WorkflowState; to: WorkflowState }
  | { type: "workflow:deleted"; workflowId: WorkflowId }
  | { type: "step:started"; workflowId: WorkflowId; stepId: StepId }
  | { type: "step:completed"; workflowId: WorkflowId; stepId: StepId; result: unknown }
  | { type: "step:failed"; workflowId: WorkflowId; stepId: StepId; error: string }
  | { type: "step:skipped"; workflowId: WorkflowId; stepId: StepId };

// ─── OpenClaw Host Models Config (re-export for convenience) ─────────

export type { HostModelsConfig } from "./agents/llm-client.js";

// ─── OpenClaw Host API ───────────────────────────────────────────────

export interface OpenClawApi {
  commands: {
    register: (registration: CommandRegistration) => void;
    unregister: (name: string) => void;
  };
  rpc: {
    register: (method: RPCMethod) => void;
    unregister: (name: string) => void;
  };
  services: {
    register: (name: string, service: unknown) => void;
    unregister: (name: string) => void;
    get: <T>(name: string) => T;
  };
  logger: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    debug: (msg: string, ...args: unknown[]) => void;
  };
  /** Host model provider config for direct LLM calls. */
  hostModels?: import("./agents/llm-client.js").HostModelsConfig;
  config: {
    get: <T = unknown>(key: string, defaultValue?: T) => T;
    set: (key: string, value: unknown) => void;
    has: (key: string) => boolean;
  };
  events: {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
  };
  state: {
    get: <T>(key: string) => T | undefined;
    set: (key: string, value: unknown) => void;
    delete: (key: string) => void;
    has: (key: string) => boolean;
  };
  hooks: {
    register: (hookName: string, handler: (...args: unknown[]) => unknown) => void;
    unregister: (hookName: string) => void;
  };
}

// ─── Plugin Manifest ─────────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  provides: string[];
}
