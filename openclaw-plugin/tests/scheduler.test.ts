/**
 * SoloFlow — Scheduler unit tests
 *
 * Tests the DAG execution engine: linear/diamond workflows, cancellation,
 * status tracking, concurrency control, retry with backoff, and timeouts.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  mock,
  type Mock,
} from "bun:test";
import type {
  AgentResult,
  AgentDiscipline,
  OpenClawApi,
  StepId,
  WorkflowId,
  WorkflowStep,
} from "../src/types";
import { Scheduler } from "../src/services/scheduler";
import { WorkflowService } from "../src/services/workflow-service";

// ─── Helpers ───────────────────────────────────────────────────────────

function sid(id: string): StepId {
  return id as unknown as StepId;
}

function wid(id: string): WorkflowId {
  return id as unknown as WorkflowId;
}

function makeStep(id: string, deps: string[] = []): WorkflowStep {
  return {
    id: sid(id),
    name: `Step ${id}`,
    discipline: "quick" as AgentDiscipline,
    dependencies: deps.map(sid),
    config: {},
    state: "pending",
  };
}

function makeWorkflow(id: string, steps: WorkflowStep[]) {
  const map = new Map<StepId, WorkflowStep>();
  for (const s of steps) map.set(s.id, s);
  return {
    id: wid(id),
    name: `Workflow ${id}`,
    description: "Test workflow",
    steps: map,
    dag: { nodes: new Map(), edges: [], layers: [] },
    state: "idle" as const,
    currentSteps: [] as StepId[],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {} as Record<string, unknown>,
  };
}

function createMockApi(): OpenClawApi {
  return {
    commands: { register: mock(), unregister: mock() },
    rpc: { register: mock(), unregister: mock() },
    services: { register: mock(), unregister: mock(), get: mock() },
    logger: {
      info: mock(),
      warn: mock(),
      error: mock(),
      debug: mock(),
    },
    config: { get: mock(), set: mock(), has: mock(() => false) },
    events: { on: mock(), off: mock(), emit: mock() },
    state: { get: mock(), set: mock(), delete: mock(), has: mock(() => false) },
    hooks: { register: mock(), unregister: mock() },
  };
}

function okResult(step: WorkflowStep): AgentResult {
  return {
    stepId: step.id,
    discipline: step.discipline,
    output: `Result of ${step.id}`,
    tokensUsed: 100,
    durationMs: 10,
  };
}

function patchAgent(
  scheduler: Scheduler,
  fn: (step: WorkflowStep, api: OpenClawApi) => Promise<AgentResult>,
) {
  (scheduler as any).runAgentStep = fn;
}

function setupSvc(wfId: string, steps: WorkflowStep[]) {
  const svc = new WorkflowService();
  svc.create(makeWorkflow(wfId, steps));
  svc.start(wid(wfId));
  return svc;
}

function makeScheduler(
  svc: WorkflowService,
  opts?: ConstructorParameters<typeof Scheduler>[1],
  agentFn?: (step: WorkflowStep, api: OpenClawApi) => Promise<AgentResult>,
) {
  const scheduler = new Scheduler(svc, opts);
  if (agentFn) patchAgent(scheduler, agentFn);
  return scheduler;
}

// ─── execute() ─────────────────────────────────────────────────────────

describe("Scheduler — execute()", () => {
  let api: OpenClawApi;
  let okFn: (step: WorkflowStep, api: OpenClawApi) => Promise<AgentResult>;

  beforeEach(() => {
    api = createMockApi();
    okFn = mock((step: WorkflowStep) => Promise.resolve(okResult(step)));
  });

  it("executes a simple linear workflow (3 steps)", async () => {
    const svc = setupSvc("wf-linear", [
      makeStep("a"),
      makeStep("b", ["a"]),
      makeStep("c", ["b"]),
    ]);
    const scheduler = makeScheduler(svc, undefined, okFn);

    const result = await scheduler.execute(wid("wf-linear"), api);

    expect(result.completed).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(result.workflowId).toBe(wid("wf-linear"));

    const ids = (okFn as Mock).mock.calls.map((c: any) => c[0].id);
    expect(ids.indexOf(sid("a"))).toBeLessThan(ids.indexOf(sid("b")));
    expect(ids.indexOf(sid("b"))).toBeLessThan(ids.indexOf(sid("c")));
  });

  it("executes a diamond workflow (4 steps)", async () => {
    //     a
    //    / \
    //   b   c
    //    \ /
    //     d
    const svc = setupSvc("wf-diamond", [
      makeStep("a"),
      makeStep("b", ["a"]),
      makeStep("c", ["a"]),
      makeStep("d", ["b", "c"]),
    ]);
    const scheduler = makeScheduler(svc, undefined, okFn);

    const result = await scheduler.execute(wid("wf-diamond"), api);

    expect(result.completed).toHaveLength(4);
    expect(result.failed).toHaveLength(0);

    const ids = (okFn as Mock).mock.calls.map((c: any) => c[0].id);
    const idx = (id: string) => ids.indexOf(sid(id));
    expect(idx("a")).toBeLessThan(idx("b"));
    expect(idx("a")).toBeLessThan(idx("c"));
    expect(idx("b")).toBeLessThan(idx("d"));
    expect(idx("c")).toBeLessThan(idx("d"));
  });

  it("returns correct completed/failed lists when a step fails", async () => {
    const failB = mock((step: WorkflowStep) => {
      if (step.id === sid("b")) return Promise.reject(new Error("b failed"));
      return Promise.resolve(okResult(step));
    });
    const svc = setupSvc("wf-mixed", [
      makeStep("a"),
      makeStep("b", ["a"]),
      makeStep("c", ["b"]),
    ]);
    const scheduler = makeScheduler(
      svc,
      { retryAttempts: 1, retryDelayMs: 1, timeoutMs: 20 },
      failB,
    );

    const result = await scheduler.execute(wid("wf-mixed"), api);

    expect(result.completed).toContain(sid("a"));
    expect(result.completed).not.toContain(sid("c"));
    const bFailure = result.failed.find((f) => f.stepId === sid("b"));
    expect(bFailure).toBeDefined();
    expect(bFailure!.error).toContain("b failed");
  });

  it("throws if workflow not found", async () => {
    const scheduler = makeScheduler(new WorkflowService());
    expect(scheduler.execute(wid("ghost"), api)).rejects.toThrow(
      "Workflow not found",
    );
  });

  it("throws if workflow is not in running state", async () => {
    const svc = new WorkflowService();
    svc.create(makeWorkflow("wf-idle", [makeStep("a")]));
    const scheduler = makeScheduler(svc);
    expect(scheduler.execute(wid("wf-idle"), api)).rejects.toThrow(
      "not running",
    );
  });

  it("returns empty result for workflow with no steps", async () => {
    const svc = new WorkflowService();
    svc.create(makeWorkflow("wf-empty", []));
    svc.start(wid("wf-empty"));
    const scheduler = makeScheduler(svc);

    const result = await scheduler.execute(wid("wf-empty"), api);

    expect(result.completed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.totalDurationMs).toBe(0);
  });
});

// ─── executeStep() ─────────────────────────────────────────────────────

describe("Scheduler — executeStep()", () => {
  let api: OpenClawApi;
  let okFn: (step: WorkflowStep, api: OpenClawApi) => Promise<AgentResult>;

  beforeEach(() => {
    api = createMockApi();
    okFn = mock((step: WorkflowStep) => Promise.resolve(okResult(step)));
  });

  it("executes a single step and returns AgentResult", async () => {
    const svc = setupSvc("wf-single", [makeStep("x")]);
    const scheduler = makeScheduler(svc, undefined, okFn);

    const result = await scheduler.executeStep(sid("x"), api);

    expect(result.stepId).toBe(sid("x"));
    expect(result.discipline).toBe("quick");
    expect(result.output).toBe("Result of x");
  });

  it("throws if step not found", async () => {
    const scheduler = makeScheduler(new WorkflowService());
    expect(scheduler.executeStep(sid("nope"), api)).rejects.toThrow(
      "Step not found",
    );
  });

  it("updates step state to completed after success", async () => {
    const svc = setupSvc("wf-state", [makeStep("s1")]);
    const scheduler = makeScheduler(svc, undefined, okFn);

    await scheduler.executeStep(sid("s1"), api);

    const wf = svc.get(wid("wf-state"))!;
    const step = wf.steps.get(sid("s1"))!;
    expect(step.state).toBe("completed");
    expect(step.result).toBe("Result of s1");
    expect(step.completedAt).toBeDefined();
  });

  it("calls onStepStart and onStepComplete callbacks", async () => {
    const onStart = mock();
    const onComplete = mock();
    const svc = setupSvc("wf-cb", [makeStep("s1")]);
    const scheduler = makeScheduler(
      svc,
      { onStepStart: onStart, onStepComplete: onComplete },
      okFn,
    );

    await scheduler.executeStep(sid("s1"), api);

    expect(onStart).toHaveBeenCalledWith(sid("s1"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [cbStepId, cbResult] = (onComplete as Mock).mock.calls[0]!;
    expect(cbStepId).toBe(sid("s1"));
    expect(cbResult.stepId).toBe(sid("s1"));
  });
});

// ─── cancel() ──────────────────────────────────────────────────────────

describe("Scheduler — cancel()", () => {
  let api: OpenClawApi;

  beforeEach(() => {
    api = createMockApi();
  });

  it("prevents further steps from executing", async () => {
    const log: string[] = [];
    const slowFn = mock(async (step: WorkflowStep) => {
      log.push(`start:${step.id}`);
      await new Promise((r) => setTimeout(r, 100));
      log.push(`end:${step.id}`);
      return okResult(step);
    });

    const svc = setupSvc("wf-cancel", [
      makeStep("a"),
      makeStep("b", ["a"]),
      makeStep("c", ["b"]),
    ]);
    const scheduler = makeScheduler(
      svc,
      { retryAttempts: 1, timeoutMs: 5000 },
      slowFn,
    );

    // Cancel while step a is in-flight (before it finishes at ~100ms)
    setTimeout(() => scheduler.cancel(wid("wf-cancel")), 50);

    const result = await scheduler.execute(wid("wf-cancel"), api);

    // Step a started; cancel checked after its wave completes
    expect(log).toContain("start:a");
    // Steps b and c should NOT start
    expect(log).not.toContain("start:c");
    expect(result.completed.length + result.failed.length).toBeLessThanOrEqual(2);

    const status = scheduler.getStatus(wid("wf-cancel"));
    expect(status?.state).toBe("cancelled");
  });

  it("returns undefined when cancel called before execute", () => {
    const svc = setupSvc("wf-pre", [makeStep("a")]);
    const scheduler = makeScheduler(svc);
    scheduler.cancel(wid("wf-pre"));
    expect(scheduler.getStatus(wid("wf-pre"))).toBeUndefined();
  });
});

// ─── getStatus() ───────────────────────────────────────────────────────

describe("Scheduler — getStatus()", () => {
  let api: OpenClawApi;
  let slowOkFn: (step: WorkflowStep, api: OpenClawApi) => Promise<AgentResult>;

  beforeEach(() => {
    api = createMockApi();
    slowOkFn = mock(async (step: WorkflowStep) => {
      await new Promise((r) => setTimeout(r, 50));
      return okResult(step);
    });
  });

  it("tracks completed/failed/running counts", async () => {
    const svc = setupSvc("wf-status", [
      makeStep("a"),
      makeStep("b", ["a"]),
    ]);
    const scheduler = makeScheduler(svc, undefined, slowOkFn);

    const execPromise = scheduler.execute(wid("wf-status"), api);

    // Check mid-execution
    await new Promise((r) => setTimeout(r, 25));
    const midStatus = scheduler.getStatus(wid("wf-status"));
    expect(midStatus).toBeDefined();
    expect(midStatus!.workflowId).toBe(wid("wf-status"));

    await execPromise;

    const finalStatus = scheduler.getStatus(wid("wf-status"));
    expect(finalStatus!.state).toBe("completed");
    expect(finalStatus!.completedSteps).toContain(sid("a"));
    expect(finalStatus!.completedSteps).toContain(sid("b"));
    expect(finalStatus!.failedSteps).toHaveLength(0);
    expect(finalStatus!.progress).toBe(1);
  });

  it("returns undefined for never-seen workflow", () => {
    const scheduler = makeScheduler(new WorkflowService());
    expect(scheduler.getStatus(wid("unknown"))).toBeUndefined();
  });

  it("reports failed steps in status", async () => {
    const failB = mock((step: WorkflowStep) => {
      if (step.id === sid("b"))
        return Promise.reject(new Error("b exploded"));
      return Promise.resolve(okResult(step));
    });

    const svc = setupSvc("wf-fail-st", [
      makeStep("a"),
      makeStep("b", ["a"]),
    ]);
    const scheduler = makeScheduler(
      svc,
      { retryAttempts: 1, retryDelayMs: 1, timeoutMs: 20 },
      failB,
    );

    await scheduler.execute(wid("wf-fail-st"), api);

    const status = scheduler.getStatus(wid("wf-fail-st"))!;
    expect(status.completedSteps).toContain(sid("a"));
    const bFail = status.failedSteps.find((f) => f.stepId === sid("b"));
    expect(bFail).toBeDefined();
    expect(bFail!.error).toContain("b exploded");
    // Partial failure → state is "completed"
    expect(status.state).toBe("completed");
  });
});

// ─── Concurrency ───────────────────────────────────────────────────────

describe("Scheduler — Concurrency", () => {
  let api: OpenClawApi;

  beforeEach(() => {
    api = createMockApi();
  });

  it("max concurrency is respected (semaphore)", async () => {
    let maxConcurrent = 0;
    let current = 0;

    const trackFn = mock(async (step: WorkflowStep) => {
      current++;
      if (current > maxConcurrent) maxConcurrent = current;
      await new Promise((r) => setTimeout(r, 50));
      current--;
      return okResult(step);
    });

    const svc = setupSvc("wf-conc", [
      makeStep("a"),
      makeStep("b"),
      makeStep("c"),
      makeStep("d"),
    ]);
    const scheduler = makeScheduler(
      svc,
      { maxConcurrency: 2, retryAttempts: 1 },
      trackFn,
    );

    const result = await scheduler.execute(wid("wf-conc"), api);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(result.completed).toHaveLength(4);
  });

  it("steps in same layer execute in parallel", async () => {
    const starts = new Map<string, number>();

    const timingFn = mock(async (step: WorkflowStep) => {
      starts.set(step.id as unknown as string, Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return okResult(step);
    });

    // a → (b, c) → d
    const svc = setupSvc("wf-par", [
      makeStep("a"),
      makeStep("b", ["a"]),
      makeStep("c", ["a"]),
      makeStep("d", ["b", "c"]),
    ]);
    const scheduler = makeScheduler(
      svc,
      { maxConcurrency: 4, retryAttempts: 1 },
      timingFn,
    );

    await scheduler.execute(wid("wf-par"), api);

    const startB = starts.get("b")!;
    const startC = starts.get("c")!;
    // b and c launched in the same wave → start within ~30ms of each other
    expect(Math.abs(startB - startC)).toBeLessThan(30);
  });
});

// ─── Retry logic ───────────────────────────────────────────────────────

describe("Scheduler — Retry logic", () => {
  let api: OpenClawApi;

  beforeEach(() => {
    api = createMockApi();
  });

  it("retries failed steps up to maxAttempts then succeeds", async () => {
    let callCount = 0;
    const retryFn = mock((step: WorkflowStep) => {
      callCount++;
      if (callCount < 3) return Promise.reject(new Error("transient"));
      return Promise.resolve(okResult(step));
    });

    const svc = setupSvc("wf-retry", [makeStep("a")]);
    const scheduler = makeScheduler(
      svc,
      { retryAttempts: 3, retryDelayMs: 1, timeoutMs: 5000 },
      retryFn,
    );

    const result = await scheduler.execute(wid("wf-retry"), api);

    expect(result.completed).toContain(sid("a"));
    expect(result.failed).toHaveLength(0);
    // withRetry called fn 3 times (2 fails + 1 success)
    expect(callCount).toBe(3);
  });

  it("records failure after all retry attempts exhausted", async () => {
    const alwaysFail = mock(() =>
      Promise.reject(new Error("permanent failure")),
    );

    const svc = setupSvc("wf-retry-ex", [makeStep("a")]);
    // Short timeoutMs so workflow timeout (20*1*5=100ms) ends quickly
    const scheduler = makeScheduler(
      svc,
      { retryAttempts: 1, retryDelayMs: 1, timeoutMs: 20 },
      alwaysFail,
    );

    const result = await scheduler.execute(wid("wf-retry-ex"), api);

    // Step a appears in failed list at least once
    const aFailure = result.failed.find((f) => f.stepId === sid("a"));
    expect(aFailure).toBeDefined();
    expect(aFailure!.error).toContain("permanent failure");
    expect(result.completed).toHaveLength(0);
  });

  it("exponential backoff delays increase between retries", async () => {
    const times: number[] = [];
    const backoffFn = mock(() => {
      times.push(Date.now());
      if (times.length < 3) return Promise.reject(new Error("backoff"));
      return Promise.resolve({
        stepId: sid("a"),
        discipline: "quick" as const,
        output: "ok",
      });
    });

    const svc = setupSvc("wf-backoff", [makeStep("a")]);
    const scheduler = makeScheduler(
      svc,
      { retryAttempts: 3, retryDelayMs: 10, timeoutMs: 5000 },
      backoffFn,
    );

    await scheduler.execute(wid("wf-backoff"), api);

    expect(times).toHaveLength(3);
    const gap1 = times[1]! - times[0]!;
    const gap2 = times[2]! - times[1]!;
    // Delays: 10ms (10×2^0), 20ms (10×2^1) → gap2 > gap1
    expect(gap1).toBeGreaterThanOrEqual(5);
    expect(gap2).toBeGreaterThanOrEqual(gap1);
  });

  it("executeStep retries on transient failure", async () => {
    let callCount = 0;
    const retryFn = mock((step: WorkflowStep) => {
      callCount++;
      if (callCount < 2) return Promise.reject(new Error("retry me"));
      return Promise.resolve(okResult(step));
    });

    const svc = setupSvc("wf-step-retry", [makeStep("x")]);
    const scheduler = makeScheduler(
      svc,
      { retryAttempts: 3, retryDelayMs: 1, timeoutMs: 5000 },
      retryFn,
    );

    const result = await scheduler.executeStep(sid("x"), api);

    expect(result.stepId).toBe(sid("x"));
    expect(result.output).toBe("Result of x");
    expect(callCount).toBe(2);
  });
});

// ─── Timeout handling ──────────────────────────────────────────────────

describe("Scheduler — Timeout handling", () => {
  let api: OpenClawApi;

  beforeEach(() => {
    api = createMockApi();
  });

  it("steps exceeding timeout are recorded as failed", async () => {
    const slowFn = mock(async (step: WorkflowStep) => {
      await new Promise((r) => setTimeout(r, 500));
      return okResult(step);
    });

    const svc = setupSvc("wf-timeout", [makeStep("a")]);
    // stepTimeout=20ms, workflowTimeout=20*1*5=100ms
    const scheduler = makeScheduler(
      svc,
      { timeoutMs: 20, retryAttempts: 1, retryDelayMs: 1 },
      slowFn,
    );

    const result = await scheduler.execute(wid("wf-timeout"), api);

    expect(result.completed).toHaveLength(0);
    const timeoutFailure = result.failed.find((f) => f.stepId === sid("a"));
    expect(timeoutFailure).toBeDefined();
    expect(timeoutFailure!.error).toContain("timed out");
  });

  it("executeStep throws after timeout exhausts retries", async () => {
    const slowFn = mock(async () => {
      await new Promise((r) => setTimeout(r, 500));
      return { stepId: sid("a"), discipline: "quick" as const, output: "never" };
    });

    const svc = setupSvc("wf-step-to", [makeStep("a")]);
    const scheduler = makeScheduler(
      svc,
      { timeoutMs: 20, retryAttempts: 2, retryDelayMs: 1 },
      slowFn,
    );

    expect(scheduler.executeStep(sid("a"), api)).rejects.toThrow("timed out");
  });
});

// ─── Callbacks ─────────────────────────────────────────────────────────

describe("Scheduler — Callbacks", () => {
  let api: OpenClawApi;

  beforeEach(() => {
    api = createMockApi();
  });

  it("fires onStepStart, onStepComplete, onStepError", async () => {
    const onStart = mock();
    const onComplete = mock();
    const onError = mock();

    const mixedFn = mock((step: WorkflowStep) => {
      if (step.id === sid("fail"))
        return Promise.reject(new Error("oops"));
      return Promise.resolve(okResult(step));
    });

    const svc = setupSvc("wf-cb", [makeStep("ok1"), makeStep("fail")]);
    const scheduler = makeScheduler(
      svc,
      {
        retryAttempts: 1,
        retryDelayMs: 1,
        timeoutMs: 20,
        onStepStart: onStart,
        onStepComplete: onComplete,
        onStepError: onError,
      },
      mixedFn,
    );

    await scheduler.execute(wid("wf-cb"), api);

    // ok1 and fail both trigger onStart
    expect(onStart.mock.calls.length).toBeGreaterThanOrEqual(2);
    // ok1 triggers onComplete
    expect(onComplete.mock.calls.length).toBeGreaterThanOrEqual(1);
    // fail triggers onError at least once
    expect(onError.mock.calls.length).toBeGreaterThanOrEqual(1);

    const errorArgs = (onError as Mock).mock.calls[0]!;
    expect(errorArgs[0]).toBe(sid("fail"));
    expect(errorArgs[1].message).toContain("oops");
  });
});
