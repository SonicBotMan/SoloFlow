/**
 * SoloFlow — Multi-Agent Coordination Types
 *
 * Type surface for the coordination subsystem:
 * agent teams, model selection, load balancing, and task decomposition.
 */

import type {
  AgentDiscipline,
  StepId,
  WorkflowStep,
} from "../types";

// ─── Model Selection ──────────────────────────────────────────────────

export interface ModelTier {
  name: "cheap" | "mid" | "expensive";
  model: string;
  /** Cost per 1K tokens in relative units */
  costPer1K: number;
  maxTokens: number;
  avgLatencyMs: number;
}

export interface ModelSelection {
  model: string;
  tier: ModelTier["name"];
  reasoning: string;
  estimatedTokens: number;
}

// ─── Team Member ──────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  name: string;
  discipline: AgentDiscipline;
  model: string;
  skills: string[];
  /** Capacity usage fraction 0..1 */
  load: number;
  maxCapacity: number;
  activeTasks: number;
  /** Layer index in DAG execution order */
  layer: number;
  assignedSteps: StepId[];
}

// ─── Agent Team ───────────────────────────────────────────────────────

export interface AgentTeam {
  id: string;
  name: string;
  members: TeamMember[];
  /** YAML-serialisable representation for OpenClaw */
  yaml: TeamYaml;
  createdAt: number;
}

export interface TeamYaml {
  apiVersion: "openclaw.ai/v1";
  kind: "AgentTeam";
  metadata: {
    name: string;
    labels: Record<string, string>;
  };
  spec: {
    members: Array<{
      id: string;
      name: string;
      discipline: AgentDiscipline;
      model: string;
      skills: string[];
      maxConcurrent: number;
    }>;
    execution: {
      layers: Array<{
        index: number;
        parallel: boolean;
        steps: string[];
      }>;
    };
  };
}

// ─── Team Config ──────────────────────────────────────────────────────

export interface TeamConfig {
  maxMembersPerDiscipline: number;
  defaultMaxCapacity: number;
  modelOverrides?: Partial<Record<AgentDiscipline, string>>;
  enableLoadBalancing: boolean;
}

// ─── Load Balancing ───────────────────────────────────────────────────

export interface LoadBalancingConfig {
  strategy: "round-robin" | "least-loaded" | "random";
  /** Discipline match weight vs load (0..1, higher = prefer discipline match) */
  disciplineWeight: number;
  /** Rejection threshold (0..1) */
  maxLoadThreshold: number;
}

// ─── Coordination Events ──────────────────────────────────────────────

export type CoordinationEvent =
  | { type: "team:created"; teamId: string; memberCount: number }
  | { type: "model:selected"; stepId: StepId; model: string; tier: string }
  | { type: "task:assigned"; stepId: StepId; memberId: string }
  | { type: "task:decomposed"; parentStepId: StepId; childCount: number }
  | { type: "load:rebalanced"; memberId: string; newLoad: number };

export type CoordinationEventHandler = (event: CoordinationEvent) => void;

// ─── Coordination Result ──────────────────────────────────────────────

export interface CoordinationResult {
  team: AgentTeam;
  assignments: Map<StepId, TeamMember>;
  modelSelections: Map<StepId, ModelSelection>;
  decomposedSteps: Map<StepId, WorkflowStep[]>;
}
