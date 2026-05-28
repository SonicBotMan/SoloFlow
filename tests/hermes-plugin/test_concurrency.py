"""Concurrency tests for SoloFlow."""

import sys
import asyncio
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService
from services.scheduler import Scheduler


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


class TestConcurrency:
    """Concurrency tests."""
    
    @pytest.mark.asyncio
    async def test_concurrent_workflow_creation(self, service):
        """Test creating multiple workflows concurrently."""
        steps = [{"id": "a", "name": "A", "discipline": "quick", "prompt": "Do A"}]
        
        tasks = []
        for i in range(10):
            tasks.append(service.create_workflow(f"wf_{i}", f"Workflow {i}", steps, []))
        
        results = await asyncio.gather(*tasks)
        assert len(results) == 10
        assert all(r["state"] == "draft" for r in results)
    
    @pytest.mark.asyncio
    async def test_concurrent_step_execution(self, service):
        """Test executing steps concurrently."""
        steps = [
            {"id": "a", "name": "A", "discipline": "quick", "prompt": "Do A"},
            {"id": "b", "name": "B", "discipline": "quick", "prompt": "Do B"},
            {"id": "c", "name": "C", "discipline": "quick", "prompt": "Do C"},
        ]
        edges = [("a", "b"), ("a", "c")]
        
        wf = await service.create_workflow("test", "Test", steps, edges)
        await service.start_workflow(wf["id"])
        
        # Execute parallel steps concurrently
        tasks = [
            service.advance_step(wf["id"], "b", result="B done"),
            service.advance_step(wf["id"], "c", result="C done"),
        ]
        
        results = await asyncio.gather(*tasks)
        assert len(results) == 2
