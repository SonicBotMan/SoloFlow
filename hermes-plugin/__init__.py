"""SoloFlow — Workflow Orchestration Plugin for Hermes Agent.

A cognitive workflow engine with DAG-based parallel execution,
three-tier memory system, and automatic pattern extraction.

Activation: set ``memory.provider: soloflow`` in config.yaml,
or place this directory under $HERMES_HOME/plugins/soloflow/
"""

from __future__ import annotations

import json
import logging
import sys
import threading
from pathlib import Path
from typing import Any, Optional

# Ensure sibling modules are importable
_PLUGIN_DIR = Path(__file__).resolve().parent
if str(_PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(_PLUGIN_DIR))

from agent.memory_provider import MemoryProvider  # noqa: E402
from config import get_data_dir, get_db_path, get_config  # noqa: E402
from store.sqlite_store import SQLiteStore  # noqa: E402
from services.workflow_service import WorkflowService  # noqa: E402
from services.scheduler import Scheduler  # noqa: E402
from memory import MemorySystem  # noqa: E402
from models import WorkflowState, StepState  # noqa: E402

logger = logging.getLogger("soloflow")


# ─── Tool Schema Definitions ───────────────────────────────────────────────

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "soloflow_create",
            "description": (
                "Create a new workflow with steps and dependencies (DAG edges). "
                "Steps are executed according to their dependency order. "
                "Returns the created workflow with all metadata."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Workflow name",
                    },
                    "description": {
                        "type": "string",
                        "description": "What this workflow accomplishes",
                    },
                    "steps": {
                        "type": "array",
                        "description": "List of workflow steps",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string", "description": "Unique step ID"},
                                "name": {"type": "string", "description": "Step name"},
                                "description": {"type": "string", "description": "Step description"},
                                "discipline": {
                                    "type": "string",
                                    "enum": ["quick", "deep", "visual", "ultrabrain"],
                                    "description": "Execution discipline",
                                },
                                "prompt": {"type": "string", "description": "What this step should do"},
                                "max_retries": {"type": "integer", "description": "Max retry count (default 2)"},
                                "timeout_seconds": {"type": "integer", "description": "Timeout in seconds (default 300)"},
                            },
                            "required": ["id", "name", "prompt"],
                        },
                    },
                    "edges": {
                        "type": "array",
                        "description": "Dependency edges: [from_step_id, to_step_id]",
                        "items": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 2,
                            "maxItems": 2,
                        },
                    },
                },
                "required": ["name", "steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "soloflow_start",
            "description": "Start executing a workflow. Root steps (no dependencies) become ready.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {
                        "type": "string",
                        "description": "UUID of the workflow to start",
                    },
                },
                "required": ["workflow_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "soloflow_advance_step",
            "description": (
                "Report the result of a step execution. "
                "Provide result on success or error on failure. "
                "Automatically computes next ready steps and checks workflow completion."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string", "description": "Workflow UUID"},
                    "step_id": {"type": "string", "description": "Step ID to advance"},
                    "result": {"type": "string", "description": "Step result text (on success)"},
                    "error": {"type": "string", "description": "Error message (on failure)"},
                },
                "required": ["workflow_id", "step_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "soloflow_status",
            "description": "Get detailed workflow status including all steps and progress.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string", "description": "Workflow UUID"},
                },
                "required": ["workflow_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "soloflow_list",
            "description": "List workflows with optional state filter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default 50)",
                    },
                    "state_filter": {
                        "type": "string",
                        "enum": ["draft", "active", "running", "completed", "failed", "cancelled"],
                        "description": "Filter by workflow state",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "soloflow_ready_steps",
            "description": "Get steps that are ready to execute in a running workflow.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string", "description": "Workflow UUID"},
                },
                "required": ["workflow_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "soloflow_cancel",
            "description": "Cancel a running or active workflow.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string", "description": "Workflow UUID"},
                },
                "required": ["workflow_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "soloflow_memory",
            "description": (
                "Query the cognitive memory system. Searches across episodic "
                "(execution history) and semantic (evolved patterns) memory."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default 10)",
                    },
                },
                "required": ["query"],
            },
        },
    },
]


# ─── SoloFlow Provider ─────────────────────────────────────────────────────

class SoloFlowProvider(MemoryProvider):
    """SoloFlow workflow orchestration memory provider for Hermes.

    Exposes workflow tools via get_tool_schemas() and handle_tool_call(),
    plus provides memory recall via prefetch().
    """

    name = "soloflow"

    def __init__(self) -> None:
        self._store: Optional[SQLiteStore] = None
        self._workflow_service: Optional[WorkflowService] = None
        self._scheduler: Optional[Scheduler] = None
        self._memory: Optional[MemorySystem] = None
        self._initialized = False
        self._lock = threading.Lock()

    # ── MemoryProvider interface ──

    def is_available(self) -> bool:
        """Check if SoloFlow can be initialized."""
        try:
            data_dir = get_data_dir()
            return True
        except Exception:
            return False

    async def initialize(self, session_id: str, **kwargs: Any) -> None:
        """Initialize the plugin: store, services, memory system."""
        if self._initialized:
            return

        with self._lock:
            if self._initialized:
                return

            # Initialize store
            data_dir = get_data_dir()
            db_path = get_db_path()
            self._store = SQLiteStore(db_path)
            self._store.initialize()
            logger.info(f"SoloFlow store initialized at {db_path}")

            # Initialize services
            self._workflow_service = WorkflowService(self._store)
            self._scheduler = Scheduler(
                self._store,
                self._workflow_service,
                config=get_config(),
            )
            self._workflow_service.set_scheduler(self._scheduler)

            # Initialize memory system
            self._memory = MemorySystem(self._store)

            self._initialized = True
            logger.info("SoloFlow plugin initialized successfully")

    def get_tool_schemas(self) -> list[dict]:
        """Return OpenAI function-calling tool schemas."""
        return TOOL_SCHEMAS

    async def handle_tool_call(
        self,
        tool_name: str,
        args: dict,
        **kwargs: Any,
    ) -> str:
        """Dispatch tool calls to appropriate handlers."""
        self._ensure_initialized()

        try:
            handler = {
                "soloflow_create": self._handle_create,
                "soloflow_start": self._handle_start,
                "soloflow_advance_step": self._handle_advance,
                "soloflow_status": self._handle_status,
                "soloflow_list": self._handle_list,
                "soloflow_ready_steps": self._handle_ready_steps,
                "soloflow_cancel": self._handle_cancel,
                "soloflow_memory": self._handle_memory,
            }.get(tool_name)

            if handler is None:
                return json.dumps({"error": f"Unknown tool: {tool_name}"})

            result = await handler(args)
            if isinstance(result, str):
                return result
            return json.dumps(result, ensure_ascii=False, indent=2)

        except Exception as e:
            logger.error(f"Tool call error: {tool_name}: {e}", exc_info=True)
            return json.dumps({"error": str(e)})

    def system_prompt_block(self) -> str:
        """Return system prompt text for the agent."""
        return (
            "## SoloFlow Workflow Engine\n\n"
            "You have access to a DAG-based workflow orchestration system. Key tools:\n"
            "- **soloflow_create**: Define a workflow with steps and dependency edges\n"
            "- **soloflow_start**: Begin execution (root steps become ready)\n"
            "- **soloflow_advance_step**: Report step results after execution\n"
            "- **soloflow_status / soloflow_list**: Monitor workflows\n"
            "- **soloflow_memory**: Search past workflow patterns\n\n"
            "Workflow pattern: Create → Start → Execute ready steps → Advance → Repeat.\n"
            "Steps with no dependencies run first (layer 0), then dependent steps.\n"
        )

    async def prefetch(self, query: str, session_id: str) -> str:
        """Search memory for relevant context before the agent responds."""
        if not self._memory:
            return ""

        try:
            results = await self._memory.recall(query, limit=5)
            if not results:
                return ""

            lines = ["<soloflow_memory>"]
            for r in results:
                lines.append(f"- {r.get('summary', r.get('event_type', 'entry'))}")
                if r.get("data"):
                    lines.append(f"  > {json.dumps(r['data'], ensure_ascii=False)[:200]}")
            lines.append("</soloflow_memory>")
            return "\n".join(lines)

        except Exception as e:
            logger.debug(f"Prefetch error: {e}")
            return ""

    async def sync_turn(
        self,
        user_content: str,
        assistant_content: str,
        session_id: str,
    ) -> None:
        """Record conversation turn in episodic memory."""
        if not self._memory:
            return
        try:
            await self._memory.record_turn(session_id, user_content, assistant_content)
        except Exception as e:
            logger.debug(f"Sync turn error: {e}")

    async def shutdown(self) -> None:
        """Clean shutdown."""
        if self._store:
            self._store.close()
        self._initialized = False
        logger.info("SoloFlow plugin shut down")

    # ── Tool Handlers ───────────────────────────────────────────────────

    async def _handle_create(self, args: dict) -> dict:
        name = args["name"]
        description = args.get("description", "")
        steps = args["steps"]
        edges = [tuple(e) for e in args.get("edges", [])]
        config = args.get("config")

        workflow = await self._workflow_service.create_workflow(
            name=name,
            description=description,
            steps=steps,
            edges=edges,
            config=config,
        )
        return {
            "id": workflow["id"],
            "name": workflow["name"],
            "state": workflow["state"],
            "step_count": len(workflow.get("steps", [])),
            "edge_count": len(workflow.get("edges", [])),
            "message": f"Workflow '{name}' created with {len(steps)} steps",
        }

    async def _handle_start(self, args: dict) -> dict:
        workflow = await self._workflow_service.start_workflow(args["workflow_id"])
        ready = [s for s in workflow.get("steps", []) if s["state"] == "ready"]
        return {
            "id": workflow["id"],
            "state": workflow["state"],
            "ready_steps": [{"id": s["id"], "name": s["name"], "prompt": s["prompt"]} for s in ready],
            "message": f"Workflow started, {len(ready)} steps ready",
        }

    async def _handle_advance(self, args: dict) -> dict:
        status = await self._workflow_service.advance_step(
            workflow_id=args["workflow_id"],
            step_id=args["step_id"],
            result=args.get("result"),
            error=args.get("error"),
        )
        return status

    async def _handle_status(self, args: dict) -> dict:
        status = await self._workflow_service.get_status(args["workflow_id"])
        if status is None:
            return {"error": "Workflow not found"}
        return status

    async def _handle_list(self, args: dict) -> dict:
        workflows = await self._workflow_service.list_workflows(
            limit=args.get("limit", 50),
            state_filter=args.get("state_filter"),
        )
        return {"workflows": workflows, "count": len(workflows)}

    async def _handle_ready_steps(self, args: dict) -> dict:
        status = await self._workflow_service.get_status(args["workflow_id"])
        if status is None:
            return {"error": "Workflow not found"}
        ready = [
            s for s in status.get("steps", [])
            if s["state"] in ("ready", "running")
        ]
        return {
            "workflow_id": args["workflow_id"],
            "ready_steps": ready,
            "count": len(ready),
        }

    async def _handle_cancel(self, args: dict) -> dict:
        workflow = await self._workflow_service.cancel_workflow(args["workflow_id"])
        return {
            "id": workflow["id"],
            "state": workflow["state"],
            "message": "Workflow cancelled",
        }

    async def _handle_memory(self, args: dict) -> dict:
        if not self._memory:
            return {"error": "Memory system not initialized"}
        results = await self._memory.recall(
            query=args["query"],
            limit=args.get("limit", 10),
        )
        return {"results": results, "count": len(results)}

    # ── Helpers ──

    def _ensure_initialized(self) -> None:
        if not self._initialized:
            raise RuntimeError("SoloFlow provider not initialized. Call initialize() first.")


# ─── Plugin Registration ───────────────────────────────────────────────────

def register(ctx) -> None:
    """Register SoloFlow as a Hermes memory provider."""
    ctx.register_memory_provider(SoloFlowProvider())
