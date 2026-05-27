"""MCP Tool: soloflow_cancel."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService


async def handle_cancel(
    store_path: Path,
    workflow_id: str,
    **kwargs: Any,
) -> dict[str, Any]:
    """Cancel a workflow."""
    store = SQLiteStore(store_path)
    store.initialize()
    ws = WorkflowService(store)
    
    try:
        workflow = await ws.cancel_workflow(workflow_id)
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "state": workflow["state"],
            "message": f"Workflow {workflow_id} cancelled",
        }
    except ValueError as e:
        return {
            "success": False,
            "workflow_id": workflow_id,
            "error": str(e),
        }
