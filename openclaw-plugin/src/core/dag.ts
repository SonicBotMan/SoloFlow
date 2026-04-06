import type { DAG, DAGEdge, DAGNode, StepId, WorkflowStep } from "../types.js";

export function buildDAG(steps: WorkflowStep[]): DAG {
  const nodes = new Map<StepId, DAGNode>();
  const edges: DAGEdge[] = [];

  for (const step of steps) {
    nodes.set(step.id, {
      id: step.id,
      dependencies: step.dependencies,
      discipline: step.discipline,
      action: step.name,
    });
    for (const dep of step.dependencies) {
      edges.push({ from: dep, to: step.id });
    }
  }

  const visited = new Set<StepId>();
  const layers: StepId[][] = [];

  function visit(id: StepId, depth: number) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) return;
    for (const dep of node.dependencies) visit(dep, depth + 1);
    (layers[depth] ??= []).push(id);
  }

  for (const id of nodes.keys()) visit(id, 0);
  return { nodes, edges, layers: layers.filter(Boolean) };
}

export function topologicalSort(dag: DAG): StepId[] {
  return dag.layers.flat();
}

export function getReadySteps(
  dag: DAG,
  completed: Set<StepId>,
  running: Set<StepId>,
): StepId[] {
  const ready: StepId[] = [];
  for (const [id, node] of dag.nodes) {
    if (completed.has(id) || running.has(id)) continue;
    if (node.dependencies.every((d) => completed.has(d))) {
      ready.push(id);
    }
  }
  return ready;
}

export function detectCycle(dag: DAG): StepId[] | null {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<StepId, number>();
  for (const id of dag.nodes.keys()) color.set(id, WHITE);

  const path: StepId[] = [];

  function dfs(id: StepId): boolean {
    color.set(id, GRAY);
    path.push(id);
    const node = dag.nodes.get(id);
    if (node) {
      for (const dep of node.dependencies) {
        if (color.get(dep) === GRAY) return true;
        if (color.get(dep) === WHITE && dfs(dep)) return true;
      }
    }
    color.set(id, BLACK);
    path.pop();
    return false;
  }

  for (const id of dag.nodes.keys()) {
    if (color.get(id) === WHITE && dfs(id)) return path;
  }
  return null;
}
