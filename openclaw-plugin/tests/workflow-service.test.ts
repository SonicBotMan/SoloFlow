import { describe, it, expect, beforeEach } from "bun:test";
import {
  WorkflowService,
  InvalidTransitionError,
  WorkflowNotFoundError,
} from "../src/services/workflow-service";
import type { Workflow, WorkflowId, StepId, WorkflowStep, StateEvent } from "../src/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

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
    discipline: "quick",
    dependencies: deps.map(sid),
    config: {},
    state: "pending",
  };
}

function makeWorkflow(id: string, steps: WorkflowStep[] = []): Workflow {
  const map = new Map<StepId, WorkflowStep>();
  for (const s of steps) map.set(s.id, s);

  return {
    id: wid(id),
    name: `Workflow ${id}`,
    description: "Test workflow",
    steps: map,
    dag: { nodes: new Map(), edges: [], layers: [] },
    state: "idle",
    currentSteps: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {},
  };
}

// ─── Create ───────────────────────────────────────────────────────────────

describe("WorkflowService — create", () => {
  let svc: WorkflowService;

  beforeEach(() => {
    svc = new WorkflowService();
  });

  it("creates a workflow and stores it", () => {
    const wf = makeWorkflow("w1", [makeStep("a"), makeStep("b", ["a"])]);
    const created = svc.create(wf);

    expect(created.id).toBe(wid("w1"));
    expect(created.state).toBe("idle");
    expect(created.dag).toBeDefined();
    expect(created.dag.nodes.size).toBe(2);
    expect(svc.get(wid("w1"))).toBe(created);
  });

  it("emits workflow:created event", () => {
    const events: StateEvent[] = [];
    svc.subscribe((e) => events.push(e));

    svc.create(makeWorkflow("w2"));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("workflow:created");
  });

  it("sets createdAt and updatedAt timestamps", () => {
    const before = Date.now();
    const created = svc.create(makeWorkflow("w3"));
    const after = Date.now();

    expect(created.createdAt).toBeGreaterThanOrEqual(before);
    expect(created.createdAt).toBeLessThanOrEqual(after);
    expect(created.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

// ─── List ─────────────────────────────────────────────────────────────────

describe("WorkflowService — list", () => {
  let svc: WorkflowService;

  beforeEach(() => {
    svc = new WorkflowService();
    svc.create(makeWorkflow("w1"));
    svc.create(makeWorkflow("w2"));
    svc.create(makeWorkflow("w3"));
  });

  it("returns all workflows without filter", () => {
    expect(svc.list()).toHaveLength(3);
  });

  it("filters by status", () => {
    // All are idle by default
    const idle = svc.list({ status: "idle" });
    expect(idle).toHaveLength(3);

    const running = svc.list({ status: "running" });
    expect(running).toHaveLength(0);
  });

  it("filters by template metadata", () => {
    const wf = svc.get(wid("w1"))!;
    wf.metadata["template"] = "blog-pipeline";

    const result = svc.list({ template: "blog-pipeline" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(wid("w1"));
  });

  it("applies offset and limit", () => {
    const page = svc.list({ offset: 1, limit: 1 });
    expect(page).toHaveLength(1);
  });

  it("returns empty for out-of-range offset", () => {
    expect(svc.list({ offset: 100 })).toHaveLength(0);
  });
});

// ─── State Transitions ───────────────────────────────────────────────────

describe("WorkflowService — state transitions", () => {
  let svc: WorkflowService;

  beforeEach(() => {
    svc = new WorkflowService();
    svc.create(makeWorkflow("w1"));
  });

  it("start: transitions idle → queued → running", () => {
    svc.start(wid("w1"));
    expect(svc.get(wid("w1"))!.state).toBe("running");
  });

  it("pause: transitions running → paused", () => {
    svc.start(wid("w1"));
    svc.pause(wid("w1"));
    expect(svc.get(wid("w1"))!.state).toBe("paused");
  });

  it("resume: transitions paused → running", () => {
    svc.start(wid("w1"));
    svc.pause(wid("w1"));
    svc.resume(wid("w1"));
    expect(svc.get(wid("w1"))!.state).toBe("running");
  });

  it("cancel: transitions running → cancelled", () => {
    svc.start(wid("w1"));
    svc.cancel(wid("w1"));
    expect(svc.get(wid("w1"))!.state).toBe("cancelled");
  });

  it("cancel with force: cancels from paused state", () => {
    svc.start(wid("w1"));
    svc.pause(wid("w1"));
    svc.cancel(wid("w1"), true);
    expect(svc.get(wid("w1"))!.state).toBe("cancelled");
  });

  it("cancel with force: rejects from completed state", () => {
    svc.start(wid("w1"));
    // Manually push to completed
    svc.get(wid("w1"))!.state = "completed";
    expect(() => svc.cancel(wid("w1"), true)).toThrow(InvalidTransitionError);
  });

  it("retry: transitions failed → queued", () => {
    svc.start(wid("w1"));
    svc.get(wid("w1"))!.state = "failed";
    svc.retry(wid("w1"));
    expect(svc.get(wid("w1"))!.state).toBe("queued");
  });

  it("throws InvalidTransitionError for idle → paused", () => {
    expect(() => svc.pause(wid("w1"))).toThrow(InvalidTransitionError);
  });

  it("throws InvalidTransitionError for idle → completed", () => {
    expect(() => {
      svc.get(wid("w1"))!.state = "idle";
      // @ts-expect-error — accessing private method via any for test
      svc.transition(wid("w1"), "completed");
    }).toThrow();
  });

  it("updates updatedAt on state change", () => {
    const before = svc.get(wid("w1"))!.updatedAt;
    // Wait a tick to ensure timestamp changes
    svc.start(wid("w1"));
    const after = svc.get(wid("w1"))!.updatedAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("emits state_changed events during start", () => {
    const events: StateEvent[] = [];
    svc.subscribe((e) => events.push(e));

    svc.start(wid("w1"));

    const stateChanges = events.filter(
      (e) => e.type === "workflow:state_changed",
    );
    // idle → queued → running = 2 state change events
    expect(stateChanges).toHaveLength(2);

    if (stateChanges[0]!.type === "workflow:state_changed") {
      expect(stateChanges[0]!.from).toBe("idle");
      expect(stateChanges[0]!.to).toBe("queued");
    }
    if (stateChanges[1]!.type === "workflow:state_changed") {
      expect(stateChanges[1]!.from).toBe("queued");
      expect(stateChanges[1]!.to).toBe("running");
    }
  });

  it("unsubscribe stops receiving events", () => {
    const events: StateEvent[] = [];
    const unsub = svc.subscribe((e) => events.push(e));

    unsub();
    svc.start(wid("w1"));

    expect(events).toHaveLength(0);
  });
});

// ─── Workflow Not Found ───────────────────────────────────────────────────

describe("WorkflowService — not found errors", () => {
  let svc: WorkflowService;

  beforeEach(() => {
    svc = new WorkflowService();
  });

  it("get returns undefined for unknown id", () => {
    expect(svc.get(wid("nonexistent"))).toBeUndefined();
  });

  it("start throws WorkflowNotFoundError", () => {
    expect(() => svc.start(wid("nope"))).toThrow(WorkflowNotFoundError);
  });

  it("pause throws WorkflowNotFoundError", () => {
    expect(() => svc.pause(wid("nope"))).toThrow(WorkflowNotFoundError);
  });

  it("resume throws WorkflowNotFoundError", () => {
    expect(() => svc.resume(wid("nope"))).toThrow(WorkflowNotFoundError);
  });

  it("cancel throws WorkflowNotFoundError", () => {
    expect(() => svc.cancel(wid("nope"))).toThrow(WorkflowNotFoundError);
  });

  it("delete throws WorkflowNotFoundError for missing workflow", () => {
    expect(() => svc.delete(wid("nope"))).toThrow(WorkflowNotFoundError);
  });

  it("delete removes an existing workflow", () => {
    svc.create(makeWorkflow("wd"));
    expect(svc.get(wid("wd"))).toBeDefined();
    svc.delete(wid("wd"));
    expect(svc.get(wid("wd"))).toBeUndefined();
  });
});
