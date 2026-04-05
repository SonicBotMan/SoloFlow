import type { OpenClawApi, Workflow } from "../types";
import type {
  DetectedTask,
  Skill,
  SkillEvolutionEvent,
  SkillScore,
  TaskPattern,
} from "./types";
import { TaskDetector } from "./task-detector";
import { SkillEvolver } from "./evolver";
import { SkillRegistry } from "./registry";

type EvolutionListener = (event: SkillEvolutionEvent) => void;

const AUTO_INSTALL_THRESHOLD = 0.7;

export class SkillEvolutionSystem {
  private detector: TaskDetector;
  private evolver: SkillEvolver;
  private registry: SkillRegistry;
  private listeners = new Set<EvolutionListener>();

  constructor(
    api: OpenClawApi,
    dbPath?: string,
  ) {
    this.detector = new TaskDetector();
    this.evolver = new SkillEvolver(api);
    this.registry = new SkillRegistry(dbPath);
  }

  async onWorkflowComplete(workflow: Workflow): Promise<void> {
    const task = this.detector.detectTasks(workflow);
    if (!task) return;

    const patterns = this.detector.findPatterns();

    for (const pattern of patterns) {
      if (pattern.workflowIds.includes(task.workflowId)) {
        await this.processPattern(pattern);
      }
    }
  }

  async suggestSkills(
    taskDescription: string,
  ): Promise<Array<{ skill: Skill; relevance: number }>> {
    const allSkills = this.registry.list();
    const query = taskDescription.toLowerCase();

    const scored = allSkills
      .map((skill) => {
        const nameMatch = skill.name.toLowerCase().includes(query) ? 0.5 : 0;
        const descMatch = skill.description.toLowerCase().includes(query) ? 0.3 : 0;

        const stepMatch = skill.steps.reduce((acc, step) => {
          return acc + (step.action.toLowerCase().includes(query) ? 0.2 : 0);
        }, 0);

        const skillScore = this.evolver.scoreSkill(skill);

        return {
          skill,
          relevance: Math.min(nameMatch + descMatch + stepMatch + skillScore.score * 0.3, 1),
        };
      })
      .filter((item) => item.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);

    return scored;
  }

  getTopSkills(limit = 10): Array<{ skill: Skill; score: SkillScore }> {
    const allSkills = this.registry.list();

    return allSkills
      .map((skill) => ({
        skill,
        score: this.evolver.scoreSkill(skill),
      }))
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, limit);
  }

  getDetector(): TaskDetector {
    return this.detector;
  }

  getEvolver(): SkillEvolver {
    return this.evolver;
  }

  getRegistry(): SkillRegistry {
    return this.registry;
  }

  getDetectedPatterns(): TaskPattern[] {
    return this.detector.findPatterns();
  }

  getTaskHistory(): ReadonlyArray<DetectedTask> {
    return this.detector.getHistory();
  }

  subscribe(listener: EvolutionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.listeners.clear();
    this.registry.close();
    this.detector.clearHistory();
  }

  private emit(event: SkillEvolutionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // swallow listener errors
      }
    }
  }

  private async processPattern(pattern: TaskPattern): Promise<void> {
    this.emit({ type: "skill:detected", pattern });

    const existing = this.registry.search(pattern.stepSignatures.join(" "));
    const existingMatch = existing.find(
      (s) =>
        s.sourceWorkflowIds.length === pattern.workflowIds.length &&
        s.sourceWorkflowIds.every((id) => pattern.workflowIds.includes(id)),
    );
    if (existingMatch) return;

    const skill = await this.evolver.evaluateAndGenerate(pattern, {
      occurrenceCount: pattern.occurrenceCount,
    });
    if (!skill) return;

    this.emit({ type: "skill:generated", skill });

    const score = this.evolver.scoreSkill(skill);
    this.emit({ type: "skill:scored", score });

    if (score.score >= AUTO_INSTALL_THRESHOLD) {
      this.registry.installSkill(skill);
      this.emit({ type: "skill:installed", skillId: skill.id });
    } else {
      this.registry.register(skill);
    }
  }
}
