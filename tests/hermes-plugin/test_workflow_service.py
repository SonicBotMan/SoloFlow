"""Tests for WorkflowService."""

import sys
import asyncio
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService
from services.scheduler import Scheduler
from models import WorkflowState, StepState

@pytest.fixture
def store(tmp_path):
    db_path = tmp_path / "test.db"
    store = SQLiteStore(db_path)
    store.initialize()
    return store

@pytest.fixture
def service(store):
    ws = WorkflowService(store)
    ws.set_scheduler(Scheduler(store, ws))
    return ws

@pytest.mark.asyncio
async def test_create_workflow(service):
    steps = [
        {"id": "a", "name": "A", "discipline": "quick", "prompt": "Do A"},
        {"id": "b", "name": "B", "discipline": "quick", "prompt": "Do B"},
    ]
    edges = [("a", "b")]
    
    wf = await service.create_workflow("test", "Test workflow", steps, edges)
    assert wf["name"] == "test"
    assert wf["state"] == WorkflowState.DRAFT.value
    assert len(wf["steps"]) == 2

@pytest.mark.asyncio
async def test_start_workflow(service):
    steps = [
        {"id": "a", "name": "A", "discipline": "quick", "prompt": "Do A"},
    ]
    
    wf = await service.create_workflow("test", "Test", steps, [])
    started = await service.start_workflow(wf["id"])
    assert started["state"] == WorkflowState.RUNNING.value

@pytest.mark.asyncio
async def test_advance_step(service):
    steps = [
        {"id": "a", "name": "A", "discipline": "quick", "prompt": "Do A"},
        {"id": "b", "name": "B", "discipline": "quick", "prompt": "Do B"},
    ]
    edges = [("a", "b")]
    
    wf = await service.create_workflow("test", "Test", steps, edges)
    await service.start_workflow(wf["id"])
    
    result = await service.advance_step(wf["id"], "a", result="A done")
    assert result is not None

@pytest.mark.asyncio
async def test_cancel_workflow(service):
    steps = [
        {"id": "a", "name": "A", "discipline": "quick", "prompt": "Do A"},
    ]
    
    wf = await service.create_workflow("test", "Test", steps, [])
    await service.start_workflow(wf["id"])
    cancelled = await service.cancel_workflow(wf["id"])
    assert cancelled["state"] == WorkflowState.CANCELLED.value

@pytest.mark.asyncio
async def test_list_workflows(service):
    steps = [{"id": "a", "name": "A", "discipline": "quick", "prompt": "Do A"}]
    
    await service.create_workflow("wf1", "Test 1", steps, [])
    await service.create_workflow("wf2", "Test 2", steps, [])
    
    workflows = await service.list_workflows()
    assert len(workflows) == 2
