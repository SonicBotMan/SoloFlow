"""MCP Tool: soloflow_list."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService


async def handle_list(
    store_path: Path,
    limit: int = 50,
    state: str | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """List workflows."""
    store = SQLiteStore(store_path)
    store.initialize()
    ws = WorkflowService(store)
    
    state_filter = state if state else ""
    workflows = await ws.list_workflows(limit=limit, state_filter=state_filter)
    
    return {
        "success": True,
        "count": len(workflows),
        "workflows": [
            {
                "id": wf["id"],
                "name": wf["name"],
                "state": wf["state"],
                "step_count": len(wf.get("steps", [])),
                "created_at": wf.get("created_at"),
            }
            for wf in workflows
        ],
    }
