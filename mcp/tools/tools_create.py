"""MCP Tool: soloflow_create."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Add hermes-plugin directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService


async def handle_create(
    store_path: Path,
    name: str,
    description: str,
    steps: list[dict[str, Any]],
    edges: list[list[str]],
    **kwargs: Any,
) -> dict[str, Any]:
    """Create a new workflow."""
    store = SQLiteStore(store_path)
    store.initialize()
    ws = WorkflowService(store)
    
    edge_tuples = [(e[0], e[1]) for e in edges]
    
    workflow = await ws.create_workflow(
        name=name,
        description=description,
        steps=steps,
        edges=edge_tuples,
    )
    
    return {
        "success": True,
        "workflow_id": workflow["id"],
        "name": workflow["name"],
        "state": workflow["state"],
        "step_count": len(workflow.get("steps", [])),
        "edge_count": len(edge_tuples),
    }
