export type Discipline = 'deep' | 'quick' | 'visual' | 'ultrabrain';

export type StepStatus = 'idle' | 'running' | 'completed' | 'failed' | 'skipped';

export interface AgentNodeData {
  label: string;
  discipline: Discipline;
  model: string;
  prompt: string;
  status: StepStatus;
  temperature: number;
  maxTokens: number;
}

export interface DAGStep {
  id: string;
  name: string;
  discipline: Discipline;
  model: string;
  prompt: string;
  depends_on: string[];
  temperature: number;
  max_tokens: number;
}

export interface DAGWorkflow {
  name: string;
  version: string;
  steps: DAGStep[];
}

export const DISCIPLINE_META: Record<Discipline, { color: string; label: string; glow: string; icon: string }> = {
  deep: { color: '#388bfd', label: 'Deep Think', glow: 'shadow-glow-deep', icon: 'brain' },
  quick: { color: '#3fb950', label: 'Quick Act', glow: 'shadow-glow-quick', icon: 'zap' },
  visual: { color: '#bc8cff', label: 'Visual', glow: 'shadow-glow-visual', icon: 'eye' },
  ultrabrain: { color: '#f0883e', label: 'Ultrabrain', glow: 'shadow-glow-ultrabrain', icon: 'sparkles' },
};

export const STATUS_META: Record<StepStatus, { color: string; label: string }> = {
  idle: { color: '#565869', label: 'Idle' },
  running: { color: '#388bfd', label: 'Running' },
  completed: { color: '#3fb950', label: 'Completed' },
  failed: { color: '#f85149', label: 'Failed' },
  skipped: { color: '#d29922', label: 'Skipped' },
};

export const DEFAULT_MODELS: Record<Discipline, string> = {
  deep: 'claude-sonnet-4-20250514',
  quick: 'gpt-4o-mini',
  visual: 'gpt-4o',
  ultrabrain: 'o3',
};
