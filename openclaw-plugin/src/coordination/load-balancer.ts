import type { StepId, WorkflowStep } from "../types.js";
import type { LoadBalancingConfig, TeamMember } from "./types.js";

// ─── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: LoadBalancingConfig = {
  strategy: "round-robin",
  disciplineWeight: 0.7,
  maxLoadThreshold: 0.9,
};

// ─── LoadBalancer ─────────────────────────────────────────────────────

export class LoadBalancer {
  private readonly config: LoadBalancingConfig;
  private roundRobinIndex = 0;

  constructor(config?: Partial<LoadBalancingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  assignTask(members: TeamMember[], task: WorkflowStep): TeamMember {
    const candidates = members.filter(
      (m) => m.load < this.config.maxLoadThreshold,
    );

    if (candidates.length === 0) {
      return this.pickFromAll(members, task);
    }

    const disciplineMatches = candidates.filter(
      (m) => m.discipline === task.discipline,
    );

    if (disciplineMatches.length > 0 && Math.random() < this.config.disciplineWeight) {
      return this.pickByStrategy(disciplineMatches);
    }

    return this.pickByStrategy(candidates);
  }

  assignTasks(
    members: TeamMember[],
    tasks: WorkflowStep[],
  ): Map<StepId, TeamMember> {
    const assignments = new Map<StepId, TeamMember>();

    const mutableMembers = members.map((m) => ({
      ...m,
      load: m.load,
      activeTasks: m.activeTasks,
    }));

    for (const task of tasks) {
      const member = this.assignTask(mutableMembers, task);
      assignments.set(task.id, member);

      const idx = mutableMembers.findIndex((m) => m.id === member.id);
      if (idx !== -1) {
        const target = mutableMembers[idx]!;
        target.activeTasks += 1;
        target.load = target.activeTasks / target.maxCapacity;
      }
    }

    return assignments;
  }

  updateLoad(memberId: string, members: TeamMember[], completed: boolean): TeamMember[] {
    return members.map((m) => {
      if (m.id !== memberId) return m;
      const newActive = completed
        ? Math.max(0, m.activeTasks - 1)
        : m.activeTasks + 1;
      return {
        ...m,
        activeTasks: newActive,
        load: newActive / m.maxCapacity,
      };
    });
  }

  reset(): void {
    this.roundRobinIndex = 0;
  }

  // ── Strategy Dispatch ───────────────────────────────────────────────

  private pickByStrategy(candidates: TeamMember[]): TeamMember {
    switch (this.config.strategy) {
      case "round-robin":
        return this.pickRoundRobin(candidates);
      case "least-loaded":
        return this.pickLeastLoaded(candidates);
      case "random":
        return this.pickRandom(candidates);
    }
  }

  private pickRoundRobin(candidates: TeamMember[]): TeamMember {
    const idx = this.roundRobinIndex % candidates.length;
    this.roundRobinIndex++;
    return candidates[idx]!;
  }

  private pickLeastLoaded(candidates: TeamMember[]): TeamMember {
    let best = candidates[0]!;
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      if (candidate.load < best.load) {
        best = candidate;
      }
    }
    return best;
  }

  private pickRandom(candidates: TeamMember[]): TeamMember {
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx]!;
  }

  private pickFromAll(members: TeamMember[], task: WorkflowStep): TeamMember {
    if (members.length === 0) {
      throw new Error("No team members available for task assignment");
    }

    const match = members.find((m) => m.discipline === task.discipline);
    if (match) return match;

    return members.reduce((a, b) => (a.load <= b.load ? a : b));
  }
}

export function createDefaultBalancer(): LoadBalancer {
  return new LoadBalancer(DEFAULT_CONFIG);
}
