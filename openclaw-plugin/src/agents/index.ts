import type { AgentConfig, AgentDiscipline, AgentResult, OpenClawApi, WorkflowStep } from "../types";

export { AGENT_DISCIPLINES } from "../types";
export type { AgentConfig, AgentDiscipline, AgentResult } from "../types";

const disciplineDefaults: Record<AgentDiscipline, Partial<AgentConfig>> = {
  deep: { maxTokens: 8192, temperature: 0.3 },
  quick: { maxTokens: 2048, temperature: 0.5 },
  visual: { maxTokens: 4096, temperature: 0.6 },
  ultrabrain: { maxTokens: 16384, temperature: 0.2 },
};

export function getDefaultConfig(discipline: AgentDiscipline): Partial<AgentConfig> {
  return disciplineDefaults[discipline] ?? {};
}

export async function executeAgentStep(
  step: WorkflowStep,
  api: OpenClawApi,
  override?: Partial<AgentConfig>,
): Promise<AgentResult> {
  const defaults = getDefaultConfig(step.discipline);
  const config: AgentConfig = { ...defaults, ...override, discipline: step.discipline };

  void config;

  const { DisciplineAgent } = await import("./discipline");
  const agent = new DisciplineAgent(step.discipline);
  return agent.execute(step, api);
}
