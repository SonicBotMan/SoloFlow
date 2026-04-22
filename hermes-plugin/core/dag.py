"""
DAG engine for SoloFlow workflow orchestration.

Implements Kahn's algorithm for topological sorting with cycle detection,
layer computation, and ready-step identification.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from models import DAG, Edge, Layer, StepState

if TYPE_CHECKING:
    from models import Discipline


def build_dag(steps, edges: list) -> DAG:
    """Build a DAG from steps and edges."""
    # Normalize steps: list[dict] → dict[str, dict]
    if isinstance(steps, list):
        steps = {s["id"]: s for s in steps}

    # Normalize edges: list[tuple/list] or [{"from", "to"}] → list[Edge]
    norm_edges: list[Edge] = []
    for e in edges:
        if isinstance(e, (list, tuple)):
            norm_edges.append(Edge(from_id=e[0], to_id=e[1]))
        elif isinstance(e, dict):
            # Handle {"from": x, "to": y} format from get_workflow()
            norm_edges.append(Edge(from_id=e["from"], to_id=e["to"]))
        else:
            norm_edges.append(e)
    edges = norm_edges

    # Build node map from steps
    nodes: dict[str, dict] = {}
    for step_id, step in steps.items():
        disc = step.discipline if hasattr(step, "discipline") else step.get("discipline", "general")
        name = step.name if hasattr(step, "name") else step.get("name", step_id)
        nodes[step_id] = {
            "id": step_id,
            "dependencies": [e.from_id for e in edges if e.to_id == step_id],
            "discipline": disc,
            "action": name,
        }

    dag = DAG(nodes=nodes, edges=edges, layers=[])

    # Check for cycles before proceeding
    cycle = detect_cycle(dag)
    if cycle:
        raise ValueError(f"Circular dependency detected: {' → '.join(cycle)}")

    # Compute layers
    dag.layers = compute_layers(dag)

    return dag


def compute_layers(dag: DAG) -> list[Layer]:
    """Compute execution layers using Kahn's algorithm."""
    if not dag.nodes:
        return []

    in_degree: dict[str, int] = {node_id: 0 for node_id in dag.nodes}

    for edge in dag.edges:
        if edge.to_id in in_degree:
            in_degree[edge.to_id] += 1

    layers: list[Layer] = []

    # Start with nodes that have zero in-degree (sorted for determinism)
    zero_degree_nodes = sorted(
        [node_id for node_id, degree in in_degree.items() if degree == 0]
    )

    remaining_in_degree = dict(in_degree)
    processed: set[str] = set()

    while zero_degree_nodes:
        current_layer = Layer(index=len(layers), step_ids=zero_degree_nodes)
        layers.append(current_layer)

        for node_id in zero_degree_nodes:
            processed.add(node_id)

        next_zero_degree: list[str] = []

        for node_id in zero_degree_nodes:
            for edge in dag.edges:
                if edge.from_id == node_id and edge.to_id not in processed and edge.to_id in remaining_in_degree:
                    remaining_in_degree[edge.to_id] -= 1
                    if remaining_in_degree[edge.to_id] == 0:
                        next_zero_degree.append(edge.to_id)

        zero_degree_nodes = sorted(next_zero_degree)

    if len(processed) != len(dag.nodes):
        unprocessed = set(dag.nodes.keys()) - processed
        raise ValueError(f"Circular dependency detected involving: {unprocessed}")

    return layers


def topological_sort(dag: DAG) -> list[str]:
    """Get topologically sorted step IDs."""
    result: list[str] = []
    for layer in dag.layers:
        result.extend(layer.step_ids)
    return result


def get_ready_steps(dag: DAG, steps: dict) -> list[str]:
    """Get steps that are ready to execute (all with satisfied dependencies, not just layer 0)."""
    completed_ids = {
        step_id
        for step_id, step in steps.items()
        if step.get("state") == StepState.COMPLETED.value
    }

    ready: list[str] = []
    for step_id, node in dag.nodes.items():
        step = steps.get(step_id)
        if not step:
            continue

        # Skip non-pending steps
        if step.get("state") not in (StepState.PENDING.value, StepState.READY.value):
            continue

        # Check all dependencies are satisfied
        dependencies = node.get("dependencies", [])
        if all(dep_id in completed_ids for dep_id in dependencies):
            ready.append(step_id)

    return sorted(ready)


def detect_cycle(dag: DAG) -> list[str] | None:
    """Detect if there's a cycle in the DAG using DFS."""
    if not dag.nodes:
        return None

    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {node_id: WHITE for node_id in dag.nodes.keys()}
    stack: list[str] = []

    def dfs(node_id: str) -> list[str] | None:
        color[node_id] = GRAY
        stack.append(node_id)

        node = dag.nodes.get(node_id)
        if node:
            for dep_id in node.get("dependencies", []):
                if dep_id not in dag.nodes:
                    continue
                if color.get(dep_id, WHITE) == GRAY:
                    cycle_start = stack.index(dep_id)
                    return stack[cycle_start:] + [dep_id]
                if color.get(dep_id, WHITE) == WHITE:
                    result = dfs(dep_id)
                    if result:
                        return result

        color[node_id] = BLACK
        stack.pop()
        return None

    for node_id in dag.nodes.keys():
        if color[node_id] == WHITE:
            result = dfs(node_id)
            if result:
                return result

    return None
