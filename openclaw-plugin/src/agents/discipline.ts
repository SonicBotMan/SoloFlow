/**
 * SoloFlow — Discipline Agent
 *
 * Executes workflow steps via OpenClaw subagent (api.runtime.subagent).
 * Each step gets its own subagent session with full tool access.
 * Upstream step outputs are injected as context.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type {
  AgentDiscipline,
  AgentResult,
  WorkflowStep,
} from "../types.js"

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
    defaultModel: "minimax-portal/MiniMax-M2.7-highspeed",
    maxTokens: 8192,
    temperature: 0.3,
    stepTimeoutMs: 120_000,
    systemPrompt:
      "You are a deep-reasoning agent. Perform thorough research, multi-step analysis, and produce well-structured, detailed output. Prefer correctness over speed. Use tools when needed to complete your task.",
  },

  quick: {
    defaultModel: "minimax-portal/MiniMax-M2.7-highspeed",
    maxTokens: 2048,
    temperature: 0.5,
    stepTimeoutMs: 60_000,
    systemPrompt:
      "You are a fast-response agent. Complete the task quickly with a concise answer. Optimise for speed and brevity. Use tools when needed.",
  },

  visual: {
    defaultModel: "minimax-portal/MiniMax-M2.7-highspeed",
    maxTokens: 4096,
    temperature: 0.6,
    stepTimeoutMs: 120_000,
    systemPrompt:
      "You are a visual/frontend agent. Focus on UI design, frontend code, image generation, and visual quality. Produce pixel-perfect output. Use tools when needed.",
  },

  ultrabrain: {
    defaultModel: "minimax-portal/MiniMax-M2.7-highspeed",
    maxTokens: 16384,
    temperature: 0.2,
    stepTimeoutMs: 300_000,
    systemPrompt:
      "You are an ultrabrain agent. Solve hard logic, algorithms, and architecture problems. Use chain-of-thought reasoning. Prioritise rigour and correctness. Use tools when needed.",
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

// ─── Prompt Builder ───────────────────────────────────────────────────

/**
 * Build the task prompt for a step, injecting upstream results as context.
 */
function buildStepPrompt(
  step: WorkflowStep,
  upstreamResults: ReadonlyMap<string, AgentResult>,
): string {
  const action = (step.config?.["prompt"] as string) ?? step.name;

  // Collect outputs from dependency steps
  const deps = step.config?.["dependencies"] as string[] | undefined;
  if (deps && deps.length > 0) {
    const contextParts: string[] = [];

    for (const depId of deps) {
      const result = upstreamResults.get(depId);
      if (result?.output) {
        const depStep = step.config?.["__depNames"] as Record<string, string> | undefined;
        const depName = depStep?.[depId] ?? depId;
        contextParts.push(`### Output from step "${depName}" (${depId}):\n${result.output}`);
      }
    }

    if (contextParts.length > 0) {
      return `## Context from previous steps\n\n${contextParts.join("\n\n")}\n\n---\n\n## Your task\n\n${action}`;
    }
  }

  return action;
}

/**
 * Build the system prompt for a discipline agent executing a specific step.
 */
function buildSystemPrompt(
  config: DisciplineConfig,
  step: WorkflowStep,
  workflowName: string,
): string {
  return [
    config.systemPrompt,
    "",
    `You are executing step "${step.name}" (${step.id}) of the SoloFlow workflow "${workflowName}".`,
    "You have access to all OpenClaw tools. Use them to complete your task.",
    "When done, provide a concise summary of what you accomplished.",
    "Include any important results, file paths, or data that downstream steps may need.",
  ].join("\n");
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
   * Execute a workflow step via OpenClaw subagent.
   *
   * The subagent gets its own session with full tool access.
   * Upstream step results are injected as context in the prompt.
   */
  async execute(
    step: WorkflowStep,
    api?: OpenClawPluginApi,
    upstreamResults?: ReadonlyMap<string, AgentResult>,
    workflowName?: string,
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

    const prompt = buildStepPrompt(step, upstreamResults ?? new Map());
    // systemPrompt is built for reference/logging but subagent uses its own prompt
    buildSystemPrompt(this.config, step, workflowName ?? "unknown");

    try {
      const runtime = api.runtime as unknown as {
        subagent: {
          run: (opts: Record<string, unknown>) => Promise<{ runId: string }>;
          waitForRun: (opts: Record<string, unknown>) => Promise<{ error?: string }>;
          getSessionMessages: (opts: Record<string, unknown>) => Promise<{
            messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
          }>;
        };
      };

      if (!runtime?.subagent?.run) {
        return {
          stepId: step.id,
          discipline: this.discipline,
          output: null,
          error: "api.runtime.subagent not available — plugin may need subagent permission",
        };
      }

      // Spawn a subagent session for this step
      const sessionKey = `agent:main:subagent:soloflow:${step.id as string}:${Date.now()}`;

      const { runId } = await runtime.subagent.run({
        sessionKey,
        message: prompt,
        model: this.config.defaultModel || undefined,
      });

      // Wait for completion
      const runResult = await runtime.subagent.waitForRun({
        runId,
        timeoutMs: this.config.stepTimeoutMs,
      });

      if (runResult?.error) {
        return {
          stepId: step.id,
          discipline: this.discipline,
          output: null,
          durationMs: Date.now() - startedAt,
          error: runResult.error,
        };
      }

      // Read the subagent's actual messages to get the final output
      let output: string | null = null;
      try {
        const { messages } = await runtime.subagent.getSessionMessages({
          sessionKey,
          limit: 5,
        });

        // Find the last assistant message with text content
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (!msg || msg.role !== "assistant") continue;
            const content = msg.content;
            if (typeof content === "string") {
              output = content;
            } else if (Array.isArray(content)) {
              // Extract text blocks, skip tool calls
              const textParts = content
                .filter((block: { type: string }) => block.type === "text")
                .map((block: { text?: string }) => block.text)
                .filter(Boolean);
              if (textParts.length > 0) {
                output = textParts.join("\n");
              }
            }
            if (output) break;
        }
      } catch {
        // getSessionMessages may fail — that's ok, return null output
      }

      return {
        stepId: step.id,
        discipline: this.discipline,
        output,
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
  for (const d of ["deep", "quick", "visual", "ultrabrain"] as const) {
    map.set(d, getAgent(d));
  }
  return map;
}
