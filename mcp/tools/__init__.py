"""MCP Tools for SoloFlow.

Registers all MCP tools for workflow operations.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from mcp.registry import MCPToolRegistry
from mcp.tools.tools_create import handle_create
from mcp.tools.tools_run import handle_run
from mcp.tools.tools_status import handle_status
from mcp.tools.tools_list import handle_list
from mcp.tools.tools_cancel import handle_cancel


def register_all_tools(registry: MCPToolRegistry, store_path: Path) -> None:
    """Register all SoloFlow MCP tools."""
    
    # soloflow_create
    registry.register(
        name="soloflow_create",
        description="Create a new SoloFlow workflow with steps and DAG edges",
        input_schema={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Workflow name"},
                "description": {"type": "string", "description": "Workflow description"},
                "steps": {
                    "type": "array",
                    "description": "List of workflow steps",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "name": {"type": "string"},
                            "discipline": {"type": "string", "enum": ["quick", "deep", "visual", "ultrabrain"]},
                            "prompt": {"type": "string"},
                            "max_retries": {"type": "integer", "default": 3},
                            "timeout_seconds": {"type": "integer", "default": 300},
                        },
                        "required": ["id", "name", "prompt"],
                    },
                },
                "edges": {
                    "type": "array",
                    "description": "DAG edges (from_id, to_id)",
                    "items": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 2,
                        "maxItems": 2,
                    },
                },
            },
            "required": ["name", "description", "steps", "edges"],
        },
        handler=lambda **kwargs: handle_create(store_path, **kwargs),
    )
    
    # soloflow_run
    registry.register(
        name="soloflow_run",
        description="Execute a SoloFlow workflow with DAG parallelism",
        input_schema={
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string", "description": "Workflow ID to execute"},
                "executor": {
                    "type": "string",
                    "enum": ["default", "llm", "custom"],
                    "default": "default",
                    "description": "Executor type",
                },
            },
            "required": ["workflow_id"],
        },
        handler=lambda **kwargs: handle_run(store_path, **kwargs),
    )
    
    # soloflow_status
    registry.register(
        name="soloflow_status",
        description="Get the status and progress of a workflow",
        input_schema={
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string", "description": "Workflow ID"},
            },
            "required": ["workflow_id"],
        },
        handler=lambda **kwargs: handle_status(store_path, **kwargs),
    )
    
    # soloflow_list
    registry.register(
        name="soloflow_list",
        description="List workflows with optional state filter",
        input_schema={
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 50, "description": "Max results"},
                "state": {
                    "type": "string",
                    "enum": ["draft", "active", "running", "completed", "failed", "cancelled"],
                    "description": "Filter by state",
                },
            },
        },
        handler=lambda **kwargs: handle_list(store_path, **kwargs),
    )
    
    # soloflow_cancel
    registry.register(
        name="soloflow_cancel",
        description="Cancel a running workflow",
        input_schema={
            "type": "object",
            "properties": {
                "workflow_id": {"type": "string", "description": "Workflow ID to cancel"},
            },
            "required": ["workflow_id"],
        },
        handler=lambda **kwargs: handle_cancel(store_path, **kwargs),
    )
