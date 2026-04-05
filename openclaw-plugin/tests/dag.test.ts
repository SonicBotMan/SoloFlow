import { describe, it, expect } from "bun:test";
import { buildDAG, topologicalSort, getReadySteps, detectCycle } from "../src/core/dag";
import type { WorkflowStep, StepId } from "../src/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Create a WorkflowStep with sensible defaults. */
function step(
  id: string,
  deps: string[] = [],
  discipline: "deep" | "quick" | "visual" | "ultrabrain" = "quick",
): WorkflowStep {
  return {
    id: id as unknown as StepId,
    name: `Step ${id}`,
    discipline,
    dependencies: deps as StepId[],
    config: {},
    state: "pending",
  };
}

// ─── buildDAG ─────────────────────────────────────────────────────────────

describe("buildDAG", () => {
  it("builds a DAG from a flat list of steps", () => {
    const steps = [step("a"), step("b"), step("c")];
    const dag = buildDAG(steps);

    expect(dag.nodes.size).toBe(3);
    expect(dag.edges.length).toBe(0);
  });

  it("creates edges from dependencies", () => {
    const steps = [step("a"), step("b", ["a"]), step("c", ["b"])];
    const dag = buildDAG(steps);

    expect(dag.edges).toEqual([
      { from: "a" as StepId, to: "b" as StepId },
      { from: "b" as StepId, to: "c" as StepId },
    ]);
  });

  it("populates node fields correctly", () => {
    const steps = [step("x", [], "deep")];
    const dag = buildDAG(steps);
    const node = dag.nodes.get("x" as StepId);

    expect(node).toBeDefined();
    expect(node!.id).toBe("x" as StepId);
    expect(node!.dependencies).toEqual([]);
    expect(node!.discipline).toBe("deep");
    expect(node!.action).toBe("Step x");
  });

  it("handles diamond dependency graph", () => {
    //     a
    //    / \
    //   b   c
    //    \ /
    //     d
    const steps = [
      step("a"),
      step("b", ["a"]),
      step("c", ["a"]),
      step("d", ["b", "c"]),
    ];
    const dag = buildDAG(steps);

    expect(dag.nodes.size).toBe(4);
    expect(dag.edges.length).toBe(4);
  });
});

// ─── topologicalSort ──────────────────────────────────────────────────────

describe("topologicalSort", () => {
  it("returns a flat order respecting dependencies", () => {
    const steps = [step("a"), step("b", ["a"]), step("c", ["b"])];
    const dag = buildDAG(steps);
    const order = topologicalSort(dag);

    const idxA = order.indexOf("a" as StepId);
    const idxB = order.indexOf("b" as StepId);
    const idxC = order.indexOf("c" as StepId);

    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it("preserves all nodes", () => {
    const steps = [step("x"), step("y"), step("z")];
    const dag = buildDAG(steps);
    const order = topologicalSort(dag);

    expect(order).toHaveLength(3);
    expect(order).toContain("x" as StepId);
    expect(order).toContain("y" as StepId);
    expect(order).toContain("z" as StepId);
  });

  it("handles diamond graph with correct ordering", () => {
    const steps = [
      step("a"),
      step("b", ["a"]),
      step("c", ["a"]),
      step("d", ["b", "c"]),
    ];
    const dag = buildDAG(steps);
    const order = topologicalSort(dag);

    const idx = (id: string) => order.indexOf(id as StepId);

    expect(idx("a")).toBeLessThan(idx("b"));
    expect(idx("a")).toBeLessThan(idx("c"));
    expect(idx("b")).toBeLessThan(idx("d"));
    expect(idx("c")).toBeLessThan(idx("d"));
  });
});

// ─── detectCycle ──────────────────────────────────────────────────────────

describe("detectCycle", () => {
  it("returns null for acyclic graphs", () => {
    const steps = [step("a"), step("b", ["a"]), step("c", ["b"])];
    const dag = buildDAG(steps);

    expect(detectCycle(dag)).toBeNull();
  });

  it("detects a simple self-referencing cycle via dependencies", () => {
    // Manually construct a DAG with a cycle: a → b → a
    const steps = [step("a"), step("b", ["a"])];
    const dag = buildDAG(steps);

    // Inject cycle: b depends on a, now make a depend on b
    const nodeA = dag.nodes.get("a" as StepId)!;
    const nodeB = dag.nodes.get("b" as StepId)!;
    // Mutate the internal deps to create cycle (buildDAG won't create cycles on its own)
    (nodeA as { dependencies: StepId[] }).dependencies = ["b" as StepId];

    const cycle = detectCycle(dag);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThan(0);
  });

  it("returns null for empty graph", () => {
    const dag = buildDAG([]);
    expect(detectCycle(dag)).toBeNull();
  });

  it("returns null for a single node with no dependencies", () => {
    const dag = buildDAG([step("solo")]);
    expect(detectCycle(dag)).toBeNull();
  });
});

// ─── getReadySteps ────────────────────────────────────────────────────────

describe("getReadySteps", () => {
  it("returns all root steps when nothing is completed", () => {
    const steps = [step("a"), step("b"), step("c", ["a"])];
    const dag = buildDAG(steps);

    const ready = getReadySteps(dag, new Set(), new Set());

    expect(ready).toContain("a" as StepId);
    expect(ready).toContain("b" as StepId);
    expect(ready).not.toContain("c" as StepId);
  });

  it("returns next steps after dependencies are completed", () => {
    const steps = [step("a"), step("b", ["a"]), step("c", ["b"])];
    const dag = buildDAG(steps);

    const ready = getReadySteps(dag, new Set(["a" as StepId]), new Set());
    expect(ready).toEqual(["b" as StepId]);
  });

  it("excludes running steps", () => {
    const steps = [step("a"), step("b")];
    const dag = buildDAG(steps);

    const ready = getReadySteps(dag, new Set(), new Set(["a" as StepId]));
    expect(ready).toEqual(["b" as StepId]);
  });

  it("excludes completed steps", () => {
    const steps = [step("a"), step("b")];
    const dag = buildDAG(steps);

    const ready = getReadySteps(dag, new Set(["a" as StepId]), new Set());
    expect(ready).toEqual(["b" as StepId]);
  });

  it("returns empty array when all steps are completed or running", () => {
    const steps = [step("a"), step("b", ["a"])];
    const dag = buildDAG(steps);

    const ready = getReadySteps(
      dag,
      new Set(["a" as StepId]),
      new Set(["b" as StepId]),
    );
    expect(ready).toEqual([]);
  });

  it("handles diamond dependency: d becomes ready after b and c complete", () => {
    const steps = [
      step("a"),
      step("b", ["a"]),
      step("c", ["a"]),
      step("d", ["b", "c"]),
    ];
    const dag = buildDAG(steps);

    // Only b completed — d is NOT ready
    let ready = getReadySteps(dag, new Set(["a" as StepId, "b" as StepId]), new Set());
    expect(ready).not.toContain("d" as StepId);

    // Both b and c completed — d IS ready
    ready = getReadySteps(
      dag,
      new Set(["a" as StepId, "b" as StepId, "c" as StepId]),
      new Set(),
    );
    expect(ready).toEqual(["d" as StepId]);
  });
});
