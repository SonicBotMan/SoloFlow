/**
 * SoloFlow — DAG Scheduler
 *
 * Core execution engine: parallel DAG layer execution, retry with exponential
 * backoff, per-step and per-workflow timeouts, concurrency control via
 * semaphore, and progress callbacks.
 */

import type {
  AgentResult,
  SchedulerOptions,
  SchedulerResult,
  StepId,
  Workflow,
  WorkflowId,
  WorkflowStep,
} from "../types.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { getReadySteps, topologicalSort } from "../core/dag.js";
import { executeAgentStep } from "../agents/index.js";
import { WorkflowService } from "./workflow-service.js";

// ─── Execution Status ────────────────────────────────────────────────

export interface WorkflowExecutionStatus {
  workflowId: WorkflowId;
  state: "running" | "completed" | "failed" | "cancelled";
  completedSteps: StepId[];
  failedSteps: Array<{ stepId: StepId; error: string }>;
  runningSteps: StepId[];
  startedAt: number;
  updatedAt: number;
  /** 0..1 fraction of total steps that have been processed */
  progress: number;
}

// ─── Defaults ────────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_STEP_TIMEOUT_MS = 60_000;
/** Workflow timeout = stepTimeout × totalSteps × factor */
const DEFAULT_WORKFLOW_TIMEOUT_FACTOR = 5;

// ─── Internal: Semaphore ─────────────────────────────────────────────

class Semaphore {
  private current = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}

// ─── Internal: Utilities ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry with exponential backoff: delay = backoffMs × 2^attempt */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  backoffMs: number,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) {
        await sleep(backoffMs * 2 ** attempt);
      }
    }
  }
  throw lastError!;
}

/** Race a promise against a deadline. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ─── Resolved Options ────────────────────────────────────────────────

interface ResolvedOptions {
  maxConcurrency: number;
  retryAttempts: number;
  retryDelayMs: number;
  stepTimeoutMs: number;
  onStepStart?: (stepId: StepId) => void;
  onStepComplete?: (stepId: StepId, result: AgentResult) => void;
  onStepError?: (stepId: StepId, error: Error) => void;
}

function resolveOptions(opts?: SchedulerOptions): ResolvedOptions {
  return {
    maxConcurrency: opts?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    retryAttempts: opts?.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS,
    retryDelayMs: opts?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    stepTimeoutMs: opts?.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
    onStepStart: opts?.onStepStart,
    onStepComplete: opts?.onStepComplete,
    onStepError: opts?.onStepError,
  };
}

// ─── Scheduler ───────────────────────────────────────────────────────

export class Scheduler {
  private readonly opts: ResolvedOptions;
  private readonly cancelled = new Set<WorkflowId>();
  private readonly statuses = new Map<WorkflowId, WorkflowExecutionStatus>();

  constructor(
    private readonly workflowService: WorkflowService,
    options?: SchedulerOptions,
  ) {
    this.opts = resolveOptions(options);
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Execute an entire workflow DAG.
   *
   * Iterates through layers of ready steps, running each layer in parallel
   * (bounded by `maxConcurrency`). Individual step failures are recorded but
   * do not crash the workflow — steps whose dependencies failed are skipped.
   */
  async execute(
    workflowId: WorkflowId,
    api: OpenClawPluginApi,
  ): Promise<SchedulerResult> {
    // 1. Retrieve workflow
    const workflow = this.workflowService.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // 2. Validate state — must be 'running'
    if (workflow.state !== "running") {
      throw new Error(
        `Workflow ${workflowId} is not running (current state: ${workflow.state})`,
      );
    }

    // Pre-flight: log execution order & handle empty workflows
    const order = topologicalSort(workflow.dag);
    const totalSteps = workflow.steps.size;

    if (totalSteps === 0 || order.length === 0) {
      return {
        workflowId,
        completed: [],
        failed: [],
        totalDurationMs: 0,
      };
    }

    api.logger.info(
      `[scheduler] Execution order: ${order.join(" → ")} (${totalSteps} steps)`,
    );

    const startedAt = Date.now();

    const completed = new Set<StepId>();
    const failed: Array<{ stepId: StepId; error: string }> = [];
    const running = new Set<StepId>();
    const stepResultsMap = new Map<string, AgentResult>();

    const status: WorkflowExecutionStatus = {
      workflowId,
      state: "running",
      completedSteps: [],
      failedSteps: [],
      runningSteps: [],
      startedAt,
      updatedAt: startedAt,
      progress: 0,
    };
    this.statuses.set(workflowId, status);

    // Workflow-level timeout
    const workflowTimeoutMs =
      this.opts.stepTimeoutMs * totalSteps * DEFAULT_WORKFLOW_TIMEOUT_FACTOR;

    try {
      await withTimeout(
        this.runLoop(workflow, api, completed, failed, running, status, stepResultsMap),
        workflowTimeoutMs,
        `Workflow ${workflowId} timed out after ${workflowTimeoutMs}ms`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      api.logger.error(`[scheduler] ${msg}`);
      if (status.state === "running") {
        status.state = "failed";
      }
    }

    // Finalise status
    status.runningSteps = [];
    status.updatedAt = Date.now();
    status.progress =
      totalSteps > 0 ? (completed.size + failed.length) / totalSteps : 1;

    return {
      workflowId,
      completed: Array.from(completed),
      failed,
      totalDurationMs: Date.now() - startedAt,
    };
  }

  /**
   * Execute a single step by ID.
   *
   * Searches across all workflows to locate the step, then runs it with the
   * configured retry and timeout policies.
   */
  async executeStep(
    stepId: StepId,
    api: OpenClawPluginApi,
  ): Promise<AgentResult> {
    const found = this.findStep(stepId);
    if (!found) {
      throw new Error(`Step not found: ${stepId}`);
    }

    const { step, workflow } = found;

    api.logger.debug?.(`[scheduler] Executing step ${stepId} (${step.discipline})`);

    this.opts.onStepStart?.(stepId);

    const stepResultsMap = new Map<string, AgentResult>();

    const result = await withRetry(
      () =>
        withTimeout(
          this.runAgentStep(step, api, stepResultsMap, workflow.name),
          this.opts.stepTimeoutMs,
          `Step ${stepId} timed out after ${this.opts.stepTimeoutMs}ms`,
        ),
      this.opts.retryAttempts,
      this.opts.retryDelayMs,
    );

    step.state = "completed";
    step.result = result.output;
    step.completedAt = Date.now();

    this.opts.onStepComplete?.(stepId, result);
    return result;
  }

  /**
   * Cancel a running workflow execution.
   *
   * The cancellation flag is checked between execution waves — in-flight
   * steps will still complete, but no new waves will be launched.
   */
  cancel(workflowId: WorkflowId): void {
    this.cancelled.add(workflowId);
    const status = this.statuses.get(workflowId);
    if (status && status.state === "running") {
      status.state = "cancelled";
      status.updatedAt = Date.now();
    }
  }

  /**
   * Get the current execution status of a workflow.
   */
  getStatus(workflowId: WorkflowId): WorkflowExecutionStatus | undefined {
    return this.statuses.get(workflowId);
  }

  // ── Internal: Execution Loop ────────────────────────────────────────

  /**
   * Core loop: repeatedly resolves ready steps and runs each wave in
   * parallel via `Promise.allSettled`, bounded by the semaphore.
   */
  private async runLoop(
    workflow: Workflow,
    api: OpenClawPluginApi,
    completed: Set<StepId>,
    failed: Array<{ stepId: StepId; error: string }>,
    running: Set<StepId>,
    status: WorkflowExecutionStatus,
    stepResultsMap: Map<string, AgentResult>,
  ): Promise<void> {
    const semaphore = new Semaphore(this.opts.maxConcurrency);
    const failedStepIds = new Set<StepId>();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // ── Cancellation gate ──
      if (this.cancelled.has(workflow.id)) {
        status.state = "cancelled";
        status.updatedAt = Date.now();
        return;
      }

      // ── Get ready steps ──
      const readyIds = getReadySteps(workflow.dag, completed, running);

      // Skip steps that have already failed or whose upstream dependencies have failed
      const executable = readyIds.filter((id) => {
        if (failedStepIds.has(id)) return false;
        const node = workflow.dag.nodes.get(id);
        if (!node) return false;
        return !node.dependencies.some((dep) => failedStepIds.has(dep));
      });

      // ── Termination: nothing ready, nothing in flight ──
      if (executable.length === 0 && running.size === 0) {
        break;
      }

      // Nothing new to launch — wait for in-flight steps to drain
      if (executable.length === 0) {
        await sleep(50);
        continue;
      }

      // ── Launch wave ──
      const promises = executable.map((stepId) =>
        this.runManagedStep(
          workflow,
          stepId,
          api,
          completed,
          failed,
          failedStepIds,
          running,
          semaphore,
          status,
          stepResultsMap,
        ),
      );

      // Wait for the entire wave to settle before evaluating the next layer
      await Promise.allSettled(promises);
    }

    // Final state: all steps failed → "failed", otherwise "completed"
    status.state =
      failed.length > 0 && completed.size === 0 ? "failed" : "completed";
    status.updatedAt = Date.now();
  }

  /**
   * Execute a single step within the managed workflow context.
   * Handles semaphore, retry, timeout, state updates, and callbacks.
   */
  private async runManagedStep(
    workflow: Workflow,
    stepId: StepId,
    api: OpenClawPluginApi,
    completed: Set<StepId>,
    failed: Array<{ stepId: StepId; error: string }>,
    failedStepIds: Set<StepId>,
    running: Set<StepId>,
    semaphore: Semaphore,
    status: WorkflowExecutionStatus,
    stepResultsMap: Map<string, AgentResult>,
  ): Promise<void> {
    // ── Acquire concurrency slot ──
    await semaphore.acquire();
    running.add(stepId);
    status.runningSteps = Array.from(running);
    status.updatedAt = Date.now();

    const step = workflow.steps.get(stepId);
    if (!step) {
      running.delete(stepId);
      semaphore.release();
      return;
    }

    step.state = "running";
    step.startedAt = Date.now();

    this.opts.onStepStart?.(stepId);

    try {
      // ── Execute with retry + timeout ──
      const result = await withRetry(
        () =>
          withTimeout(
            this.runAgentStep(step, api, stepResultsMap, workflow.name),
            this.opts.stepTimeoutMs,
            `Step ${stepId} timed out after ${this.opts.stepTimeoutMs}ms`,
          ),
        this.opts.retryAttempts,
        this.opts.retryDelayMs,
      );

      // ── Success ──
      step.state = "completed";
      step.result = result.output;
      step.completedAt = Date.now();

      // Store result for downstream steps
      stepResultsMap.set(stepId as string, result);

      completed.add(stepId);
      status.completedSteps = Array.from(completed);
      status.progress =
        workflow.steps.size > 0 ? completed.size / workflow.steps.size : 1;
      status.updatedAt = Date.now();

      this.opts.onStepComplete?.(stepId, result);
    } catch (err) {
      // ── Failure (all retries exhausted) ──
      const message = err instanceof Error ? err.message : String(err);

      step.state = "failed";
      step.error = message;
      step.completedAt = Date.now();

      failed.push({ stepId, error: message });
      failedStepIds.add(stepId);
      status.failedSteps = [...failed];
      status.updatedAt = Date.now();

      this.opts.onStepError?.(
        stepId,
        err instanceof Error ? err : new Error(message),
      );

      api.logger.warn(
        `[scheduler] Step ${stepId} failed after ${this.opts.retryAttempts} attempts: ${message}`,
      );
    } finally {
      running.delete(stepId);
      status.runningSteps = Array.from(running);
      semaphore.release();
    }
  }

  // ── Internal: Agent Execution ───────────────────────────────────────

  /** Delegate to the agent discipline executor. */
  private async runAgentStep(
    step: WorkflowStep,
    api: OpenClawPluginApi,
    upstreamResults: ReadonlyMap<string, AgentResult>,
    workflowName: string,
  ): Promise<AgentResult> {
    return executeAgentStep(step, { api, upstreamResults, workflowName });
  }

  // ── Internal: Step Lookup ───────────────────────────────────────────

  /** Find a step by ID across all managed workflows. */
  private findStep(
    stepId: StepId,
  ): { workflow: Workflow; step: WorkflowStep } | undefined {
    for (const workflow of this.workflowService.list()) {
      const step = workflow.steps.get(stepId);
      if (step) return { workflow, step };
    }
    return undefined;
  }
}
