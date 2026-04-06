import type { AgentDiscipline, DAG, StepId, WorkflowStep } from "../types.js";
import type { AgentTeam, TeamConfig, TeamMember, TeamYaml } from "./types.js";
import { ModelSelector } from "./model-selector.js";

// ─── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_TEAM_CONFIG: TeamConfig = {
  maxMembersPerDiscipline: 3,
  defaultMaxCapacity: 4,
  enableLoadBalancing: true,
};

// ─── TeamBuilder ──────────────────────────────────────────────────────

export class TeamBuilder {
  private readonly config: TeamConfig;
  private readonly modelSelector: ModelSelector;

  constructor(config?: Partial<TeamConfig>) {
    this.config = { ...DEFAULT_TEAM_CONFIG, ...config };
    this.modelSelector = new ModelSelector(config?.modelOverrides);
  }

  buildTeamFromDAG(
    dag: DAG,
    steps: Map<StepId, WorkflowStep>,
    teamName: string,
  ): AgentTeam {
    const members = this.buildMembers(dag, steps);
    const yaml = this.buildYaml(teamName, members, dag);

    return {
      id: `team-${teamName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      name: teamName,
      members,
      yaml,
      createdAt: Date.now(),
    };
  }

  getModelSelector(): ModelSelector {
    return this.modelSelector;
  }

  // ── Member Construction ─────────────────────────────────────────────

  private buildMembers(
    dag: DAG,
    steps: Map<StepId, WorkflowStep>,
  ): TeamMember[] {
    const disciplineSlots = new Map<AgentDiscipline, TeamMember[]>();

    for (let layerIdx = 0; layerIdx < dag.layers.length; layerIdx++) {
      const layer = dag.layers[layerIdx]!;

      for (const stepId of layer) {
        const step = steps.get(stepId);
        if (!step) continue;

        const selection = this.modelSelector.selectModel(step);
        const discipline = step.discipline;

        let slots = disciplineSlots.get(discipline);
        if (!slots) {
          slots = [];
          disciplineSlots.set(discipline, slots);
        }

        let member = this.findOrCreateMember(slots, stepId, layerIdx, {
          discipline,
          model: selection.model,
          skills: [],
        });

        member.assignedSteps.push(stepId);
      }
    }

    return Array.from(disciplineSlots.values()).flat();
  }

  private findOrCreateMember(
    slots: TeamMember[],
    stepId: StepId,
    layerIdx: number,
    props: {
      discipline: AgentDiscipline;
      model: string;
      skills: string[];
    },
  ): TeamMember {
    const maxMembers = this.config.maxMembersPerDiscipline;

    const available = slots.find(
      (m) =>
        m.assignedSteps.length < m.maxCapacity &&
        m.layer === layerIdx,
    );

    if (available) return available;

    if (slots.length < maxMembers) {
      const member: TeamMember = {
        id: `${props.discipline}-agent-${slots.length + 1}`,
        name: `${props.discipline.charAt(0).toUpperCase() + props.discipline.slice(1)} Agent ${slots.length + 1}`,
        discipline: props.discipline,
        model: props.model,
        skills: props.skills,
        load: 0,
        maxCapacity: this.config.defaultMaxCapacity,
        activeTasks: 0,
        layer: layerIdx,
        assignedSteps: [],
      };
      slots.push(member);
      return member;
    }

    const leastLoaded = slots.reduce((a, b) =>
      a.assignedSteps.length <= b.assignedSteps.length ? a : b,
    );

    void stepId;
    return leastLoaded;
  }

  // ── YAML Generation ─────────────────────────────────────────────────

  private buildYaml(
    teamName: string,
    members: TeamMember[],
    dag: DAG,
  ): TeamYaml {
    const disciplineLabels: Record<string, string> = {};
    for (const m of members) {
      disciplineLabels[m.discipline] = "true";
    }

    return {
      apiVersion: "openclaw.ai/v1",
      kind: "AgentTeam",
      metadata: {
        name: teamName.toLowerCase().replace(/\s+/g, "-"),
        labels: {
          "app.kubernetes.io/managed-by": "soloflow",
          "soloflow.io/team-type": "multi-agent",
          ...disciplineLabels,
        },
      },
      spec: {
        members: members.map((m) => ({
          id: m.id,
          name: m.name,
          discipline: m.discipline,
          model: m.model,
          skills: m.skills,
          maxConcurrent: m.maxCapacity,
        })),
        execution: {
          layers: dag.layers.map((layer, idx) => ({
            index: idx,
            parallel: layer.length > 1,
            steps: Array.from(layer),
          })),
        },
      },
    };
  }
}

export function buildTeamFromDAG(
  dag: DAG,
  steps: Map<StepId, WorkflowStep>,
  teamName: string,
  config?: Partial<TeamConfig>,
): AgentTeam {
  const builder = new TeamBuilder(config);
  return builder.buildTeamFromDAG(dag, steps, teamName);
}
