"""Edge case tests for SoloFlow core modules."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from core.dag import build_dag
from models import StepState


class TestEdgeCases:
    """Edge case tests."""
    
    def test_single_step_workflow(self):
        """Test workflow with single step."""
        steps = [{"id": "a", "name": "A"}]
        dag = build_dag(steps, [])
        assert len(dag.nodes) == 1
        assert len(dag.layers) == 1
    
    def test_many_parallel_steps(self):
        """Test workflow with many parallel steps."""
        steps = [{"id": f"step_{i}", "name": f"Step {i}"} for i in range(100)]
        edges = [("step_0", f"step_{i}") for i in range(1, 100)]
        dag = build_dag(steps, edges)
        assert len(dag.nodes) == 100
        assert len(dag.layers) == 2
    
    def test_diamond_dag(self):
        """Test diamond-shaped DAG."""
        steps = [
            {"id": "start", "name": "Start"},
            {"id": "left", "name": "Left"},
            {"id": "right", "name": "Right"},
            {"id": "end", "name": "End"},
        ]
        edges = [("start", "left"), ("start", "right"), ("left", "end"), ("right", "end")]
        dag = build_dag(steps, edges)
        assert len(dag.layers) == 3
    
    def test_wide_dag(self):
        """Test DAG with many dependencies."""
        steps = [{"id": f"step_{i}", "name": f"Step {i}"} for i in range(50)]
        edges = [(f"step_{i}", f"step_{i+1}") for i in range(49)]
        dag = build_dag(steps, edges)
        assert len(dag.layers) == 50
