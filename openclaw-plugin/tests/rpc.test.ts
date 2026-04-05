import { describe, it, expect, beforeEach, vi, type Mock } from "bun:test";
import { RPCRouter } from "../src/rpc/index";
import type {
  OpenClawApi,
  Workflow,
  WorkflowId,
  WorkflowState,
  StepId,
  WorkflowStep,
  SchedulerResult,
} from "../src/types";
import type { WorkflowExecutionStatus } from "../src/services/scheduler";

// ─── Brand helpers ──────────────────────────────────────────────────────

function sid(id: string): StepId {
  return id as unknown as StepId;
}

function wid(id: string): WorkflowId {
  return id as unknown as WorkflowId;
}

// ─── Mock Factories ────────────────────────────────────────────────────

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

function makeWorkflow(overrides: Partial<Workflow> & { id: string }): Workflow {
  const steps = overrides.steps ?? new Map<StepId, WorkflowStep>();
  return {
    id: wid(overrides.id),
    name: overrides.name ?? `Workflow ${overrides.id}`,
    description: overrides.description ?? "Test workflow",
    steps,
    dag: overrides.dag ?? { nodes: new Map(), edges: [], layers: [] },
    state: overrides.state ?? "idle",
    currentSteps: overrides.currentSteps ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    metadata: overrides.metadata ?? {},
  };
}

interface MockWorkflowService {
  create: Mock<(wf: Workflow) => Workflow>;
  get: Mock<(id: WorkflowId) => Workflow | undefined>;
  list: Mock<(filter?: Record<string, unknown>) => Workflow[]>;
  start: Mock<(id: WorkflowId) => void>;
  pause: Mock<(id: WorkflowId) => void>;
  resume: Mock<(id: WorkflowId) => void>;
  cancel: Mock<(id: WorkflowId, force?: boolean) => void>;
  retry: Mock<(id: WorkflowId) => void>;
  delete: Mock<(id: WorkflowId) => void>;
}

function createMockWorkflowService(
  stored: Map<string, Workflow> = new Map(),
): MockWorkflowService {
  return {
    create: vi.fn((wf: Workflow) => {
      stored.set(wf.id as unknown as string, wf);
      return wf;
    }),
    get: vi.fn((id: WorkflowId) => stored.get(id as unknown as string)),
    list: vi.fn((filter?: Record<string, unknown>) => {
      let results = Array.from(stored.values());
      if (filter) {
        if (filter.status !== undefined) {
          results = results.filter((w) => w.state === filter.status);
        }
        if (filter.template !== undefined) {
          results = results.filter(
            (w) => w.metadata["template"] === filter.template,
          );
        }
      }
      return results;
    }),
    start: vi.fn((id: WorkflowId) => {
      const wf = stored.get(id as unknown as string);
      if (!wf) throw new Error(`Workflow not found: ${id}`);
      wf.state = "running";
    }),
    pause: vi.fn((id: WorkflowId) => {
      const wf = stored.get(id as unknown as string);
      if (!wf) throw new Error(`Workflow not found: ${id}`);
      wf.state = "paused";
    }),
    resume: vi.fn((id: WorkflowId) => {
      const wf = stored.get(id as unknown as string);
      if (!wf) throw new Error(`Workflow not found: ${id}`);
      wf.state = "running";
    }),
    cancel: vi.fn((id: WorkflowId) => {
      const wf = stored.get(id as unknown as string);
      if (!wf) {
        const err = new Error(`Workflow not found: ${id}`);
        err.name = "WorkflowNotFoundError";
        throw err;
      }
      wf.state = "cancelled";
    }),
    retry: vi.fn((id: WorkflowId) => {
      const wf = stored.get(id as unknown as string);
      if (!wf) throw new Error(`Workflow not found: ${id}`);
      wf.state = "queued";
    }),
    delete: vi.fn((id: WorkflowId) => {
      const existed = stored.delete(id as unknown as string);
      if (!existed) {
        const err = new Error(`Workflow not found: ${id}`);
        err.name = "WorkflowNotFoundError";
        throw err;
      }
    }),
  };
}

interface MockScheduler {
  execute: Mock<(id: WorkflowId, api: OpenClawApi) => Promise<SchedulerResult>>;
  cancel: Mock<(id: WorkflowId) => void>;
  getStatus: Mock<(id: WorkflowId) => WorkflowExecutionStatus | undefined>;
}

function createMockScheduler(): MockScheduler {
  return {
    execute: vi.fn(() =>
      Promise.resolve({
        workflowId: wid("mock"),
        completed: [],
        failed: [],
        totalDurationMs: 0,
      }),
    ),
    cancel: vi.fn(),
    getStatus: vi.fn(() => undefined),
  };
}

function createMockApi(): OpenClawApi {
  return {
    commands: { register: vi.fn(), unregister: vi.fn() },
    rpc: { register: vi.fn(), unregister: vi.fn() },
    services: {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    config: {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(() => false),
    },
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    state: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(() => false),
    },
    hooks: { register: vi.fn(), unregister: vi.fn() },
  };
}

// ─── Shared state ──────────────────────────────────────────────────────

let mockWf: MockWorkflowService;
let mockScheduler: MockScheduler;
let mockApi: OpenClawApi;
let router: RPCRouter;

beforeEach(() => {
  mockWf = createMockWorkflowService();
  mockScheduler = createMockScheduler();
  mockApi = createMockApi();
  router = new RPCRouter(
    mockWf as unknown as import("../src/services/workflow-service").WorkflowService,
    mockScheduler as unknown as import("../src/services/scheduler").Scheduler,
    mockApi,
  );
});

// ─── route() dispatch ──────────────────────────────────────────────────

describe("RPCRouter — route() dispatch", () => {
  it("dispatches to correct handler by method name", async () => {
    const result = await router.route("workflow.list", {}, mockApi);
    expect(result).toHaveProperty("result");
    expect((result as { result: unknown }).result).toHaveProperty("workflows");
    expect((result as { result: unknown }).result).toHaveProperty("total");
  });

  it("returns method not found error for unknown methods", async () => {
    const result = await router.route("nonexistent.method", {}, mockApi);
    expect(result).toEqual({
      error: { code: -32601, message: "Method not found: nonexistent.method" },
    });
  });
});

// ─── register() ────────────────────────────────────────────────────────

describe("RPCRouter — register()", () => {
  it("returns all registered RPC methods", () => {
    const methods = router.register();
    const names = methods.map((m) => m.name);

    expect(names).toContain("workflow.create");
    expect(names).toContain("workflow.start");
    expect(names).toContain("workflow.status");
    expect(names).toContain("workflow.list");
    expect(names).toContain("workflow.cancel");
    expect(names).toContain("workflow.pause");
    expect(names).toContain("workflow.resume");
    expect(names).toContain("workflow.retry");
    expect(names).toContain("workflow.delete");
    expect(names).toContain("agent.listDisciplines");
  });

  it("each method has name, description, schema, and handler", () => {
    const methods = router.register();
    for (const m of methods) {
      expect(m.name).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.handler).toBeTypeOf("function");
    }
  });
});

// ─── workflow.create ──────────────────────────────────────────────────

describe("RPCRouter — workflow.create", () => {
  it("creates a workflow with given steps and returns id and status", async () => {
    const params = {
      steps: [
        { id: "s1", name: "Step One", discipline: "quick" },
        { id: "s2", name: "Step Two", discipline: "deep", dependencies: ["s1"] },
      ],
    };

    const response = await router.route("workflow.create", params, mockApi);
    const { result } = response as { result: Record<string, unknown> };

    expect(result.id).toMatch(/^wf_\d+_[a-z0-9]+$/);
    expect(result.status).toBe("idle");
    expect(result.createdAt).toBeTypeOf("number");
    expect(mockWf.create).toHaveBeenCalledTimes(1);
  });

  it("sets template name from params", async () => {
    const params = {
      template: "blog-pipeline",
      steps: [{ id: "s1", name: "Draft", discipline: "quick" }],
    };

    const response = await router.route("workflow.create", params, mockApi);
    const { result } = response as { result: Record<string, unknown> };

    expect(result.id).toBeDefined();
    expect(result.status).toBe("idle");

    // The workflow passed to service.create should have name = template
    const created = mockWf.create.mock.calls[0]![0] as Workflow;
    expect(created.name).toBe("blog-pipeline");
  });

  it("throws error when steps is missing or empty", async () => {
    const response = await router.route("workflow.create", {}, mockApi);
    const { error } = response as { error: { code: number; message: string } };

    expect(error).toBeDefined();
    expect(error.code).toBe(-32603);
    expect(error.message).toContain("At least one step");
  });

  it("throws error when steps is empty array", async () => {
    const response = await router.route(
      "workflow.create",
      { steps: [] },
      mockApi,
    );
    const { error } = response as { error: { code: number; message: string } };

    expect(error).toBeDefined();
    expect(error.message).toContain("At least one step");
  });
});

// ─── workflow.list ────────────────────────────────────────────────────

describe("RPCRouter — workflow.list", () => {
  it("returns workflow list", async () => {
    // Pre-populate
    const wf1 = makeWorkflow({ id: "wf1" });
    const wf2 = makeWorkflow({ id: "wf2" });
    mockWf.list.mockReturnValueOnce([wf1, wf2]); // call without filter (all)
    mockWf.list.mockReturnValueOnce([wf1, wf2]); // call with filter

    const response = await router.route("workflow.list", {}, mockApi);
    const { result } = response as {
      result: { workflows: unknown[]; total: number };
    };

    expect(result.workflows).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("respects status filter", async () => {
    const running = makeWorkflow({ id: "wf1", state: "running" });
    const idle = makeWorkflow({ id: "wf2", state: "idle" });

    mockWf.list.mockReturnValueOnce([running, idle]); // all
    mockWf.list.mockReturnValueOnce([running]); // filtered

    const response = await router.route(
      "workflow.list",
      { status: "running" },
      mockApi,
    );
    const { result } = response as {
      result: { workflows: unknown[]; total: number };
    };

    expect(result.workflows).toHaveLength(1);
    expect(result.total).toBe(2); // total is from unfiltered list
  });

  it("respects limit and offset", async () => {
    const wfs = Array.from({ length: 5 }, (_, i) =>
      makeWorkflow({ id: `wf${i}` }),
    );

    mockWf.list.mockReturnValueOnce(wfs); // all
    mockWf.list.mockReturnValueOnce(wfs); // filtered (same)

    const response = await router.route(
      "workflow.list",
      { offset: 2, limit: 2 },
      mockApi,
    );
    const { result } = response as {
      result: { workflows: unknown[]; total: number };
    };

    expect(result.workflows).toHaveLength(2);
    expect(result.total).toBe(5);
  });

  it("returns empty workflows array when none exist", async () => {
    mockWf.list.mockReturnValueOnce([]); // all
    mockWf.list.mockReturnValueOnce([]); // filtered

    const response = await router.route("workflow.list", {}, mockApi);
    const { result } = response as {
      result: { workflows: unknown[]; total: number };
    };

    expect(result.workflows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

// ─── workflow.status ──────────────────────────────────────────────────

describe("RPCRouter — workflow.status", () => {
  it("returns workflow status", async () => {
    const wf = makeWorkflow({
      id: "wf1",
      state: "running",
      steps: new Map([
        [sid("s1"), makeStep("s1")],
        [sid("s2"), makeStep("s2", ["s1"])],
      ]),
    });

    mockWf.get.mockReturnValue(wf);
    mockScheduler.getStatus.mockReturnValue(undefined);

    const response = await router.route(
      "workflow.status",
      { id: "wf1" },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };

    expect(result.id).toBe("wf1");
    expect(result.status).toBe("running");
    expect(result.steps).toHaveLength(2);
    expect(result.createdAt).toBeTypeOf("number");
    expect(result.updatedAt).toBeTypeOf("number");
  });

  it("returns error for unknown workflow", async () => {
    mockWf.get.mockReturnValue(undefined);

    const response = await router.route(
      "workflow.status",
      { id: "nonexistent" },
      mockApi,
    );
    const { error } = response as { error: { code: number; message: string } };

    expect(error).toBeDefined();
    expect(error.message).toContain("Workflow not found");
    expect(error.code).toBe(-32603);
  });

  it("includes step details when verbose=true", async () => {
    const step: WorkflowStep = {
      ...makeStep("s1"),
      state: "completed",
      startedAt: 1000,
      completedAt: 2000,
    };
    const wf = makeWorkflow({
      id: "wf1",
      steps: new Map([[sid("s1"), step]]),
    });

    mockWf.get.mockReturnValue(wf);
    mockScheduler.getStatus.mockReturnValue(undefined);

    const response = await router.route(
      "workflow.status",
      { id: "wf1", verbose: true },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };
    const steps = result.steps as Record<string, unknown>[];

    expect(steps).toHaveLength(1);
    expect(steps[0]).toHaveProperty("discipline");
    expect(steps[0]).toHaveProperty("startedAt");
    expect(steps[0]).toHaveProperty("completedAt");
  });

  it("includes step error from scheduler failed steps", async () => {
    const wf = makeWorkflow({ id: "wf1", steps: new Map([[sid("s1"), makeStep("s1")]]) });
    mockWf.get.mockReturnValue(wf);
    mockScheduler.getStatus.mockReturnValue({
      workflowId: wid("wf1"),
      state: "failed",
      completedSteps: [],
      failedSteps: [{ stepId: sid("s1"), error: "OOM killed" }],
      runningSteps: [],
      startedAt: 1000,
      updatedAt: 2000,
      progress: 0,
    });

    const response = await router.route(
      "workflow.status",
      { id: "wf1" },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };

    expect(result.error).toBe("OOM killed");
  });
});

// ─── workflow.cancel ──────────────────────────────────────────────────

describe("RPCRouter — workflow.cancel", () => {
  it("cancels a workflow", async () => {
    const wf = makeWorkflow({ id: "wf1", state: "running" });
    mockWf.get.mockReturnValue(wf);
    mockWf.cancel.mockImplementation(() => { wf.state = "cancelled"; });

    const response = await router.route(
      "workflow.cancel",
      { id: "wf1" },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };

    expect(result.id).toBe("wf1");
    expect(result.status).toBe("cancelled");
    expect(result.cancelledAt).toBeTypeOf("number");
    expect(mockWf.cancel).toHaveBeenCalledWith(wid("wf1"), false);
    expect(mockScheduler.cancel).toHaveBeenCalledWith(wid("wf1"));
  });

  it("passes force flag", async () => {
    const wf = makeWorkflow({ id: "wf1", state: "paused" });
    mockWf.get.mockReturnValue(wf);
    mockWf.cancel.mockImplementation(() => {});

    await router.route(
      "workflow.cancel",
      { id: "wf1", force: true },
      mockApi,
    );

    expect(mockWf.cancel).toHaveBeenCalledWith(wid("wf1"), true);
  });

  it("returns error for unknown workflow", async () => {
    const err = new Error("Workflow not found: ghost");
    err.name = "WorkflowNotFoundError";
    mockWf.cancel.mockImplementation(() => {
      throw err;
    });

    const response = await router.route(
      "workflow.cancel",
      { id: "ghost" },
      mockApi,
    );
    const { error } = response as { error: { code: number; message: string } };

    expect(error.code).toBe(-32001);
    expect(error.message).toContain("Workflow not found");
  });
});

// ─── workflow.start ──────────────────────────────────────────────────

describe("RPCRouter — workflow.start", () => {
  it("starts a workflow (fire and forget) and returns started status", async () => {
    const wf = makeWorkflow({ id: "wf1", state: "running" });
    mockWf.get.mockReturnValue(wf);
    mockWf.start.mockImplementation(() => {});

    const schedulerResult: SchedulerResult = {
      workflowId: wid("wf1"),
      completed: [sid("s1")],
      failed: [],
      totalDurationMs: 100,
    };
    mockScheduler.execute.mockResolvedValue(schedulerResult);

    const response = await router.route(
      "workflow.start",
      { id: "wf1" },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };

    expect(result.id).toBe("wf1");
    expect(result.status).toBe("running");
    expect(result.startedAt).toBeTypeOf("number");
    expect(mockWf.start).toHaveBeenCalledWith(wid("wf1"));
    expect(mockScheduler.execute).toHaveBeenCalledWith(wid("wf1"), mockApi);
  });

  it("returns running status even if get returns undefined", async () => {
    mockWf.get.mockReturnValue(undefined);
    mockWf.start.mockImplementation(() => {});

    const response = await router.route(
      "workflow.start",
      { id: "wf1" },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };

    expect(result.status).toBe("running");
    expect(result.id).toBe("wf1");
  });

  it("returns error when start throws", async () => {
    mockWf.start.mockImplementation(() => {
      throw new Error("Invalid state");
    });

    const response = await router.route(
      "workflow.start",
      { id: "wf1" },
      mockApi,
    );
    const { error } = response as { error: { code: number; message: string } };

    expect(error).toBeDefined();
    expect(error.code).toBe(-32603);
    expect(error.message).toBe("Invalid state");
  });
});

// ─── workflow.pause ──────────────────────────────────────────────────

describe("RPCRouter — workflow.pause", () => {
  it("pauses a running workflow", async () => {
    const wf = makeWorkflow({ id: "wf1", state: "paused" });
    mockWf.get.mockReturnValue(wf);
    mockWf.pause.mockImplementation(() => {});

    const response = await router.route(
      "workflow.pause",
      { id: "wf1" },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };

    expect(result.id).toBe("wf1");
    expect(result.status).toBe("paused");
    expect(result.pausedAt).toBeTypeOf("number");
    expect(mockWf.pause).toHaveBeenCalledWith(wid("wf1"));
  });
});

// ─── workflow.resume ─────────────────────────────────────────────────

describe("RPCRouter — workflow.resume", () => {
  it("resumes a paused workflow", async () => {
    const wf = makeWorkflow({ id: "wf1", state: "running" });
    mockWf.get.mockReturnValue(wf);
    mockWf.resume.mockImplementation(() => {});

    const response = await router.route(
      "workflow.resume",
      { id: "wf1" },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };

    expect(result.id).toBe("wf1");
    expect(result.status).toBe("running");
    expect(result.resumedAt).toBeTypeOf("number");
    expect(mockWf.resume).toHaveBeenCalledWith(wid("wf1"));
    expect(mockScheduler.execute).toHaveBeenCalledWith(wid("wf1"), mockApi);
  });
});

// ─── workflow.retry ──────────────────────────────────────────────────

describe("RPCRouter — workflow.retry", () => {
  it("retries a failed workflow", async () => {
    const wf = makeWorkflow({ id: "wf1", state: "queued" });
    mockWf.get.mockReturnValue(wf);
    mockWf.retry.mockImplementation(() => {});

    const response = await router.route(
      "workflow.retry",
      { id: "wf1" },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };

    expect(result.id).toBe("wf1");
    expect(result.status).toBe("queued");
    expect(result.retriedAt).toBeTypeOf("number");
    expect(mockWf.retry).toHaveBeenCalledWith(wid("wf1"));
  });
});

// ─── workflow.delete ─────────────────────────────────────────────────

describe("RPCRouter — workflow.delete", () => {
  it("deletes a workflow", async () => {
    mockWf.delete.mockImplementation(() => {});

    const response = await router.route(
      "workflow.delete",
      { id: "wf1" },
      mockApi,
    );
    const { result } = response as { result: Record<string, unknown> };

    expect(result.deleted).toBe(true);
    expect(mockWf.delete).toHaveBeenCalledWith(wid("wf1"));
  });

  it("returns error when deleting non-existent workflow", async () => {
    const err = new Error("Workflow not found: ghost");
    err.name = "WorkflowNotFoundError";
    mockWf.delete.mockImplementation(() => {
      throw err;
    });

    const response = await router.route(
      "workflow.delete",
      { id: "ghost" },
      mockApi,
    );
    const { error } = response as { error: { code: number; message: string } };

    expect(error.code).toBe(-32001);
  });
});

// ─── agent.listDisciplines ───────────────────────────────────────────

describe("RPCRouter — agent.listDisciplines", () => {
  it("returns all available disciplines", async () => {
    const response = await router.route(
      "agent.listDisciplines",
      {},
      mockApi,
    );
    const { result } = response as {
      result: {
        disciplines: Array<{
          name: string;
          description: string;
          defaultModel: string;
          maxTokens: number;
          tools: string[];
        }>;
      };
    };

    expect(result.disciplines).toHaveLength(4);
    const names = result.disciplines.map((d) => d.name);
    expect(names).toContain("deep");
    expect(names).toContain("quick");
    expect(names).toContain("visual");
    expect(names).toContain("ultrabrain");

    for (const d of result.disciplines) {
      expect(d.name).toBeTypeOf("string");
      expect(d.description).toBeTypeOf("string");
      expect(d.defaultModel).toBeTypeOf("string");
      expect(d.maxTokens).toBeTypeOf("number");
      expect(Array.isArray(d.tools)).toBe(true);
    }
  });
});

// ─── Error handling ──────────────────────────────────────────────────

describe("RPCRouter — error handling", () => {
  it("invalid method returns JSON-RPC error -32601", async () => {
    const result = await router.route("foo.bar", {}, mockApi);
    expect(result).toEqual({
      error: {
        code: -32601,
        message: "Method not found: foo.bar",
      },
    });
  });

  it("Error thrown in handler returns -32603 Internal error", async () => {
    mockWf.start.mockImplementation(() => {
      throw new Error("Something went wrong");
    });

    const result = await router.route(
      "workflow.start",
      { id: "wf1" },
      mockApi,
    );

    expect(result).toEqual({
      error: {
        code: -32603,
        message: "Something went wrong",
      },
    });
  });

  it("WorkflowNotFoundError returns -32001", async () => {
    const err = new Error("Workflow not found: bad-id");
    err.name = "WorkflowNotFoundError";
    mockWf.cancel.mockImplementation(() => {
      throw err;
    });

    const result = await router.route(
      "workflow.cancel",
      { id: "bad-id" },
      mockApi,
    );

    expect(result).toEqual({
      error: {
        code: -32001,
        message: "Workflow not found: bad-id",
      },
    });
  });

  it("InvalidTransitionError returns -32002", async () => {
    const err = new Error('Invalid transition "completed" → "cancelled"');
    err.name = "InvalidTransitionError";
    mockWf.cancel.mockImplementation(() => {
      throw err;
    });

    const result = await router.route(
      "workflow.cancel",
      { id: "wf1" },
      mockApi,
    );

    expect(result).toEqual({
      error: {
        code: -32002,
        message: 'Invalid transition "completed" → "cancelled"',
      },
    });
  });

  it("non-Error thrown uses String() fallback", async () => {
    mockWf.start.mockImplementation(() => {
      throw "string error"; // eslint-disable-line no-throw-literal
    });

    const result = await router.route(
      "workflow.start",
      { id: "wf1" },
      mockApi,
    );

    expect(result).toEqual({
      error: {
        code: -32603,
        message: "string error",
      },
    });
  });

  it("missing required params (empty steps) throws error", async () => {
    const result = await router.route("workflow.create", { steps: [] }, mockApi);

    expect(result).toHaveProperty("error");
    const { error } = result as { error: { code: number; message: string } };
    expect(error.code).toBe(-32603);
    expect(error.message).toContain("At least one step");
  });

  it("null thrown as non-Error fallback", async () => {
    mockWf.delete.mockImplementation(() => {
      throw null; // eslint-disable-line no-throw-literal
    });

    const result = await router.route(
      "workflow.delete",
      { id: "wf1" },
      mockApi,
    );

    expect(result).toEqual({
      error: {
        code: -32603,
        message: "null",
      },
    });
  });
});
