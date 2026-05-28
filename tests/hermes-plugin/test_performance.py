"""Performance tests for SoloFlow core modules."""

import sys
import time
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from core.dag import build_dag, compute_layers


class TestPerformance:
    """Performance tests."""
    
    def test_dag_build_performance(self):
        """Test DAG build performance with 1000 steps."""
        steps = [{"id": f"step_{i}", "name": f"Step {i}"} for i in range(1000)]
        edges = [(f"step_{i}", f"step_{i+1}") for i in range(999)]
        
        start = time.time()
        dag = build_dag(steps, edges)
        elapsed = time.time() - start
        
        assert len(dag.nodes) == 1000
        assert elapsed < 1.0  # Should complete in under 1 second
    
    def test_layer_computation_performance(self):
        """Test layer computation performance."""
        steps = [{"id": f"step_{i}", "name": f"Step {i}"} for i in range(100)]
        edges = [("step_0", f"step_{i}") for i in range(1, 100)]
        dag = build_dag(steps, edges)
        
        start = time.time()
        layers = compute_layers(dag)
        elapsed = time.time() - start
        
        assert len(layers) == 2
        assert elapsed < 0.1  # Should complete in under 100ms
