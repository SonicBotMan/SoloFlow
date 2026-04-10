import type { WorkflowId, StepId } from "../types.js";
import type {
  MemoryNamespace,
  WorkingEntry,
  WorkingEntrySourceType,
  MemoryQuery,
  MemoryResultEntry,
} from "./types.js";

const DEFAULT_WORKING_CAPACITY = 256;

export class WorkingMemory {
  private readonly store = new Map<string, WorkingEntry>();
  private readonly capacity: number;
  private readonly namespace: MemoryNamespace;

  constructor(namespace: MemoryNamespace, capacity = DEFAULT_WORKING_CAPACITY) {
    this.namespace = namespace;
    this.capacity = capacity;
  }

  set(
    key: string,
    value: unknown,
    source: WorkingEntrySourceType = "system",
    extra?: { workflowId?: WorkflowId; stepId?: StepId; tags?: string[] },
  ): WorkingEntry {
    const existing = this.findByKey(key);
    const now = Date.now();

    if (existing) {
      const updated: WorkingEntry = {
        ...existing,
        value,
        source,
        updatedAt: now,
        tags: extra?.tags ?? existing.tags,
        workflowId: extra?.workflowId ?? existing.workflowId,
        stepId: extra?.stepId ?? existing.stepId,
      };
      this.store.set(existing.id, updated);
      return updated;
    }

    this.evictIfNeeded();

    const entry: WorkingEntry = {
      id: `wm_${this.namespace}_${now}_${crypto.randomUUID()}`,
      namespace: this.namespace,
      key,
      value,
      source,
      workflowId: extra?.workflowId,
      stepId: extra?.stepId,
      tags: extra?.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(entry.id, entry);
    return entry;
  }

  get(key: string): WorkingEntry | undefined {
    return this.findByKey(key);
  }

  getByStep(stepId: StepId): WorkingEntry[] {
    const results: WorkingEntry[] = [];
    for (const entry of this.store.values()) {
      if (entry.stepId === stepId) results.push(entry);
    }
    return results;
  }

  getByWorkflow(workflowId: WorkflowId): WorkingEntry[] {
    const results: WorkingEntry[] = [];
    for (const entry of this.store.values()) {
      if (entry.workflowId === workflowId) results.push(entry);
    }
    return results;
  }

  delete(key: string): boolean {
    const entry = this.findByKey(key);
    if (!entry) return false;
    return this.store.delete(entry.id);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  query(query: MemoryQuery): MemoryResultEntry[] {
    const text = query.text?.toLowerCase();
    const tags = query.tags;
    const results: MemoryResultEntry[] = [];

    for (const entry of this.store.values()) {
      let score = 1.0;

      if (text) {
        const haystack = `${entry.key} ${JSON.stringify(entry.value)} ${entry.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(text)) continue;
        score = 0.6 + 0.4 * (text.length / haystack.length);
      }

      if (tags?.length) {
        const hasAll = tags.every((t) => entry.tags.includes(t));
        if (!hasAll) continue;
      }

      results.push({ tier: "working", entry, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, query.limit ?? 10);
  }

  all(): WorkingEntry[] {
    return Array.from(this.store.values());
  }

  private findByKey(key: string): WorkingEntry | undefined {
    for (const entry of this.store.values()) {
      if (entry.key === key) return entry;
    }
    return undefined;
  }

  private evictIfNeeded(): void {
    if (this.store.size < this.capacity) return;

    let oldest: WorkingEntry | undefined;
    for (const entry of this.store.values()) {
      if (!oldest || entry.updatedAt < oldest.updatedAt) {
        oldest = entry;
      }
    }
    if (oldest) this.store.delete(oldest.id);
  }
}
