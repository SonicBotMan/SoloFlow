"""Standalone test runner for SoloFlow hermes-plugin.

This avoids pytest's automatic __init__.py import which pulls in
external dependencies (hermes_agent) that aren't available in CI.
"""

import sys
from pathlib import Path

# Add plugin root to path
plugin_root = Path(__file__).parent
sys.path.insert(0, str(plugin_root))

def run_tests():
    """Run all test suites and report results."""
    passed = 0
    failed = 0
    errors = []

    # ─── DAG Tests ──────────────────────────────────────────────────
    print("\n=== DAG Tests ===")
    try:
        from core.dag import build_dag, detect_cycle, compute_layers, get_ready_steps, topological_sort
        from models import DAG, Edge, Layer, StepState

        # Test 1: Linear chain
        steps = [{"id": "A", "name": "Step A"}, {"id": "B", "name": "Step B"}, {"id": "C", "name": "Step C"}]
        edges = [("A", "B"), ("B", "C")]
        dag = build_dag(steps, edges)
        assert len(dag.layers) == 3
        assert dag.layers[0].step_ids == ["A"]
        print("  ✓ test_linear_chain")
        passed += 1

        # Test 2: Parallel steps
        steps = [{"id": "A", "name": "A"}, {"id": "B", "name": "B"}, {"id": "C", "name": "C"}]
        edges = [("A", "B"), ("A", "C")]
        dag = build_dag(steps, edges)
        assert len(dag.layers) == 2
        assert sorted(dag.layers[1].step_ids) == ["B", "C"]
        print("  ✓ test_parallel_steps")
        passed += 1

        # Test 3: Diamond pattern
        steps = [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}]
        edges = [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")]
        dag = build_dag(steps, edges)
        assert len(dag.layers) == 3
        print("  ✓ test_diamond_pattern")
        passed += 1

        # Test 4: Empty DAG
        dag = build_dag([], [])
        assert len(dag.nodes) == 0
        print("  ✓ test_empty_dag")
        passed += 1

        # Test 5: Single node
        steps = [{"id": "A", "name": "Solo"}]
        dag = build_dag(steps, [])
        assert len(dag.layers) == 1
        print("  ✓ test_single_node")
        passed += 1

        # Test 6: Cycle detection
        steps = [{"id": "A"}, {"id": "B"}, {"id": "C"}]
        edges = [("A", "B"), ("B", "C"), ("C", "A")]
        try:
            build_dag(steps, edges)
            assert False, "Should have raised ValueError"
        except ValueError:
            print("  ✓ test_cycle_detection")
            passed += 1

        # Test 7: Dict edges format
        steps = [{"id": "A"}, {"id": "B"}]
        edges = [{"from": "A", "to": "B"}]
        dag = build_dag(steps, edges)
        assert len(dag.layers) == 2
        print("  ✓ test_dict_edges_format")
        passed += 1

        # Test 8: Edge objects
        steps = [{"id": "A"}, {"id": "B"}]
        edges = [Edge(from_id="A", to_id="B")]
        dag = build_dag(steps, edges)
        assert len(dag.layers) == 2
        print("  ✓ test_edges_as_edge_objects")
        passed += 1

        # Test 9: Compute layers
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": []},
                "B": {"id": "B", "dependencies": ["A"]},
                "C": {"id": "C", "dependencies": ["A"]},
                "D": {"id": "D", "dependencies": ["B", "C"]},
            },
            edges=[Edge(from_id="A", to_id="B"), Edge(from_id="A", to_id="C"),
                   Edge(from_id="B", to_id="D"), Edge(from_id="C", to_id="D")],
        )
        layers = compute_layers(dag)
        assert len(layers) == 3
        print("  ✓ test_compute_layers")
        passed += 1

        # Test 10: Empty graph
        dag = DAG()
        assert compute_layers(dag) == []
        print("  ✓ test_compute_layers_empty")
        passed += 1

        # Test 11: Topological sort
        dag = DAG(
            nodes={"A": {"id": "A"}, "B": {"id": "B"}, "C": {"id": "C"}},
            edges=[Edge(from_id="A", to_id="B"), Edge(from_id="B", to_id="C")],
            layers=[Layer(index=0, step_ids=["A"]), Layer(index=1, step_ids=["B"]), Layer(index=2, step_ids=["C"])],
        )
        assert topological_sort(dag) == ["A", "B", "C"]
        print("  ✓ test_topological_sort")
        passed += 1

        # Test 12: Detect cycle - no cycle
        dag = DAG(
            nodes={"A": {"id": "A", "dependencies": []}, "B": {"id": "B", "dependencies": ["A"]}},
            edges=[Edge(from_id="A", to_id="B")],
        )
        assert detect_cycle(dag) is None
        print("  ✓ test_detect_cycle_no_cycle")
        passed += 1

        # Test 13: Detect cycle - self loop
        dag = DAG(
            nodes={"A": {"id": "A", "dependencies": ["A"]}},
            edges=[Edge(from_id="A", to_id="A")],
        )
        cycle = detect_cycle(dag)
        assert cycle is not None
        print("  ✓ test_detect_cycle_self_loop")
        passed += 1

        # Test 14: Get ready steps
        dag = DAG(
            nodes={
                "A": {"id": "A", "dependencies": [], "action": "A"},
                "B": {"id": "B", "dependencies": ["A"], "action": "B"},
            },
            edges=[Edge(from_id="A", to_id="B")],
        )
        steps = {"A": {"state": StepState.PENDING.value}, "B": {"state": StepState.PENDING.value}}
        ready = get_ready_steps(dag, steps)
        assert ready == ["A"]
        print("  ✓ test_get_ready_steps")
        passed += 1

        # Test 15: After completion
        steps = {"A": {"state": StepState.COMPLETED.value}, "B": {"state": StepState.PENDING.value}}
        ready = get_ready_steps(dag, steps)
        assert ready == ["B"]
        print("  ✓ test_get_ready_steps_after_completion")
        passed += 1

    except Exception as e:
        failed += 1
        errors.append(f"DAG tests: {e}")
        print(f"  ✗ DAG tests failed: {e}")

    # ─── FSM Tests ──────────────────────────────────────────────────
    print("\n=== FSM Tests ===")
    try:
        from core.fsm import can_transition, transition

        # Workflow transitions
        tests = [
            ("draft", "active", True, True),
            ("active", "running", True, True),
            ("active", "cancelled", True, True),
            ("running", "completed", True, True),
            ("running", "failed", True, True),
            ("draft", "running", True, False),  # Invalid
            ("completed", "active", True, False),  # Terminal
            ("failed", "active", True, False),  # Terminal
            ("cancelled", "active", True, False),  # Terminal
        ]
        for current, target, is_wf, expected in tests:
            result = can_transition(current, target, is_workflow=is_wf)
            assert result == expected, f"{current} -> {target}: expected {expected}, got {result}"
        print("  ✓ test_workflow_transitions")
        passed += 1

        # Step transitions
        step_tests = [
            ("pending", "ready", True),
            ("pending", "skipped", True),
            ("ready", "running", True),
            ("running", "completed", True),
            ("running", "failed", True),
            ("pending", "running", False),  # Invalid
            ("completed", "running", False),  # Terminal
        ]
        for current, target, expected in step_tests:
            result = can_transition(current, target, is_workflow=False)
            assert result == expected, f"{current} -> {target}: expected {expected}, got {result}"
        print("  ✓ test_step_transitions")
        passed += 1

        # transition() function
        assert transition("draft", "active") == "active"
        assert transition("active", "running") == "running"
        print("  ✓ test_transition_function")
        passed += 1

        # Invalid transition raises
        try:
            transition("draft", "running")
            assert False
        except ValueError:
            print("  ✓ test_invalid_transition_raises")
            passed += 1

    except Exception as e:
        failed += 1
        errors.append(f"FSM tests: {e}")
        print(f"  ✗ FSM tests failed: {e}")

    # ─── Model Tests ────────────────────────────────────────────────
    print("\n=== Model Tests ===")
    try:
        from models import (
            DAG, Edge, Layer, Step, StepState, Workflow, WorkflowConfig, WorkflowState, Discipline
        )

        # Edge
        e = Edge(from_id="A", to_id="B")
        assert e.from_id == "A" and e.to_id == "B"
        print("  ✓ test_edge_creation")
        passed += 1

        # Layer
        l = Layer(index=0, step_ids=["A", "B"])
        assert l.index == 0 and l.step_ids == ["A", "B"]
        print("  ✓ test_layer_creation")
        passed += 1

        # DAG defaults
        dag = DAG()
        assert dag.nodes == {} and dag.edges == [] and dag.layers == []
        print("  ✓ test_dag_defaults")
        passed += 1

        # WorkflowState enum
        assert WorkflowState.DRAFT.value == "draft"
        assert WorkflowState.ACTIVE.value == "active"
        assert WorkflowState.RUNNING.value == "running"
        assert WorkflowState.COMPLETED.value == "completed"
        assert WorkflowState.FAILED.value == "failed"
        assert WorkflowState.CANCELLED.value == "cancelled"
        print("  ✓ test_workflow_states")
        passed += 1

        # StepState enum
        assert StepState.PENDING.value == "pending"
        assert StepState.READY.value == "ready"
        assert StepState.RUNNING.value == "running"
        assert StepState.COMPLETED.value == "completed"
        assert StepState.FAILED.value == "failed"
        assert StepState.SKIPPED.value == "skipped"
        print("  ✓ test_step_states")
        passed += 1

        # Step defaults
        step = Step(
            id="test", workflow_id="wf-1", name="Test",
            description="A test", discipline=Discipline.QUICK, prompt="Go"
        )
        assert step.state == StepState.PENDING
        assert step.retry_count == 0
        assert step.max_retries == 3
        print("  ✓ test_step_defaults")
        passed += 1

        # Workflow defaults
        wf = Workflow(id="wf-1", name="Test", description="Test")
        assert wf.state == WorkflowState.DRAFT
        assert wf.steps == {}
        print("  ✓ test_workflow_defaults")
        passed += 1

        # WorkflowConfig defaults
        config = WorkflowConfig()
        assert config.max_parallelism == 4
        assert config.default_timeout == 300
        assert config.retry_delay == 5
        assert config.max_retries == 2
        print("  ✓ test_workflow_config_defaults")
        passed += 1

    except Exception as e:
        failed += 1
        errors.append(f"Model tests: {e}")
        print(f"  ✗ Model tests failed: {e}")

    # ─── Summary ────────────────────────────────────────────────────
    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    if errors:
        print("\nErrors:")
        for err in errors:
            print(f"  - {err}")
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
