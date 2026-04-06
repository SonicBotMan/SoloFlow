import type { AgentDiscipline, StepId, WorkflowStep } from "../types.js";
import type { ModelSelection, ModelTier } from "./types.js";

// ─── Tier Registry ────────────────────────────────────────────────────

const MODEL_TIERS: readonly ModelTier[] = [
  { name: "cheap", model: "claude-3-haiku", costPer1K: 0.25, maxTokens: 2048, avgLatencyMs: 400 },
  { name: "mid", model: "claude-3-sonnet", costPer1K: 3.0, maxTokens: 4096, avgLatencyMs: 1200 },
  { name: "mid", model: "gpt-4o-mini", costPer1K: 0.15, maxTokens: 4096, avgLatencyMs: 500 },
  { name: "expensive", model: "claude-3-opus", costPer1K: 15.0, maxTokens: 8192, avgLatencyMs: 3000 },
  { name: "expensive", model: "o1", costPer1K: 30.0, maxTokens: 16384, avgLatencyMs: 5000 },
];

// ─── Discipline → Default Tier ────────────────────────────────────────

const DISCIPLINE_TIER: Record<AgentDiscipline, ModelTier["name"]> = {
  quick: "cheap",
  visual: "mid",
  deep: "expensive",
  ultrabrain: "expensive",
};

// ─── Task Complexity Heuristics ───────────────────────────────────────

function estimateComplexity(step: WorkflowStep): number {
  let score = 0;

  const prompt = (step.config["prompt"] as string | undefined) ?? step.name;
  const promptLen = prompt.length;

  if (promptLen > 500) score += 2;
  else if (promptLen > 200) score += 1;

  if (step.dependencies.length > 3) score += 1;
  if (step.dependencies.length > 6) score += 1;

  const configKeys = Object.keys(step.config);
  if (configKeys.includes("analysis") || configKeys.includes("research")) score += 2;
  if (configKeys.includes("convert") || configKeys.includes("format")) score -= 1;

  const discipline = step.discipline;
  if (discipline === "ultrabrain") score += 3;
  if (discipline === "deep") score += 2;
  if (discipline === "quick") score -= 1;

  return Math.max(0, score);
}

function estimateTokens(step: WorkflowStep): number {
  const base = (step.config["maxTokens"] as number | undefined) ?? 2048;
  const prompt = (step.config["prompt"] as string | undefined) ?? step.name;
  const complexity = estimateComplexity(step);
  return Math.min(base + prompt.length * 2 + complexity * 512, 16384);
}

// ─── Load Tracking ────────────────────────────────────────────────────

interface ModelLoad {
  activeRequests: number;
  totalTokensUsed: number;
}

// ─── ModelSelector ────────────────────────────────────────────────────

export class ModelSelector {
  private readonly modelLoads = new Map<string, ModelLoad>();
  private readonly modelOverrides: Partial<Record<AgentDiscipline, string>>;

  constructor(modelOverrides?: Partial<Record<AgentDiscipline, string>>) {
    this.modelOverrides = modelOverrides ?? {};
  }

  selectModel(step: WorkflowStep): ModelSelection {
    const override = this.modelOverrides[step.discipline];
    if (override) {
      return {
        model: override,
        tier: this.tierForModel(override),
        reasoning: `Override for discipline "${step.discipline}"`,
        estimatedTokens: estimateTokens(step),
      };
    }

    const complexity = estimateComplexity(step);
    const baseTier = DISCIPLINE_TIER[step.discipline];

    const targetTier = complexity <= 1
      ? "cheap"
      : complexity <= 3
        ? "mid"
        : "expensive";

    const tier = targetTier === baseTier || this.isTierCheaperOrEqual(targetTier, baseTier)
      ? baseTier
      : targetTier;

    const candidates = MODEL_TIERS.filter((t) => t.name === tier);
    const selected = this.pickLeastLoaded(candidates);

    const tokens = estimateTokens(step);

    return {
      model: selected.model,
      tier: selected.name,
      reasoning: `complexity=${complexity}, discipline=${step.discipline}, tier=${selected.name}`,
      estimatedTokens: tokens,
    };
  }

  recordUsage(model: string, tokens: number): void {
    const load = this.getOrInit(model);
    load.activeRequests = Math.max(0, load.activeRequests - 1);
    load.totalTokensUsed += tokens;
  }

  recordStart(model: string): void {
    const load = this.getOrInit(model);
    load.activeRequests += 1;
  }

  getCurrentLoad(): ReadonlyMap<string, ModelLoad> {
    return this.modelLoads;
  }

  // ── Internal ────────────────────────────────────────────────────────

  private getOrInit(model: string): ModelLoad {
    let load = this.modelLoads.get(model);
    if (!load) {
      load = { activeRequests: 0, totalTokensUsed: 0 };
      this.modelLoads.set(model, load);
    }
    return load;
  }

  private pickLeastLoaded(candidates: readonly ModelTier[]): ModelTier {
    if (candidates.length === 0) return MODEL_TIERS[0]!;
    if (candidates.length === 1) return candidates[0]!;

    let best = candidates[0]!;
    let bestLoad = this.getOrInit(best.model).activeRequests;

    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      const candidateLoad = this.getOrInit(candidate.model).activeRequests;
      if (candidateLoad < bestLoad) {
        best = candidate;
        bestLoad = candidateLoad;
      }
    }

    return best;
  }

  private tierForModel(model: string): ModelTier["name"] {
    const entry = MODEL_TIERS.find((t) => t.model === model);
    return entry?.name ?? "mid";
  }

  private isTierCheaperOrEqual(a: ModelTier["name"], b: ModelTier["name"]): boolean {
    const order: Record<ModelTier["name"], number> = { cheap: 0, mid: 1, expensive: 2 };
    return order[a] <= order[b];
  }
}

export function selectModelForSteps(
  steps: WorkflowStep[],
  overrides?: Partial<Record<AgentDiscipline, string>>,
): Map<StepId, ModelSelection> {
  const selector = new ModelSelector(overrides);
  const result = new Map<StepId, ModelSelection>();
  for (const step of steps) {
    result.set(step.id, selector.selectModel(step));
  }
  return result;
}
