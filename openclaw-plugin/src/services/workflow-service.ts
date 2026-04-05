/**
 * SoloFlow — Workflow Service
 * Core workflow execution engine: CRUD, FSM state transitions, DAG integration, event emission.
 */

import type {
  Workflow,
  WorkflowId,
  WorkflowState,
  StepId,
  StateEvent,
  DAG,
} from "../types";
import { WORKFLOW_TRANSITIONS } from "../types";
import { buildDAG, topologicalSort, getReadySteps } from "../core/dag";

// ─── Filter ────────────────────────────────────────────────────────────

export interface WorkflowFilter {
  status?: WorkflowState;
  template?: string;
  limit?: number;
  offset?: number;
}

// ─── InvalidTransition Error ───────────────────────────────────────────

export class InvalidTransitionError extends Error {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly from: WorkflowState,
    public readonly to: WorkflowState,
  ) {
    super(`Invalid transition "${from}" → "${to}" for workflow ${workflowId}`);
    this.name = "InvalidTransitionError";
  }
}

export class WorkflowNotFoundError extends Error {
  constructor(public readonly workflowId: WorkflowId) {
    super(`Workflow not found: ${workflowId}`);
    this.name = "WorkflowNotFoundError";
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

// ─── WorkflowService ───────────────────────────────────────────────────

type StateListener = (event: StateEvent) => void;

export class WorkflowService {
  private readonly store = new Map<WorkflowId, Workflow>();
  private readonly listeners = new Set<StateListener>();

  // ── Event helpers ──────────────────────────────────────────────────

  /** Subscribe to state events. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: StateEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // ── FSM transition ─────────────────────────────────────────────────

  /**
   * Validate and apply a state transition.
   * @throws {InvalidTransitionError} if the transition is not allowed by WORKFLOW_TRANSITIONS.
   */
  private transition(id: WorkflowId, targetState: WorkflowState): void {
    const workflow = this.getOrThrow(id);
    const allowed = WORKFLOW_TRANSITIONS[workflow.state];

    if (!allowed.includes(targetState)) {
      throw new InvalidTransitionError(id, workflow.state, targetState);
    }

    const fromState = workflow.state;
    workflow.state = targetState;
    workflow.updatedAt = now();

    this.emit({
      type: "workflow:state_changed",
      workflowId: id,
      from: fromState,
      to: targetState,
    });
  }

  private getOrThrow(id: WorkflowId): Workflow {
    const workflow = this.store.get(id);
    if (!workflow) throw new WorkflowNotFoundError(id);
    return workflow;
  }

  // ── CRUD ───────────────────────────────────────────────────────────

  /** Create a new workflow. Builds its DAG from steps and stores it. */
  create(workflow: Workflow): Workflow {
    const steps = Array.from(workflow.steps.values());
    const dag: DAG = buildDAG(steps);

    const record: Workflow = {
      ...workflow,
      dag,
      state: workflow.state ?? "idle",
      createdAt: workflow.createdAt ?? now(),
      updatedAt: now(),
    };

    this.store.set(record.id, record);

    this.emit({ type: "workflow:created", workflowId: record.id });

    return record;
  }

  get(id: WorkflowId): Workflow | undefined {
    return this.store.get(id);
  }

  /** List workflows with optional filtering and pagination. */
  list(filter?: WorkflowFilter): Workflow[] {
    let results = Array.from(this.store.values());

    if (filter) {
      if (filter.status !== undefined) {
        results = results.filter((w) => w.state === filter.status);
      }
      if (filter.template !== undefined) {
        results = results.filter(
          (w) => w.metadata["template"] === filter.template,
        );
      }
      if (filter.offset !== undefined) {
        results = results.slice(filter.offset);
      }
      if (filter.limit !== undefined) {
        results = results.slice(0, filter.limit);
      }
    }

    return results;
  }

  /** Update an existing workflow in the store. */
  update(workflow: Workflow): void {
    this.getOrThrow(workflow.id);
    workflow.updatedAt = now();
    this.store.set(workflow.id, workflow);
    this.emit({ type: "workflow:state_changed", workflowId: workflow.id, from: workflow.state, to: workflow.state });
  }

  /** Delete a workflow by ID. */
  delete(id: WorkflowId): void {
    const existed = this.store.delete(id);
    if (!existed) throw new WorkflowNotFoundError(id);

    this.emit({ type: "workflow:deleted", workflowId: id });
  }

  // ── Lifecycle transitions ──────────────────────────────────────────

  /** Transition idle → queued → running (convenience for starting a workflow). */
  start(id: WorkflowId): void {
    const workflow = this.getOrThrow(id);

    // Allow starting from idle (auto-queues) or from queued directly.
    if (workflow.state === "idle") {
      this.transition(id, "queued");
    }
    if (workflow.state === "queued") {
      this.transition(id, "running");
    } else if (workflow.state !== "running") {
      throw new InvalidTransitionError(id, workflow.state, "running");
    }
  }

  /** Transition running → paused. */
  pause(id: WorkflowId): void {
    this.transition(id, "paused");
  }

  /** Transition paused → running. */
  resume(id: WorkflowId): void {
    this.transition(id, "running");
  }

  /**
   * Cancel a workflow.
   * When `force` is true, cancels from any non-terminal state.
   * Otherwise follows strict FSM rules.
   */
  cancel(id: WorkflowId, force = false): void {
    if (force) {
      const workflow = this.getOrThrow(id);
      const terminalStates: WorkflowState[] = ["completed", "cancelled"];
      if (terminalStates.includes(workflow.state)) {
        throw new InvalidTransitionError(id, workflow.state, "cancelled");
      }
      const fromState = workflow.state;
      workflow.state = "cancelled";
      workflow.updatedAt = now();

      this.emit({
        type: "workflow:state_changed",
        workflowId: id,
        from: fromState,
        to: "cancelled",
      });
      return;
    }

    this.transition(id, "cancelled");
  }

  /** Retry a failed or cancelled workflow by re-queuing it. */
  retry(id: WorkflowId): void {
    this.transition(id, "queued");
  }

  // ── DAG helpers exposed for scheduler integration ───────────────────

  /** Get the topologically-sorted step IDs for a workflow. */
  getExecutionOrder(id: WorkflowId): StepId[] {
    const workflow = this.getOrThrow(id);
    return topologicalSort(workflow.dag);
  }

  /** Get the steps that are ready to execute given completed and running sets. */
  getReadySteps(
    id: WorkflowId,
    completed: Set<StepId>,
    running: Set<StepId>,
  ): StepId[] {
    const workflow = this.getOrThrow(id);
    return getReadySteps(workflow.dag, completed, running);
  }
}
