/**
 * SoloFlow — Skill Evolution System Types
 *
 * Defines the core types for auto-detecting repeatable workflow patterns
 * and generating reusable SKILL.md skills.
 */

import type { AgentDiscipline } from "../types.js";

// ─── Skill Step ───────────────────────────────────────────────────────

export interface SkillStep {
  name: string;
  action: string;
  discipline: AgentDiscipline;
  params: Record<string, unknown>;
}

// ─── Skill ────────────────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description: string;
  steps: SkillStep[];
  discipline: AgentDiscipline;
  successRate: number;
  usageCount: number;
  installed: boolean;
  createdAt: number;
  updatedAt: number;
  sourceWorkflowIds: string[];
}

// ─── Task Pattern ─────────────────────────────────────────────────────

export interface TaskPattern {
  id: string;
  stepSignatures: string[];
  paramTemplates: Record<string, unknown>[];
  occurrenceCount: number;
  lastSeen: number;
  workflowIds: string[];
  disciplines: AgentDiscipline[];
}

// ─── Detected Task ────────────────────────────────────────────────────

export interface DetectedTask {
  workflowId: string;
  workflowName: string;
  steps: Array<{
    name: string;
    discipline: AgentDiscipline;
    config: Record<string, unknown>;
    signature: string;
    completedAt?: number;
  }>;
  signatureSequence: string;
  durationMs: number;
  completedAt: number;
}

// ─── Skill Score ──────────────────────────────────────────────────────

export interface SkillScore {
  skillId: string;
  score: number;
  successRate: number;
  usageCount: number;
  recency: number;
  complexity: number;
}

// ─── Skill Evolution Event ────────────────────────────────────────────

export type SkillEvolutionEvent =
  | { type: "skill:detected"; pattern: TaskPattern }
  | { type: "skill:generated"; skill: Skill }
  | { type: "skill:scored"; score: SkillScore }
  | { type: "skill:installed"; skillId: string }
  | { type: "skill:uninstalled"; skillId: string }
  | { type: "skill:updated"; skill: Skill };
