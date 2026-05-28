"""Tests for models."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from models import WorkflowState, StepState, DAG, Edge, Layer

def test_workflow_state_enum():
    assert WorkflowState.DRAFT.value == "draft"
    assert WorkflowState.ACTIVE.value == "active"
    assert WorkflowState.RUNNING.value == "running"
    assert WorkflowState.COMPLETED.value == "completed"
    assert WorkflowState.FAILED.value == "failed"
    assert WorkflowState.CANCELLED.value == "cancelled"

def test_step_state_enum():
    assert StepState.PENDING.value == "pending"
    assert StepState.READY.value == "ready"
    assert StepState.RUNNING.value == "running"
    assert StepState.COMPLETED.value == "completed"
    assert StepState.FAILED.value == "failed"
    assert StepState.SKIPPED.value == "skipped"

def test_edge():
    edge = Edge(from_id="a", to_id="b")
    assert edge.from_id == "a"
    assert edge.to_id == "b"

def test_layer():
    layer = Layer(index=0, step_ids=["a", "b"])
    assert layer.index == 0
    assert layer.step_ids == ["a", "b"]

def test_dag():
    nodes = {
        "a": {"id": "a", "dependencies": []},
        "b": {"id": "b", "dependencies": ["a"]},
    }
    edges = [Edge(from_id="a", to_id="b")]
    layers = [Layer(index=0, step_ids=["a"]), Layer(index=1, step_ids=["b"])]
    
    dag = DAG(nodes=nodes, edges=edges, layers=layers)
    assert len(dag.nodes) == 2
    assert len(dag.edges) == 1
    assert len(dag.layers) == 2
