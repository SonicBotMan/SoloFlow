/**
 * SoloFlow — Lifecycle Hook System
 *
 * Extensible pub/sub hook system for workflow and step lifecycle events.
 * Follows oh-my-openagent patterns: register handlers per event, emit sync or async.
 */

import type { OpenClawApi, Workflow, WorkflowStep } from "../types.js";

// ─── Hook Event Types ──────────────────────────────────────────────

export type HookEvent =
  | "workflow:created"
  | "workflow:started"
  | "workflow:paused"
  | "workflow:resumed"
  | "workflow:completed"
  | "workflow:failed"
  | "workflow:cancelled"
  | "step:starting"
  | "step:completed"
  | "step:failed"
  | "workflow:state_changed";

// ─── Hook Context ──────────────────────────────────────────────────

export interface HookContext {
  event: HookEvent;
  workflow?: Workflow;
  step?: WorkflowStep;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ─── Hook Handler ──────────────────────────────────────────────────

export type HookHandler = (context: HookContext) => void | Promise<void>;

// ─── Hook System ───────────────────────────────────────────────────

export class HookSystem {
  private handlers: Map<HookEvent, Set<HookHandler>> = new Map();

  /** Register a handler for an event. Returns an unsubscribe function. */
  register(event: HookEvent, handler: HookHandler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => this.unregister(event, handler);
  }

  /** Remove a specific handler from an event. */
  unregister(event: HookEvent, handler: HookHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /** Emit an event synchronously. Non-throwing — errors are swallowed. */
  emit(event: HookEvent, context: HookContext): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(context);
      } catch {
        // swallow handler errors to protect the emitter
      }
    }
  }

  /** Emit an event asynchronously. All handlers run in parallel; errors are swallowed. */
  async emitAsync(event: HookEvent, context: HookContext): Promise<void> {
    const set = this.handlers.get(event);
    if (!set) return;
    const promises = [...set].map(async (handler) => {
      try {
        await handler(context);
      } catch {
        // swallow handler errors to protect the emitter
      }
    });
    await Promise.all(promises);
  }

  /** Remove all handlers for every event. */
  clear(): void {
    this.handlers.clear();
  }
}

// ─── Singleton ─────────────────────────────────────────────────────

export const hookSystem = new HookSystem();

// ─── Built-in Hooks ────────────────────────────────────────────────

/** Metrics accumulator shared across built-in hooks. */
interface WorkflowMetrics {
  started: number;
  completed: number;
  failed: number;
  totalDurationMs: number;
}

const metrics: WorkflowMetrics = { started: 0, completed: 0, failed: 0, totalDurationMs: 0 };

export function getMetrics(): Readonly<WorkflowMetrics> {
  return metrics;
}

/** Log workflow start, update metrics. */
export function onWorkflowStart(ctx: HookContext): void {
  metrics.started++;
  console.log(
    `[SoloFlow] workflow started: ${ctx.workflow?.name ?? ctx.workflow?.id ?? "unknown"} ` +
      `(${ctx.workflow?.steps.size ?? 0} steps)`,
  );
}

/** Log completion, update metrics. */
export function onWorkflowComplete(ctx: HookContext): void {
  metrics.completed++;
  const wf = ctx.workflow;
  if (wf) {
    metrics.totalDurationMs += Date.now() - wf.createdAt;
  }
  console.log(
    `[SoloFlow] workflow completed: ${wf?.name ?? wf?.id ?? "unknown"} ` +
      `duration≈${metrics.totalDurationMs}ms`,
  );
}

/** Log failure, send alerts. */
export function onWorkflowFail(ctx: HookContext): void {
  metrics.failed++;
  console.error(
    `[SoloFlow] workflow failed: ${ctx.workflow?.name ?? ctx.workflow?.id ?? "unknown"}`,
    ctx.metadata?.["error"] ?? "",
  );
}

/** Log step completion. */
export function onStepComplete(ctx: HookContext): void {
  console.log(
    `[SoloFlow] step completed: ${ctx.step?.name ?? ctx.step?.id ?? "unknown"} ` +
      `in workflow ${ctx.workflow?.id ?? "?"}`,
  );
}

/** Log step error, trigger retry if applicable. */
export function onStepError(ctx: HookContext): void {
  console.error(
    `[SoloFlow] step failed: ${ctx.step?.name ?? ctx.step?.id ?? "unknown"} ` +
      `in workflow ${ctx.workflow?.id ?? "?"}`,
    ctx.step?.error ?? ctx.metadata?.["error"] ?? "",
  );
}

/** Convenience helper to register all built-in hooks. Returns an unsubscribe function. */
export function registerBuiltinHooks(system: HookSystem = hookSystem): () => void {
  const unsubs = [
    system.register("workflow:started", onWorkflowStart),
    system.register("workflow:completed", onWorkflowComplete),
    system.register("workflow:failed", onWorkflowFail),
    system.register("step:completed", onStepComplete),
    system.register("step:failed", onStepError),
  ];
  return () => unsubs.forEach((fn) => fn());
}

/* ─── OpenClaw Integration ──────────────────────────────────────────
 * NOTE: The bridge logic (STATE_EVENT_TO_HOOK, hookEventFromTransition,
 * and the full registerHooks body) has been moved into index.ts.
 * These helpers are kept as no-op stubs to avoid breaking any callers.
 */

/** @deprecated — bridge moved to index.ts */
export function registerHooks(_api: OpenClawApi, _system: HookSystem = hookSystem): () => void {
  return () => {};
}

/** @deprecated — bridge moved to index.ts */
export function unregisterHooks(_api: OpenClawApi): void {
  // No-op
}
