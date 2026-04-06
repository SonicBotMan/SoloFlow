/**
 * SoloFlow — Discipline Agent
 *
 * Executes workflow steps via direct HTTP LLM calls (OpenAI-compatible API).
 * No dependency on api.runtime.subagent.
 */

import type {
  AgentDiscipline,
  AgentResult,
  OpenClawApi,
  WorkflowStep,
} from "../types.js";
import { AGENT_DISCIPLINES } from "../types.js";
import { completeLLM } from "./llm-client.js";

// ─── Discipline Configuration ─────────────────────────────────────────

export interface DisciplineConfig {
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  stepTimeoutMs: number;
}

export const DISCIPLINE_CONFIGS: Readonly<Record<AgentDiscipline, DisciplineConfig>> = {
  deep: {
    defaultModel: "",
    maxTokens: 8192,
    temperature: 0.3,
    stepTimeoutMs: 120_000,
    systemPrompt:
      "You are a deep-reasoning agent. Perform thorough research, multi-step analysis, and produce well-structured, detailed output. Prefer correctness over speed.",
  },

  quick: {
    defaultModel: "",
    maxTokens: 2048,
    temperature: 0.5,
    stepTimeoutMs: 60_000,
    systemPrompt:
      "You are a fast-response agent. Complete the task quickly with a concise answer. Optimise for speed and brevity.",
  },

  visual: {
    defaultModel: "",
    maxTokens: 4096,
    temperature: 0.6,
    stepTimeoutMs: 120_000,
    systemPrompt:
      "You are a visual/frontend agent. Focus on UI design, frontend code, image generation, and visual quality. Produce pixel-perfect output.",
  },

  ultrabrain: {
    defaultModel: "",
    maxTokens: 16384,
    temperature: 0.2,
    stepTimeoutMs: 300_000,
    systemPrompt:
      "You are an ultrabrain agent. Solve hard logic, algorithms, and architecture problems. Use chain-of-thought reasoning. Prioritise rigour and correctness.",
  },
};

// ─── Keyword Classification Map ───────────────────────────────────────

const KEYWORD_MAP: ReadonlyArray<{ keywords: readonly string[]; discipline: AgentDiscipline }> = [
  {
    keywords: ["research", "analyze", "analyse", "investigate", "deep dive", "compare", "review", "report", "summarize", "summarise"],
    discipline: "deep",
  },
  {
    keywords: ["quick", "fast", "simple", "lookup", "convert", "format", "tell me", "what is", "who is"],
    discipline: "quick",
  },
  {
    keywords: ["design", "ui", "frontend", "layout", "image", "screenshot", "visual", "css", "html", "component", "figma", "mockup"],
    discipline: "visual",
  },
  {
    keywords: ["algorithm", "architecture", "optimize", "optimise", "refactor", "logic", "complex", "math", "prove", "derive", "solve", "debug", "reverse-engineer"],
    discipline: "ultrabrain",
  },
];

// ─── Discipline Router ────────────────────────────────────────────────

/** Classify a task description into the most appropriate discipline. */
export function routeToDiscipline(task: string): AgentDiscipline {
  const lower = task.toLowerCase();

  let best: AgentDiscipline = "quick";
  let bestScore = 0;

  for (const entry of KEYWORD_MAP) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry.discipline;
    }
  }

  return best;
}

// ─── DisciplineAgent ──────────────────────────────────────────────────

export class DisciplineAgent {
  readonly discipline: AgentDiscipline;
  readonly config: DisciplineConfig;
  currentWorkflow: string | null = null;

  constructor(discipline: AgentDiscipline) {
    this.discipline = discipline;
    this.config = DISCIPLINE_CONFIGS[discipline];
  }

  /** Classify an arbitrary input string to a discipline. */
  classify(input: string): AgentDiscipline {
    return routeToDiscipline(input);
  }

  /**
   * Execute a workflow step via direct HTTP LLM call.
   */
  async execute(
    step: WorkflowStep,
    api?: OpenClawApi,
  ): Promise<AgentResult> {
    if (!api) {
      return {
        stepId: step.id,
        discipline: this.discipline,
        output: null,
        error: "OpenClaw API not provided — cannot execute without runtime",
      };
    }

    const startedAt = Date.now();
    this.currentWorkflow = step.id as unknown as string;

    const prompt = (step.config["prompt"] as string) ?? step.name;

    const systemPrompt = [
      this.config.systemPrompt,
      "",
      `You are executing step "${step.name}" (${step.id}) of a SoloFlow workflow.`,
      "Complete the task described below.",
      "Return your final result as a concise summary of what you accomplished.",
    ].join("\n");

    try {
      const hostModels = api.hostModels;
      const modelOverride = this.config.defaultModel || undefined;

      const result = await completeLLM(prompt, hostModels, {
        model: modelOverride || undefined,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        systemPrompt,
        timeoutMs: this.config.stepTimeoutMs,
      });

      return {
        stepId: step.id,
        discipline: this.discipline,
        output: result.text,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      return {
        stepId: step.id,
        discipline: this.discipline,
        output: null,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.currentWorkflow = null;
    }
  }
}

// ─── Agent Factory ────────────────────────────────────────────────────

const agentCache = new Map<AgentDiscipline, DisciplineAgent>();

/** Get or create a DisciplineAgent for the given discipline. */
export function getAgent(discipline: AgentDiscipline): DisciplineAgent {
  let agent = agentCache.get(discipline);
  if (!agent) {
    agent = new DisciplineAgent(discipline);
    agentCache.set(discipline, agent);
  }
  return agent;
}

/** Create agents for all supported disciplines. */
export function allAgents(): ReadonlyMap<AgentDiscipline, DisciplineAgent> {
  const map = new Map<AgentDiscipline, DisciplineAgent>();
  for (const d of AGENT_DISCIPLINES) {
    map.set(d, getAgent(d));
  }
  return map;
}
