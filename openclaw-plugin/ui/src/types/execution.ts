export type StepState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type WorkflowState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentDiscipline = 'deep' | 'quick' | 'visual' | 'ultrabrain';

export type LogLevel = 'info' | 'warn' | 'error';

export interface StepLogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
}

export interface ExecutionStep {
  id: string;
  name: string;
  discipline: AgentDiscipline;
  dependencies: string[];
  state: StepState;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  result?: unknown;
  error?: string;
  logs: StepLogEntry[];
  input?: unknown;
  output?: unknown;
}

export interface ExecutionEdge {
  id: string;
  source: string;
  target: string;
}

export interface ExecutionWorkflow {
  id: string;
  name: string;
  description: string;
  state: WorkflowState;
  steps: ExecutionStep[];
  edges: ExecutionEdge[];
  startedAt?: number;
  completedAt?: number;
  progress: number;
}

export type StreamEventType =
  | 'workflow:started'
  | 'workflow:step_start'
  | 'workflow:step_complete'
  | 'workflow:step_fail'
  | 'workflow:step_skip'
  | 'workflow:complete'
  | 'workflow:failed';

export interface StreamEvent {
  type: StreamEventType;
  workflowId: string;
  stepId?: string;
  stepName?: string;
  discipline?: AgentDiscipline;
  result?: unknown;
  error?: string;
  timestamp: number;
}

export interface ConnectionConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  fallbackToSSE?: boolean;
  fallbackToPolling?: boolean;
  pollingInterval?: number;
}
