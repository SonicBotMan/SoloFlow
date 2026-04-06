/**
 * SoloFlow — Agent Entry Point
 *
 * Routes step execution to the appropriate DisciplineAgent.
 * Each step runs in its own OpenClaw subagent session with full tool access.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type {
  AgentConfig,
  AgentDiscipline,
  AgentResult,
  WorkflowStep,
} from "../types.js"

export { AGENT_DISCIPLINES } from "../types.js"
export type { AgentConfig, AgentDiscipline, AgentResult } from "../types.js"

const disciplineDefaults: Record<AgentDiscipline, Partial<AgentConfig>> = {
  deep: { maxTokens: 8192, temperature: 0.3 },
  quick: { maxTokens: 2048, temperature: 0.5 },
  visual: { maxTokens: 4096, temperature: 0.6 },
  ultrabrain: { maxTokens: 16384, temperature: 0.2 },
};

export function getDefaultConfig(discipline: AgentDiscipline): Partial<AgentConfig> {
  return disciplineDefaults[discipline] ?? {};
}

export interface StepExecutionContext {
  /** The OpenClaw plugin API (provides api.runtime.subagent) */
  api: OpenClawPluginApi;
  /** Results from upstream steps (keyed by step ID) */
  upstreamResults: ReadonlyMap<string, AgentResult>;
  /** Parent workflow name (for prompt context) */
  workflowName: string;
}

/**
 * Execute a single workflow step via OpenClaw subagent.
 *
 * The subagent gets its own isolated session with full access to all
 * OpenClaw tools (ezviz_capture, image, message, browser, etc.).
 * Upstream step outputs are injected as context in the prompt.
 */
export async function executeAgentStep(
  step: WorkflowStep,
  ctx: StepExecutionContext,
  override?: Partial<AgentConfig>,
): Promise<AgentResult> {
  const defaults = getDefaultConfig(step.discipline);
  void { ...defaults, ...override, discipline: step.discipline };

  const { DisciplineAgent } = await import("./discipline.js");
  const agent = new DisciplineAgent(step.discipline);
  return agent.execute(
    step,
    ctx.api,
    ctx.upstreamResults,
    ctx.workflowName,
  );
}
