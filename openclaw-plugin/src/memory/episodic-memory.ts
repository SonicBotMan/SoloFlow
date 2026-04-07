import type { Workflow, WorkflowId, AgentDiscipline } from "../types.js";
import type {
  MemoryNamespace,
  EpisodicEntry,
  MemoryQuery,
  MemoryResultEntry,
} from "./types.js";

const DEFAULT_EPISODIC_CAPACITY = 500;
const DEFAULT_COMPRESSION_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export class EpisodicMemory {
  private readonly store = new Map<string, EpisodicEntry>();
  private persistCallback: ((entry: EpisodicEntry) => void) | null = null;
  private readonly capacity: number;
  private readonly compressionThresholdMs: number;
  private readonly namespace: MemoryNamespace;

  constructor(
    namespace: MemoryNamespace,
    capacity = DEFAULT_EPISODIC_CAPACITY,
    compressionThresholdMs = DEFAULT_COMPRESSION_THRESHOLD_MS,
  ) {
    this.namespace = namespace;
    this.capacity = capacity;
    this.compressionThresholdMs = compressionThresholdMs;
  }

  storeExecution(workflow: Workflow): EpisodicEntry {
    // Deduplicate: remove old entry for this workflow (keep only latest)
    for (const [key, entry] of this.store) {
      if (entry.workflowId === workflow.id) {
        this.store.delete(key);
        break;
      }
    }
    if (this.deletePersistCallback) {
      try { this.deletePersistCallback(workflow.id); } catch { /* non-critical */ }
    }

    const now = Date.now();
    const durationMs = this.computeDuration(workflow);

    const stepSummary = Array.from(workflow.steps.values()).map((step) => ({
      stepId: step.id,
      name: step.name,
      discipline: step.discipline as AgentDiscipline,
      durationMs:
        step.startedAt && step.completedAt ? step.completedAt - step.startedAt : 0,
      success: step.state === "completed",
    }));

    const entry: EpisodicEntry = {
      id: `ep_${this.namespace}_${now}_${Math.random().toString(36).slice(2, 8)}`,
      namespace: this.namespace,
      workflowId: workflow.id,
      workflowName: workflow.name,
      finalState: workflow.state,
      durationMs,
      stepSummary,
      compressed: false,
      rawData: this.serializeWorkflow(workflow),
      source: "workflow_execution",
      tags: [workflow.name, workflow.state, ...this.extractDisciplines(stepSummary)],
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(entry.id, entry);
    if (this.persistCallback) {
      try { this.persistCallback(entry); } catch { /* non-critical */ }
    }
    this.triggerCompressionIfNeeded();
    this.evictIfNeeded();

    return entry;
  }

  getRecentExecutions(limit = 10): EpisodicEntry[] {
    const sorted = Array.from(this.store.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    return sorted.slice(0, limit);
  }

  getByWorkflow(workflowId: WorkflowId): EpisodicEntry[] {
    const results: EpisodicEntry[] = [];
    for (const entry of this.store.values()) {
      if (entry.workflowId === workflowId) results.push(entry);
    }
    return results;
  }

  searchExecutions(query: MemoryQuery): MemoryResultEntry[] {
    const text = query.text?.toLowerCase();
    const tags = query.tags;
    const results: MemoryResultEntry[] = [];

    for (const entry of this.store.values()) {
      let score = 1.0;

      if (query.workflowId && entry.workflowId !== query.workflowId) continue;

      if (text) {
        const haystack = this.entryToSearchable(entry);
        if (!haystack.includes(text)) continue;
        score = 0.5 + 0.5 * (text.length / haystack.length);
      }

      if (tags?.length) {
        const hasAll = tags.every((t) => entry.tags.includes(t));
        if (!hasAll) continue;
      }

      results.push({ tier: "episodic", entry, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, query.limit ?? 10);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  all(): EpisodicEntry[] {
    return Array.from(this.store.values());
  }

  /** Restore entries from an external store (e.g., SQLite) */
  restoreEntries(entries: EpisodicEntry[]): void {
    for (const entry of entries) {
      this.store.set(entry.id, entry);
    }
  }

  private deletePersistCallback: ((workflowId: string) => void) | null = null;

  /** Set an external persist callback — called on every storeExecution() */
  setPersistCallback(cb: (entry: EpisodicEntry) => void): void {
    this.persistCallback = cb;
  }

  setDeletePersistCallback(cb: (workflowId: string) => void): void {
    this.deletePersistCallback = cb;
  }

  compressOldEntries(): number {
    const threshold = Date.now() - this.compressionThresholdMs;
    let compressed = 0;

    for (const [id, entry] of this.store) {
      if (!entry.compressed && entry.createdAt < threshold) {
        const compressedEntry: EpisodicEntry = {
          ...entry,
          rawData: undefined,
          compressed: true,
          source: "compressed_dag",
          tags: [...entry.tags, "compressed"],
          updatedAt: Date.now(),
        };
        this.store.set(id, compressedEntry);
        compressed++;
      }
    }

    return compressed;
  }

  private computeDuration(workflow: Workflow): number {
    let earliest = Infinity;
    let latest = 0;
    for (const step of workflow.steps.values()) {
      if (step.startedAt != null && step.startedAt < earliest) earliest = step.startedAt;
      if (step.completedAt != null && step.completedAt > latest) latest = step.completedAt;
    }
    if (earliest === Infinity) return 0;
    return latest - earliest;
  }

  private serializeWorkflow(workflow: Workflow): unknown {
    return {
      id: workflow.id,
      name: workflow.name,
      state: workflow.state,
      steps: Array.from(workflow.steps.entries()).map(([id, step]) => ({
        id,
        name: step.name,
        state: step.state,
        result: step.result,
        error: step.error,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      })),
      metadata: workflow.metadata,
    };
  }

  private extractDisciplines(
    summary: ReadonlyArray<{ discipline: AgentDiscipline }>,
  ): string[] {
    const disciplines = new Set(summary.map((s) => s.discipline));
    return Array.from(disciplines);
  }

  private entryToSearchable(entry: EpisodicEntry): string {
    const parts = [
      entry.workflowName,
      entry.finalState,
      ...entry.tags,
      ...entry.stepSummary.map((s) => `${s.name} ${s.discipline} ${s.success ? "success" : "failure"}`),
    ];
    // Also index raw data (step results)
    if (entry.rawData && typeof entry.rawData === 'object' && Array.isArray((entry.rawData as any).steps)) {
      for (const step of (entry.rawData as any).steps) {
        if (step.result) {
          parts.push(String(step.result));
        }
      }
    }
    return parts.join(" ").toLowerCase();
  }

  private triggerCompressionIfNeeded(): void {
    if (this.store.size > this.capacity * 0.8) {
      this.compressOldEntries();
    }
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.capacity) {
      let oldestCompressed: EpisodicEntry | undefined;
      for (const entry of this.store.values()) {
        if (entry.compressed) {
          if (!oldestCompressed || entry.createdAt < oldestCompressed.createdAt) {
            oldestCompressed = entry;
          }
        }
      }
      if (oldestCompressed) {
        this.store.delete(oldestCompressed.id);
      } else {
        let oldest: EpisodicEntry | undefined;
        for (const entry of this.store.values()) {
          if (!oldest || entry.createdAt < oldest.createdAt) {
            oldest = entry;
          }
        }
        if (oldest) this.store.delete(oldest.id);
      }
    }
  }
}
