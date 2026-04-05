import type {
  AgentDiscipline,
  AgentResult,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmService,
  OpenClawApi,
  WorkflowStep,
} from "../types";
import { AGENT_DISCIPLINES } from "../types";

// ─── Discipline Configuration ─────────────────────────────────────────

export interface DisciplineConfig {
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  defaultTools: string[];
  systemPrompt: string;
}

export const DISCIPLINE_CONFIGS: Readonly<Record<AgentDiscipline, DisciplineConfig>> = {
  deep: {
    defaultModel: "claude-3-opus",
    maxTokens: 8192,
    temperature: 0.3,
    defaultTools: ["web-search", "code-runner", "data-analysis"],
    systemPrompt:
      "You are a deep-reasoning agent. Perform thorough research, multi-step analysis, and produce well-structured, detailed output. Prefer correctness over speed.",
  },

  quick: {
    defaultModel: "claude-3-haiku",
    maxTokens: 2048,
    temperature: 0.5,
    defaultTools: ["web-search", "http-request"],
    systemPrompt:
      "You are a fast-response agent. Complete the task quickly with a concise answer. Optimise for speed and brevity.",
  },

  visual: {
    defaultModel: "claude-3-sonnet",
    maxTokens: 4096,
    temperature: 0.6,
    defaultTools: ["image-gen", "screenshot", "browser"],
    systemPrompt:
      "You are a visual/frontend agent. Focus on UI design, frontend code, image generation, and visual quality. Produce pixel-perfect output.",
  },

  ultrabrain: {
    defaultModel: "o1",
    maxTokens: 16384,
    temperature: 0.2,
    defaultTools: ["code-runner", "data-analysis", "web-search"],
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
        score += kw.length; // longer keyword matches are stronger signals
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
  readonly tools: string[];
  currentWorkflow: string | null = null;

  constructor(discipline: AgentDiscipline) {
    this.discipline = discipline;
    this.config = DISCIPLINE_CONFIGS[discipline];
    this.tools = [...this.config.defaultTools];
  }

  /** Classify an arbitrary input string to a discipline. */
  classify(input: string): AgentDiscipline {
    return routeToDiscipline(input);
  }

  /**
   * Execute a workflow step.
   * Delegates to `executeViaOpenClaw` when an `OpenClawApi` is available.
   * Returns an error result when no OpenClaw runtime is provided.
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

    return this.executeViaOpenClaw(step, api);
  }

  async executeViaOpenClaw(
    step: WorkflowStep,
    api: OpenClawApi,
  ): Promise<AgentResult> {
    const startedAt = Date.now();
    this.currentWorkflow = step.id as unknown as string;

    try {
      api.logger.debug(
        `[discipline:${this.discipline}] executing step "${step.name}" (${step.id})`,
      );

      let llm: LlmService;
      try {
        llm = api.services.get<LlmService>("openclaw.llm");
      } catch {
        api.logger.error(
          `[discipline:${this.discipline}] OpenClaw LLM service not available — ` +
          `register an "openclaw.llm" service or install an LLM provider plugin`,
        );
        return {
          stepId: step.id,
          discipline: this.discipline,
          output: null,
          durationMs: Date.now() - startedAt,
          error: "OpenClaw LLM not configured — no 'openclaw.llm' service found",
        };
      }

      const request: LlmCompletionRequest = {
        model: this.config.defaultModel,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [
          { role: "system", content: this.config.systemPrompt },
          {
            role: "user",
            content: (step.config["prompt"] as string) ?? step.name,
          },
        ],
      };

      const response: LlmCompletionResponse = await llm.complete(request);

      return {
        stepId: step.id,
        discipline: this.discipline,
        output: response.content,
        tokensUsed: response.usage.total_tokens,
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
