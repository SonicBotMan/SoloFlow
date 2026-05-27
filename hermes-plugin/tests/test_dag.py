"""Tests for SoloFlow DAG engine (core/dag.py)."""

import pytest

from core.dag import (
    build_dag,
    compute_layers,
    detect_cycle,
    get_ready_steps,
    topological_sort,
)
from models import DAG, Edge, Layer, StepState


class TestBuildDag:
    """Tests for build_dag()."""

    def test_linear_chain(self):
        """A -> B -> C should produce 3 layers."""
        steps = [
            {"id": "A", "name": "Step A", "discipline": "quick"},
            {"id": "B", "name": "Step B", "discipline": "quick"},
            {"id": "C", "name": "Step C", "discipline": "quick"},
        ]
        edges = [("A", "B"), ("B", "C")]
        dag = build_dag(steps, edges)

        assert len(dag.layers) == 3
        assert dag.layers[0].step_ids == ["A"]
        assert dag.layers[1].step_ids == ["B"]
        assert dag.layers[2].step_ids == ["C"]

    def test_parallel_steps(self):
        """A -> B, A -> C (B and C parallel) should produce 2 layers."""
        steps = [
            {"id": "A", "name": "Step A"},
            {"id": "B", "name": "Step B"},
            {"id": "C", "name": "Step C"},
        ]
        edges = [("A", "B"), ("A", "C")]
        dag = build_dag(steps, edges)

        assert len(dag.layers) == 2
        assert dag.layers[0].step_ids == ["A"]
        assert sorted(dag.layers[1].step_ids) == ["B", "C"]

    def test_diamond_pattern(self):
        """A -> B, A -> C, B -> D, C -> D should produce 3 layers."""
        steps = [
            {"id": "A", "name": "Step A"},
            {"id": "B", "name": "Step B"},
            {"id": "C", "name": "Step C"},
            {"id": "D", "name": "Step D"},
        ]
        edges = [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")]
        dag = build_dag(steps, edges)

        assert len(dag.layers) == 3
        assert dag.layers[0].step_ids == ["A"]
        assert sorted(dag.layers[1].step_ids) == ["B", "C"]
        assert dag.layers[2].step_ids == ["D"]

    def test_empty_dag(self):
        """Empty steps/edges should produce empty DAG."""
        dag = build_dag([], [])
        assert len(dag.nodes) == 0
        assert len(dag.layers) == 0

    def test_single_node(self):
        """Single node with no edges."""
        steps = [{"id": "A", "name": "Solo"}]
        dag = build_dag(steps, [])

        assert len(dag.layers) == 1
        assert dag.layers[0].step_ids == ["A"]

    def test_cycle_detection(self):
        """A -> B -> C -> A should raise ValueError."""
        steps = [
            {"id": "A", "name": "Step A"},
            {"id": "B", "name": "Step B"},
            {"id": "C", "name": "Step C"},
        ]
        edges = [("A", "B"), ("B", "C"), ("C", "A")]

        with pytest.raises(ValueError, match="Circular dependency"):
            build_dag(steps, edges)

    def test_dict_edges_format(self):
        """Edges as dicts with 'from'/'to' keys."""
        steps = [
            {"id": "A", "name": "Step A"},
            {"id": "B", "name": "Step B"},
        ]
        edges = [{"from": "A", "to": "B"}]
        dag = build_dag(steps, edges)

        assert len(dag.layers) == 2

    def test_edges_as_edge_objects(self):
        """Edges as Edge dataclass instances."""
        steps = [
            {"id": "A", "name": "Step A"},
            {"id": "B", "name": "Step B"},
        ]
        edges = [Edge(from_id="A", to_id="B")]
        dag = build_dag(steps, edges)

        assert len(dag.layers) == 2


class TestComputeLayers:
    """Tests for compute_layers()."""

    def test_kahn_ordering(self):
        """Verify Kahn's algorithm produces correct layer ordering."""
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": [], "action": "A"},
                "B": {"id": "B", "dependencies": ["A"], "action": "B"},
                "C": {"id": "C", "dependencies": ["A"], "action": "C"},
                "D": {"id": "D", "dependencies": ["B", "C"], "action": "D"},
            },
            edges=[
                Edge(from_id="A", to_id="B"),
                Edge(from_id="A", to_id="C"),
                Edge(from_id="B", to_id="D"),
                Edge(from_id="C", to_id="D"),
            ],
        )
        layers = compute_layers(dag)

        assert len(layers) == 3
        assert layers[0].step_ids == ["A"]
        assert sorted(layers[1].step_ids) == ["B", "C"]
        assert layers[2].step_ids == ["D"]

    def test_empty_graph(self):
        """Empty DAG should return empty layers."""
        dag = DAG()
        assert compute_layers(dag) == []


class TestTopologicalSort:
    """Tests for topological_sort()."""

    def test_linear_order(self):
        """Topo sort of linear chain should be [A, B, C]."""
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": []},
                "B": {"id": "B", "dependencies": ["A"]},
                "C": {"id": "C", "dependencies": ["B"]},
            },
            edges=[
                Edge(from_id="A", to_id="B"),
                Edge(from_id="B", to_id="C"),
            ],
            layers=[
                Layer(index=0, step_ids=["A"]),
                Layer(index=1, step_ids=["B"]),
                Layer(index=2, step_ids=["C"]),
            ],
        )
        result = topological_sort(dag)
        assert result == ["A", "B", "C"]


class TestDetectCycle:
    """Tests for detect_cycle()."""

    def test_no_cycle(self):
        """Acyclic graph should return None."""
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": []},
                "B": {"id": "B", "dependencies": ["A"]},
            },
            edges=[Edge(from_id="A", to_id="B")],
        )
        assert detect_cycle(dag) is None

    def test_self_loop(self):
        """Self-loop should be detected."""
        dag = DAG(
            nodes={"A": {"id": "A", "dependencies": ["A"]}},
            edges=[Edge(from_id="A", to_id="A")],
        )
        cycle = detect_cycle(dag)
        assert cycle is not None
        assert "A" in cycle

    def test_three_node_cycle(self):
        """A -> B -> C -> A cycle."""
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": ["C"]},
                "B": {"id": "B", "dependencies": ["A"]},
                "C": {"id": "C", "dependencies": ["B"]},
            },
            edges=[
                Edge(from_id="C", to_id="A"),
                Edge(from_id="A", to_id="B"),
                Edge(from_id="B", to_id="C"),
            ],
        )
        cycle = detect_cycle(dag)
        assert cycle is not None
        assert len(cycle) >= 3

    def test_empty_graph(self):
        """Empty graph has no cycle."""
        dag = DAG()
        assert detect_cycle(dag) is None


class TestGetReadySteps:
    """Tests for get_ready_steps()."""

    def test_initial_ready_steps(self):
        """Steps with no dependencies should be ready initially."""
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": [], "action": "A"},
                "B": {"id": "B", "dependencies": ["A"], "action": "B"},
            },
            edges=[Edge(from_id="A", to_id="B")],
        )
        steps = {
            "A": {"state": StepState.PENDING.value},
            "B": {"state": StepState.PENDING.value},
        }
        ready = get_ready_steps(dag, steps)
        assert ready == ["A"]

    def test_after_completion(self):
        """After A completes, B should become ready."""
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": [], "action": "A"},
                "B": {"id": "B", "dependencies": ["A"], "action": "B"},
            },
            edges=[Edge(from_id="A", to_id="B")],
        )
        steps = {
            "A": {"state": StepState.COMPLETED.value},
            "B": {"state": StepState.PENDING.value},
        }
        ready = get_ready_steps(dag, steps)
        assert ready == ["B"]

    def test_multiple_ready(self):
        """Multiple steps with satisfied deps should all be ready."""
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": [], "action": "A"},
                "B": {"id": "B", "dependencies": ["A"], "action": "B"},
                "C": {"id": "C", "dependencies": ["A"], "action": "C"},
            },
            edges=[Edge(from_id="A", to_id="B"), Edge(from_id="A", to_id="C")],
        )
        steps = {
            "A": {"state": StepState.COMPLETED.value},
            "B": {"state": StepState.PENDING.value},
            "C": {"state": StepState.PENDING.value},
        }
        ready = get_ready_steps(dag, steps)
        assert sorted(ready) == ["B", "C"]

    def test_running_steps_excluded(self):
        """Running steps should not be returned as ready."""
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": [], "action": "A"},
                "B": {"id": "B", "dependencies": [], "action": "B"},
            },
            edges=[],
        )
        steps = {
            "A": {"state": StepState.RUNNING.value},
            "B": {"state": StepState.PENDING.value},
        }
        ready = get_ready_steps(dag, steps)
        assert ready == ["B"]
