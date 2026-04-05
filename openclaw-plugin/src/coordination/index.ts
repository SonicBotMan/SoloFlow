/**
 * SoloFlow — Multi-Agent Coordination
 *
 * Main entry point: MultiAgentCoordinator combines team building,
 * model selection, load balancing, and task decomposition into a
 * single coordination pipeline.
 */

import type { OpenClawApi, Workflow } from "../types";
import type {
  CoordinationEventHandler,
  CoordinationResult,
  LoadBalancingConfig,
  TeamConfig,
} from "./types";

import { TeamBuilder } from "./team-builder";
import { ModelSelector } from "./model-selector";
import { LoadBalancer } from "./load-balancer";
import { TaskDecomposer } from "./task-decomposer";

// ─── Coordinator Config ───────────────────────────────────────────────

interface CoordinatorConfig {
  team: Partial<TeamConfig>;
  loadBalancing: Partial<LoadBalancingConfig>;
  enableDecomposition: boolean;
}

const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
  team: {
    maxMembersPerDiscipline: 3,
    defaultMaxCapacity: 4,
    enableLoadBalancing: true,
  },
  loadBalancing: {
    strategy: "round-robin",
    disciplineWeight: 0.7,
    maxLoadThreshold: 0.9,
  },
  enableDecomposition: true,
};

// ─── MultiAgentCoordinator ────────────────────────────────────────────

export class MultiAgentCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly eventHandlers: CoordinationEventHandler[] = [];

  readonly teamBuilder: TeamBuilder;
  readonly modelSelector: ModelSelector;
  readonly loadBalancer: LoadBalancer;
  readonly taskDecomposer: TaskDecomposer;

  constructor(config?: Partial<CoordinatorConfig>) {
    this.config = { ...DEFAULT_COORDINATOR_CONFIG, ...config };

    this.teamBuilder = new TeamBuilder(this.config.team);
    this.modelSelector = this.teamBuilder.getModelSelector();
    this.loadBalancer = new LoadBalancer(this.config.loadBalancing);
    this.taskDecomposer = new TaskDecomposer(undefined, (event) => {
      this.emit(event);
    });
  }

  onEvent(handler: CoordinationEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx !== -1) this.eventHandlers.splice(idx, 1);
    };
  }

  async coordinate(
    workflow: Workflow,
    api: OpenClawApi,
  ): Promise<CoordinationResult> {
    api.logger.info(
      `[coordinator] Starting coordination for workflow "${workflow.name}" ` +
      `(${workflow.steps.size} steps, ${workflow.dag.layers.length} layers)`,
    );

    const steps = Array.from(workflow.steps.values());

    const decomposedSteps = new Map(
      steps.map((s) => [s.id, [s] as typeof steps]),
    );

    if (this.config.enableDecomposition) {
      let llm;
      try {
        llm = api.services.get<{ complete: unknown }>("openclaw.llm") as
          | { complete: (req: unknown) => Promise<{ content: string }> }
          | undefined;
      } catch {
        llm = undefined;
      }

      const decompResults = await this.taskDecomposer.decomposeAll(
        steps,
        llm as Parameters<typeof this.taskDecomposer.decomposeAll>[1],
      );
      for (const [stepId, subSteps] of decompResults) {
        decomposedSteps.set(stepId, subSteps);
      }
    }

    const team = this.teamBuilder.buildTeamFromDAG(
      workflow.dag,
      workflow.steps,
      workflow.name,
    );

    this.emit({
      type: "team:created",
      teamId: team.id,
      memberCount: team.members.length,
    });

    const assignments = this.loadBalancer.assignTasks(
      team.members,
      steps,
    );

    for (const [stepId, member] of assignments) {
      this.emit({ type: "task:assigned", stepId, memberId: member.id });
    }

    const modelSelections = new Map(
      steps.map((s) => [s.id, this.modelSelector.selectModel(s)] as const),
    );

    for (const [stepId, selection] of modelSelections) {
      this.emit({
        type: "model:selected",
        stepId,
        model: selection.model,
        tier: selection.tier,
      });
    }

    api.logger.info(
      `[coordinator] Team assembled: ${team.members.length} members, ` +
      `assignments: ${assignments.size}, models: ${new Set(modelSelections.values()).size} unique`,
    );

    return {
      team,
      assignments,
      modelSelections,
      decomposedSteps,
    };
  }

  private emit(event: Parameters<CoordinationEventHandler>[0]): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // swallow event handler errors
      }
    }
  }
}

// ─── Re-exports ───────────────────────────────────────────────────────

export { TeamBuilder } from "./team-builder";
export { ModelSelector } from "./model-selector";
export { LoadBalancer } from "./load-balancer";
export { TaskDecomposer } from "./task-decomposer";
export type {
  AgentTeam,
  TeamMember,
  TeamConfig,
  TeamYaml,
  ModelSelection,
  ModelTier,
  LoadBalancingConfig,
  CoordinationEvent,
  CoordinationEventHandler,
  CoordinationResult,
} from "./types";
