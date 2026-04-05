import type { AgentDiscipline, Workflow } from "../types";
import type { DetectedTask, TaskPattern } from "./types";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MIN_PATTERN_OCCURRENCES = 2;

function normalize(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, " ");
}

function stepSignature(name: string, discipline: AgentDiscipline): string {
  return `${discipline}:${normalize(name)}`;
}

function configKeys(config: Record<string, unknown>): string[] {
  return Object.keys(config).sort();
}

export class TaskDetector {
  private taskHistory: DetectedTask[] = [];

  detectTasks(workflow: Workflow): DetectedTask | null {
    if (workflow.state !== "completed") return null;

    const steps = Array.from(workflow.steps.values());
    if (steps.length === 0) return null;

    const completedSteps = steps.filter((s) => s.state === "completed");
    if (completedSteps.length === 0) return null;

    const durationMs =
      completedSteps.reduce((sum, s) => {
        const stepDuration =
          s.completedAt && s.startedAt ? s.completedAt - s.startedAt : 0;
        return sum + stepDuration;
      }, 0);

    if (durationMs > TWO_HOURS_MS) return null;

    const detectedSteps = completedSteps.map((s) => ({
      name: s.name,
      discipline: s.discipline,
      config: s.config,
      signature: stepSignature(s.name, s.discipline),
      completedAt: s.completedAt,
    }));

    const signatureSequence = detectedSteps
      .map((s) => s.signature)
      .join("|");

    const task: DetectedTask = {
      workflowId: workflow.id as unknown as string,
      workflowName: workflow.name,
      steps: detectedSteps,
      signatureSequence,
      durationMs,
      completedAt: workflow.updatedAt,
    };

    this.taskHistory.push(task);
    return task;
  }

  findPatterns(taskHistory?: DetectedTask[]): TaskPattern[] {
    const history = taskHistory ?? this.taskHistory;
    if (history.length < MIN_PATTERN_OCCURRENCES) return [];

    const groups = new Map<string, DetectedTask[]>();
    for (const task of history) {
      const existing = groups.get(task.signatureSequence);
      if (existing) {
        existing.push(task);
      } else {
        groups.set(task.signatureSequence, [task]);
      }
    }

    const patterns: TaskPattern[] = [];

    for (const [signature, tasks] of groups) {
      if (tasks.length < MIN_PATTERN_OCCURRENCES) continue;

      const reference = tasks[0]!;
      const stepSignatures = signature.split("|");
      const disciplines = reference.steps.map((s) => s.discipline);

      const paramTemplates = reference.steps.map((s) => {
        const keys = configKeys(s.config);
        const template: Record<string, unknown> = {};
        for (const key of keys) {
          template[key] = typeof s.config[key];
        }
        return template;
      });

      patterns.push({
        id: `pattern-${signature.replace(/[^a-z0-9]/g, "-")}`,
        stepSignatures,
        paramTemplates,
        occurrenceCount: tasks.length,
        lastSeen: Math.max(...tasks.map((t) => t.completedAt)),
        workflowIds: tasks.map((t) => t.workflowId),
        disciplines,
      });
    }

    return patterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  }

  getHistory(): ReadonlyArray<DetectedTask> {
    return this.taskHistory;
  }

  clearHistory(): void {
    this.taskHistory = [];
  }
}
