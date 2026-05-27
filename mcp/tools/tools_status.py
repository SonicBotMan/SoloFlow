"""MCP Tool: soloflow_status."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService


async def handle_status(
    store_path: Path,
    workflow_id: str,
    **kwargs: Any,
) -> dict[str, Any]:
    """Get workflow status."""
    store = SQLiteStore(store_path)
    store.initialize()
    ws = WorkflowService(store)
    
    status = await ws.get_status(workflow_id)
    
    if not status:
        return {
            "success": False,
            "error": f"Workflow not found: {workflow_id}",
        }
    
    return {
        "success": True,
        "workflow_id": status["id"],
        "name": status["name"],
        "state": status["state"],
        "progress": status["progress"],
        "steps": [
            {
                "id": s["id"],
                "name": s["name"],
                "state": s["state"],
                "discipline": s.get("discipline", "general"),
            }
            for s in status.get("steps", [])
        ],
        "created_at": status.get("created_at"),
        "updated_at": status.get("updated_at"),
    }
