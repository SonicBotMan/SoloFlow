import { describe, it, expect, beforeEach } from "bun:test";
import { HookSystem, getMetrics, registerBuiltinHooks, type HookContext, type HookEvent } from "../src/hooks";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<HookContext>): HookContext {
  return {
    event: "workflow:started",
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── register() ───────────────────────────────────────────────────────────

describe("HookSystem — register()", () => {
  let system: HookSystem;

  beforeEach(() => {
    system = new HookSystem();
  });

  it("registers a handler for an event", () => {
    const calls: HookContext[] = [];
    system.register("workflow:started", (ctx) => calls.push(ctx));
    const ctx = makeContext();
    system.emit("workflow:started", ctx);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(ctx);
  });

  it("returns an unsubscribe function that works", () => {
    const calls: HookContext[] = [];
    const unsub = system.register("workflow:started", (ctx) => calls.push(ctx));
    const ctx = makeContext();

    // handler fires before unsubscribe
    system.emit("workflow:started", ctx);
    expect(calls).toHaveLength(1);

    // unsubscribe
    unsub();

    // handler no longer fires
    system.emit("workflow:started", ctx);
    expect(calls).toHaveLength(1);
  });

  it("can register multiple handlers for the same event", () => {
    const callsA: string[] = [];
    const callsB: string[] = [];

    system.register("workflow:completed", () => callsA.push("a"));
    system.register("workflow:completed", () => callsB.push("b"));

    system.emit("workflow:completed", makeContext({ event: "workflow:completed" }));

    expect(callsA).toEqual(["a"]);
    expect(callsB).toEqual(["b"]);
  });

  it("does not mix handlers across different events", () => {
    const started: string[] = [];
    const completed: string[] = [];

    system.register("workflow:started", () => started.push("fired"));
    system.register("workflow:completed", () => completed.push("fired"));

    system.emit("workflow:started", makeContext({ event: "workflow:started" }));

    expect(started).toEqual(["fired"]);
    expect(completed).toEqual([]);
  });
});

// ─── unregister() ─────────────────────────────────────────────────────────

describe("HookSystem — unregister()", () => {
  let system: HookSystem;

  beforeEach(() => {
    system = new HookSystem();
  });

  it("removes a specific handler", () => {
    const calls: string[] = [];
    const handler = () => calls.push("called");

    system.register("workflow:started", handler);
    system.unregister("workflow:started", handler);

    system.emit("workflow:started", makeContext());
    expect(calls).toHaveLength(0);
  });

  it("removed handler is no longer called on emit", () => {
    const callsA: string[] = [];
    const callsB: string[] = [];
    const handlerA = () => callsA.push("a");
    const handlerB = () => callsB.push("b");

    system.register("workflow:started", handlerA);
    system.register("workflow:started", handlerB);

    system.unregister("workflow:started", handlerA);

    system.emit("workflow:started", makeContext());

    expect(callsA).toHaveLength(0);
    expect(callsB).toEqual(["b"]);
  });

  it("is safe to unregister a handler that was never registered", () => {
    expect(() => {
      system.unregister("workflow:started", () => {});
    }).not.toThrow();
  });
});

// ─── emit() (sync) ────────────────────────────────────────────────────────

describe("HookSystem — emit()", () => {
  let system: HookSystem;

  beforeEach(() => {
    system = new HookSystem();
  });

  it("calls all registered handlers synchronously", () => {
    const order: number[] = [];
    system.register("workflow:started", () => order.push(1));
    system.register("workflow:started", () => order.push(2));
    system.register("workflow:started", () => order.push(3));

    system.emit("workflow:started", makeContext());
    expect(order).toEqual([1, 2, 3]);
  });

  it("passes correct context to each handler", () => {
    const received: HookContext[] = [];
    const ctx = makeContext({ event: "step:completed", metadata: { key: "value" } });

    system.register("step:completed", (c) => received.push(c));
    system.register("step:completed", (c) => received.push(c));

    system.emit("step:completed", ctx);
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(ctx);
    expect(received[1]).toBe(ctx);
  });

  it("does not throw and continues calling handlers when one throws", () => {
    const calls: string[] = [];

    system.register("workflow:started", () => calls.push("before"));
    system.register("workflow:started", () => {
      calls.push("throwing");
      throw new Error("handler error");
    });
    system.register("workflow:started", () => calls.push("after"));

    // emit swallows errors — should not throw
    expect(() => system.emit("workflow:started", makeContext())).not.toThrow();
    expect(calls).toEqual(["before", "throwing", "after"]);
  });

  it("does nothing when no handlers are registered for the event", () => {
    expect(() => system.emit("workflow:cancelled", makeContext({ event: "workflow:cancelled" }))).not.toThrow();
  });
});

// ─── emitAsync() ──────────────────────────────────────────────────────────

describe("HookSystem — emitAsync()", () => {
  let system: HookSystem;

  beforeEach(() => {
    system = new HookSystem();
  });

  it("awaits all async handlers", async () => {
    const order: string[] = [];

    system.register("workflow:completed", async () => {
      await Promise.resolve();
      order.push("async-a");
    });
    system.register("workflow:completed", async () => {
      order.push("async-b");
    });

    await system.emitAsync("workflow:completed", makeContext({ event: "workflow:completed" }));

    expect(order).toContain("async-a");
    expect(order).toContain("async-b");
    expect(order).toHaveLength(2);
  });

  it("handles mix of sync and async handlers", async () => {
    const calls: string[] = [];

    system.register("workflow:started", () => calls.push("sync"));
    system.register("workflow:started", async () => {
      await Promise.resolve();
      calls.push("async");
    });

    await system.emitAsync("workflow:started", makeContext());

    expect(calls).toContain("sync");
    expect(calls).toContain("async");
  });

  it("swallows async handler errors without stopping others", async () => {
    const calls: string[] = [];

    system.register("workflow:started", async () => {
      calls.push("before");
    });
    system.register("workflow:started", async () => {
      calls.push("failing");
      throw new Error("async boom");
    });
    system.register("workflow:started", async () => {
      calls.push("after");
    });

    await system.emitAsync("workflow:started", makeContext());

    expect(calls).toContain("before");
    expect(calls).toContain("failing");
    expect(calls).toContain("after");
  });

  it("resolves without error when no handlers registered", async () => {
    await expect(
      system.emitAsync("workflow:paused", makeContext({ event: "workflow:paused" })),
    ).resolves.toBeUndefined();
  });
});

// ─── clear() ──────────────────────────────────────────────────────────────

describe("HookSystem — clear()", () => {
  let system: HookSystem;

  beforeEach(() => {
    system = new HookSystem();
  });

  it("removes all handlers for every event", () => {
    const calls: string[] = [];

    system.register("workflow:started", () => calls.push("started"));
    system.register("workflow:completed", () => calls.push("completed"));
    system.register("step:failed", () => calls.push("failed"));

    system.clear();

    system.emit("workflow:started", makeContext({ event: "workflow:started" }));
    system.emit("workflow:completed", makeContext({ event: "workflow:completed" }));
    system.emit("step:failed", makeContext({ event: "step:failed" }));

    expect(calls).toHaveLength(0);
  });

  it("allows re-registration after clear", () => {
    const calls: string[] = [];

    system.register("workflow:started", () => calls.push("old"));
    system.clear();
    system.register("workflow:started", () => calls.push("new"));

    system.emit("workflow:started", makeContext());

    expect(calls).toEqual(["new"]);
  });
});

// ─── getMetrics() ─────────────────────────────────────────────────────────

describe("getMetrics()", () => {
  // Note: getMetrics reads from a module-level singleton accumulator.
  // The built-in hooks (onWorkflowStart, onWorkflowComplete, onWorkflowFail)
  // update these metrics. We test by wiring built-in hooks into a fresh system.

  it("returns an object with started, completed, failed, totalDurationMs", () => {
    const m = getMetrics();
    expect(m).toHaveProperty("started");
    expect(m).toHaveProperty("completed");
    expect(m).toHaveProperty("failed");
    expect(m).toHaveProperty("totalDurationMs");
    expect(typeof m.started).toBe("number");
    expect(typeof m.completed).toBe("number");
    expect(typeof m.failed).toBe("number");
    expect(typeof m.totalDurationMs).toBe("number");
  });

  it("tracks metrics correctly when built-in hooks fire", () => {
    // getMetrics reads from a module-level singleton updated by registerBuiltinHooks
    const system = new HookSystem();
    const unsub = registerBuiltinHooks(system);

    const before = { ...getMetrics() };

    // Simulate workflow:start
    system.emit("workflow:started", makeContext({
      event: "workflow:started",
      workflow: {
        id: "wf-1" as any,
        name: "test-wf",
        description: "",
        steps: new Map(),
        dag: { nodes: new Map(), edges: [], layers: [] },
        state: "running",
        currentSteps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      },
    }));

    const afterStart = getMetrics();
    expect(afterStart.started).toBe(before.started + 1);

    // Simulate workflow:completed
    system.emit("workflow:completed", makeContext({
      event: "workflow:completed",
      workflow: {
        id: "wf-1" as any,
        name: "test-wf",
        description: "",
        steps: new Map(),
        dag: { nodes: new Map(), edges: [], layers: [] },
        state: "completed",
        currentSteps: [],
        createdAt: Date.now() - 100,
        updatedAt: Date.now(),
        metadata: {},
      },
    }));

    const afterComplete = getMetrics();
    expect(afterComplete.completed).toBe(before.completed + 1);
    expect(afterComplete.totalDurationMs).toBeGreaterThanOrEqual(before.totalDurationMs);

    // Simulate workflow:failed
    system.emit("workflow:failed", makeContext({
      event: "workflow:failed",
      metadata: { error: "something broke" },
    }));

    const afterFail = getMetrics();
    expect(afterFail.failed).toBe(before.failed + 1);

    unsub();
  });
});
