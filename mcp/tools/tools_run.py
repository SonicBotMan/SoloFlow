"""MCP Tool: soloflow_run."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService
from services.scheduler import Scheduler


async def handle_run(
    store_path: Path,
    workflow_id: str,
    executor: str = "default",
    **kwargs: Any,
) -> dict[str, Any]:
    """Execute a workflow."""
    store = SQLiteStore(store_path)
    store.initialize()
    ws = WorkflowService(store)
    scheduler = Scheduler(store, ws)
    ws.set_scheduler(scheduler)
    
    workflow = await ws.start_workflow(workflow_id)
    
    if workflow["state"] != "running":
        return {
            "success": False,
            "error": f"Cannot start workflow in state: {workflow['state']}",
        }
    
    try:
        await scheduler.run_workflow(workflow_id)
        status = await ws.get_status(workflow_id)
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "state": status["state"],
            "progress": status["progress"],
        }
    except Exception as e:
        return {
            "success": False,
            "workflow_id": workflow_id,
            "error": str(e),
        }
