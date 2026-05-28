"""Tests for DAG engine."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from core.dag import build_dag, compute_layers, get_ready_steps, detect_cycle
from models import StepState

def test_build_dag():
    steps = [
        {"id": "a", "name": "A"},
        {"id": "b", "name": "B"},
        {"id": "c", "name": "C"},
    ]
    edges = [("a", "b"), ("b", "c")]
    dag = build_dag(steps, edges)
    assert len(dag.nodes) == 3
    assert len(dag.edges) == 2

def test_compute_layers():
    steps = [
        {"id": "a", "name": "A"},
        {"id": "b", "name": "B"},
        {"id": "c", "name": "C"},
    ]
    edges = [("a", "b"), ("a", "c")]
    dag = build_dag(steps, edges)
    layers = compute_layers(dag)
    assert len(layers) == 2
    assert layers[0].step_ids == ["a"]
    assert set(layers[1].step_ids) == {"b", "c"}

def test_detect_cycle():
    steps = [
        {"id": "a", "name": "A"},
        {"id": "b", "name": "B"},
    ]
    edges = [("a", "b"), ("b", "a")]
    with pytest.raises(ValueError, match="Circular dependency"):
        build_dag(steps, edges)

def test_get_ready_steps():
    steps = [
        {"id": "a", "name": "A", "state": StepState.COMPLETED.value},
        {"id": "b", "name": "B", "state": StepState.PENDING.value},
        {"id": "c", "name": "C", "state": StepState.PENDING.value},
    ]
    edges = [("a", "b"), ("a", "c")]
    dag = build_dag(steps, edges)
    steps_map = {s["id"]: s for s in steps}
    ready = get_ready_steps(dag, steps_map)
    assert set(ready) == {"b", "c"}

def test_empty_dag():
    dag = build_dag([], [])
    assert len(dag.nodes) == 0
    assert len(dag.edges) == 0
