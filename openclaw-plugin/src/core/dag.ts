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

  // Detect cycle using the existing exported function
  const cycle = detectCycle({ nodes, edges, layers: [] });
  if (cycle) {
    throw new Error(`Circular dependency: ${cycle.join(" → ")}`);
  }

  // Compute in-degrees: number of dependencies each node has
  const inDegree = new Map<StepId, number>();
  for (const id of nodes.keys()) inDegree.set(id, 0);
  for (const [, node] of nodes) {
    inDegree.set(node.id, node.dependencies.length);
  }

  // Kahn's algorithm: layer 0 = nodes with 0 dependencies (roots)
  const layers: StepId[][] = [];
  const remaining = new Map(inDegree);
  let queue = Array.from(remaining.entries())
    .filter(([, d]) => d === 0)
    .map(([id]) => id);

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue: StepId[] = [];
    for (const id of queue) {
      // This node is done; decrement the in-degree of its dependents
      for (const [otherId, otherNode] of nodes) {
        if (otherNode.dependencies.includes(id)) {
          const newDeg = (remaining.get(otherId) ?? 0) - 1;
          remaining.set(otherId, newDeg);
          if (newDeg === 0) nextQueue.push(otherId);
        }
      }
    }
    queue = nextQueue;
  }

  return { nodes, edges, layers };
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
