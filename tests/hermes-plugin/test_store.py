"""Tests for SQLite store."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore

@pytest.fixture
def store(tmp_path):
    db_path = tmp_path / "test.db"
    store = SQLiteStore(db_path)
    store.initialize()
    return store

def test_initialize(store):
    """Test database initialization."""
    assert store._conn is not None

def test_save_and_get_workflow(store):
    """Test saving and retrieving a workflow."""
    workflow = {
        "id": "wf_1",
        "name": "Test",
        "description": "Test workflow",
        "state": "draft",
        "steps": [],
        "edges": [],
        "config": {},
        "created_at": 1000.0,
        "updated_at": 1000.0,
    }
    store.save_workflow(workflow)
    result = store.get_workflow("wf_1")
    assert result is not None
    assert result["name"] == "Test"

def test_update_workflow_state(store):
    """Test updating workflow state."""
    workflow = {
        "id": "wf_1",
        "name": "Test",
        "description": "Test",
        "state": "draft",
        "steps": [],
        "edges": [],
        "config": {},
        "created_at": 1000.0,
        "updated_at": 1000.0,
    }
    store.save_workflow(workflow)
    store.update_workflow_state("wf_1", "running")
    result = store.get_workflow("wf_1")
    assert result["state"] == "running"

def test_save_and_get_steps(store):
    """Test saving and retrieving steps."""
    workflow = {
        "id": "wf_1",
        "name": "Test",
        "description": "Test",
        "state": "draft",
        "steps": [],
        "edges": [],
        "config": {},
        "created_at": 1000.0,
        "updated_at": 1000.0,
    }
    store.save_workflow(workflow)
    
    step = {
        "id": "step_1",
        "workflow_id": "wf_1",
        "name": "Step 1",
        "description": "Test step",
        "discipline": "quick",
        "prompt": "Do something",
        "state": "pending",
    }
    store.save_step(step)
    
    steps = store.get_steps("wf_1")
    assert len(steps) == 1
    assert steps[0]["name"] == "Step 1"

def test_update_step(store):
    """Test updating a step."""
    workflow = {
        "id": "wf_1",
        "name": "Test",
        "description": "Test",
        "state": "draft",
        "steps": [],
        "edges": [],
        "config": {},
        "created_at": 1000.0,
        "updated_at": 1000.0,
    }
    store.save_workflow(workflow)
    
    step = {
        "id": "step_1",
        "workflow_id": "wf_1",
        "name": "Step 1",
        "description": "Test step",
        "discipline": "quick",
        "prompt": "Do something",
        "state": "pending",
    }
    store.save_step(step)
    
    store.update_step("wf_1", "step_1", state="running")
    steps = store.get_steps("wf_1")
    assert steps[0]["state"] == "running"
