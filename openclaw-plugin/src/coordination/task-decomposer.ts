import type { LlmService, StepId, WorkflowStep } from "../types";
import type { CoordinationEventHandler } from "./types";

// ─── Decomposition Config ─────────────────────────────────────────────

interface DecompositionConfig {
  /** Maximum depth of recursive decomposition */
  maxDepth: number;
  /** Maximum children per decomposition */
  maxChildren: number;
  /** Model to use for decomposition planning */
  planningModel: string;
}

const DEFAULT_DECOMP_CONFIG: DecompositionConfig = {
  maxDepth: 3,
  maxChildren: 6,
  planningModel: "claude-3-haiku",
};

// ─── TaskDecomposer ───────────────────────────────────────────────────

export class TaskDecomposer {
  private readonly config: DecompositionConfig;
  private readonly eventHandler?: CoordinationEventHandler;

  constructor(
    config?: Partial<DecompositionConfig>,
    eventHandler?: CoordinationEventHandler,
  ) {
    this.config = { ...DEFAULT_DECOMP_CONFIG, ...config };
    this.eventHandler = eventHandler;
  }

  async decompose(
    complexTask: WorkflowStep,
    llm?: LlmService,
  ): Promise<WorkflowStep[]> {
    if (!this.shouldDecompose(complexTask)) {
      return [complexTask];
    }

    if (!llm) {
      return this.heuristicDecompose(complexTask);
    }

    return this.llmDecompose(complexTask, llm);
  }

  async decomposeAll(
    steps: WorkflowStep[],
    llm?: LlmService,
  ): Promise<Map<StepId, WorkflowStep[]>> {
    const result = new Map<StepId, WorkflowStep[]>();

    for (const step of steps) {
      const decomposed = await this.decompose(step, llm);
      result.set(step.id, decomposed);

      if (decomposed.length > 1) {
        this.eventHandler?.({
          type: "task:decomposed",
          parentStepId: step.id,
          childCount: decomposed.length,
        });
      }
    }

    return result;
  }

  // ── Decomposition Decision ──────────────────────────────────────────

  private shouldDecompose(step: WorkflowStep): boolean {
    const prompt = (step.config["prompt"] as string | undefined) ?? step.name;

    if (step.dependencies.length > 4) return true;

    const compoundSignals = [" and ", " then ", " after that ", "; "];
    const signalCount = compoundSignals.filter((s) => prompt.toLowerCase().includes(s)).length;
    if (signalCount >= 2) return true;

    if (step.discipline === "ultrabrain" && prompt.length > 300) return true;

    return false;
  }

  // ── Heuristic Decomposition ─────────────────────────────────────────

  private heuristicDecompose(task: WorkflowStep): WorkflowStep[] {
    const prompt = (task.config["prompt"] as string | undefined) ?? task.name;
    const separators = ["; ", "\n", " and ", " then "];

    let parts: string[] = [];
    for (const sep of separators) {
      const split = prompt.split(sep).map((s) => s.trim()).filter(Boolean);
      if (split.length > 1) {
        parts = split;
        break;
      }
    }

    if (parts.length <= 1) {
      return [task];
    }

    const children = parts.slice(0, this.config.maxChildren).map(
      (part, index): WorkflowStep => ({
        id: `${task.id}_sub${index}` as StepId,
        name: part,
        discipline: task.discipline,
        dependencies: index > 0 ? [`${task.id}_sub${index - 1}` as StepId] : task.dependencies,
        config: { ...task.config, prompt: part },
        state: "pending",
      }),
    );

    return children;
  }

  // ── LLM-Based Decomposition ─────────────────────────────────────────

  private async llmDecompose(
    task: WorkflowStep,
    llm: LlmService,
  ): Promise<WorkflowStep[]> {
    const prompt = (task.config["prompt"] as string | undefined) ?? task.name;

    const response = await llm.complete({
      model: this.config.planningModel,
      max_tokens: 2048,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a task decomposition planner. Break the given task into 2-6 subtasks. " +
            "Output ONLY a JSON array of objects with fields: {name, prompt}. " +
            "Each subtask should be independently executable. No explanation.",
        },
        {
          role: "user",
          content: `Decompose this task (discipline: ${task.discipline}):\n${prompt}`,
        },
      ],
    });

    try {
      const parsed = JSON.parse(response.content) as Array<{ name: string; prompt: string }>;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [task];
      }

      const children = parsed.slice(0, this.config.maxChildren).map(
        (item, index): WorkflowStep => ({
          id: `${task.id}_sub${index}` as StepId,
          name: item.name,
          discipline: task.discipline,
          dependencies: index > 0 ? [`${task.id}_sub${index - 1}` as StepId] : task.dependencies,
          config: { ...task.config, prompt: item.prompt },
          state: "pending",
        }),
      );

      return children;
    } catch {
      return this.heuristicDecompose(task);
    }
  }
}
