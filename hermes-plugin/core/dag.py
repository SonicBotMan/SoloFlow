"""
DAG engine for SoloFlow workflow orchestration.

Implements Kahn's algorithm for topological sorting with cycle detection,
layer computation, and ready-step identification.

The key fix: disconnected nodes (no incoming edges) are sorted alphabetically
to ensure deterministic ordering.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from models import DAG, Edge, Layer, Step, StepState

if TYPE_CHECKING:
    from models import Discipline


def build_dag(steps, edges: list[Edge]) -> DAG:
    """
    Build a DAG from steps and edges.

    Args:
        steps: dict mapping step IDs to Step objects, OR a list of step dicts.
        edges: List of Edge objects or (from_id, to_id) tuples.

    Returns:
        A DAG object with nodes, edges, and computed layers.

    Raises:
        ValueError: If a cycle is detected in the graph.
    """
    # Normalize steps: list[dict] → dict[str, dict]
    if isinstance(steps, list):
        steps = {s["id"]: s for s in steps}

    # Normalize edges: list[tuple] → list[Edge]
    norm_edges: list[Edge] = []
    for e in edges:
        if isinstance(e, (list, tuple)):
            norm_edges.append(Edge(from_id=e[0], to_id=e[1]))
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
    """
    Compute execution layers using Kahn's algorithm.

    Layers are computed such that steps in the same layer can execute
    in parallel (they have no dependencies on each other).

    Args:
        dag: The DAG to compute layers for.

    Returns:
        List of Layer objects sorted by index.

    Raises:
        ValueError: If a cycle is detected in the graph.
    """
    if not dag.nodes:
        return []

    # Build in-degree map: count of incoming edges for each node
    in_degree: dict[str, int] = {node_id: 0 for node_id in dag.nodes}

    # For each edge, increment in-degree of target node
    for edge in dag.edges:
        if edge.to_id in in_degree:
            in_degree[edge.to_id] += 1

    layers: list[Layer] = []

    # Start with nodes that have zero in-degree (no dependencies)
    # IMPORTANT FIX: Sort alphabetically for deterministic ordering
    zero_degree_nodes = sorted(
        [node_id for node_id, degree in in_degree.items() if degree == 0]
    )

    remaining_in_degree = dict(in_degree)
    processed: set[str] = set()

    while zero_degree_nodes:
        # Create new layer with current zero-degree nodes (already sorted)
        current_layer = Layer(index=len(layers), step_ids=zero_degree_nodes)
        layers.append(current_layer)

        # Mark these nodes as processed
        for node_id in zero_degree_nodes:
            processed.add(node_id)

        # Find nodes that depend on the current layer's nodes
        next_zero_degree: list[str] = []

        for node_id in zero_degree_nodes:
            # Find all nodes that depend on this node
            for edge in dag.edges:
                if edge.from_id == node_id and edge.to_id not in processed:
                    remaining_in_degree[edge.to_id] -= 1
                    if remaining_in_degree[edge.to_id] == 0:
                        next_zero_degree.append(edge.to_id)

        # Sort for deterministic ordering
        zero_degree_nodes = sorted(next_zero_degree)

    # Check if all nodes were processed (no cycles)
    if len(processed) != len(dag.nodes):
        unprocessed = set(dag.nodes.keys()) - processed
        raise ValueError(f"Circular dependency detected involving: {unprocessed}")

    return layers


def topological_sort(dag: DAG) -> list[str]:
    """
    Get topologically sorted step IDs.

    The sort is based on the layer structure computed during build_dag.
    Within each layer, steps are sorted alphabetically for determinism.

    Args:
        dag: The DAG to sort.

    Returns:
        List of step IDs in topological order.
    """
    result: list[str] = []
    for layer in dag.layers:
        result.extend(layer.step_ids)
    return result


def get_ready_steps(dag: DAG, steps: dict[str, Step]) -> list[str]:
    """
    Get steps that are ready to execute.

    A step is ready when:
    1. It is in the current (first unprocessed) layer
    2. All its dependencies have been completed

    Args:
        dag: The DAG structure.
        steps: Dictionary of step ID to Step objects.

    Returns:
        List of step IDs that are ready to execute.
    """
    if not dag.layers:
        return []

    # Get the current layer (first layer with uncompleted steps)
    current_layer = dag.layers[0]

    ready: list[str] = []

    # Get completed step IDs
    completed_ids = {
        step_id
        for step_id, step in steps.items()
        if step.state == StepState.COMPLETED
    }

    for step_id in current_layer.step_ids:
        step = steps.get(step_id)
        if not step:
            continue

        # Skip if already completed, running, or failed
        if step.state in (StepState.COMPLETED, StepState.RUNNING, StepState.FAILED):
            continue

        # Get dependencies for this step from the DAG nodes
        node = dag.nodes.get(step_id)
        if not node:
            continue

        dependencies = node.get("dependencies", [])

        # Check if all dependencies are completed
        if all(dep_id in completed_ids for dep_id in dependencies):
            ready.append(step_id)

    # Sort alphabetically for deterministic ordering
    return sorted(ready)


def detect_cycle(dag: DAG) -> list[str] | None:
    """
    Detect if there's a cycle in the DAG using DFS (Tarjan's algorithm).

    Args:
        dag: The DAG to check.

    Returns:
        List of node IDs forming the cycle, or None if no cycle exists.
    """
    if not dag.nodes:
        return None

    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {node_id: WHITE for node_id in dag.nodes.keys()}
    stack: list[str] = []

    def dfs(node_id: str) -> list[str] | None:
        """DFS helper that tracks cycle path."""
        color[node_id] = GRAY
        stack.append(node_id)

        # Get dependencies for this node
        node = dag.nodes.get(node_id)
        if node:
            for dep_id in node.get("dependencies", []):
                if dep_id not in dag.nodes:
                    continue
                if color.get(dep_id, WHITE) == GRAY:
                    # Found cycle - extract only the cycle portion
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
