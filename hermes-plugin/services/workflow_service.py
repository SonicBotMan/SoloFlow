"""Workflow CRUD and state management service."""

import time
import uuid
import logging
from typing import Optional

from services.scheduler import Scheduler
from store.sqlite_store import SQLiteStore
from core.dag import build_dag, get_ready_steps
from core.fsm import can_transition, transition
from models import StepState, WorkflowState

logger = logging.getLogger("soloflow")


class WorkflowService:
    """Service for managing workflow lifecycle and execution state."""

    def __init__(self, store: SQLiteStore):
        """Initialize the workflow service.

        Args:
            store: SQLiteStore instance for persistence
        """
        self._store = store
        self._scheduler: Optional[Scheduler] = None

    def set_scheduler(self, scheduler: Scheduler) -> None:
        """Set the scheduler for workflow execution.

        Args:
            scheduler: Scheduler instance for DAG execution
        """
        self._scheduler = scheduler

    async def create_workflow(
        self,
        name: str,
        description: str,
        steps: list[dict],
        edges: list[tuple[str, str]],
        config: dict = None,
    ) -> dict:
        """Create a new workflow with steps and DAG edges.

        Args:
            name: Workflow name
            description: Workflow description
            steps: List of step dicts with keys:
                - id: unique step identifier
                - name: step name
                - description: step description
                - discipline: discipline category
                - prompt: step prompt text
                - max_retries: optional, default 3
                - timeout_seconds: optional, default 300
            edges: List of (from_step_id, to_step_id) tuples defining DAG
            config: Optional workflow configuration dict

        Returns:
            Workflow dict with all metadata, steps, and DAG structure
        """
        workflow_id = str(uuid.uuid4())
        created_at = time.time()

        # Build DAG and compute layers
        dag = build_dag(steps, edges)
        layers = self._compute_layers(dag, steps)

        # Initialize all steps with pending state (deduplicate by step id)
        initialized_steps = []
        seen_ids = set()
        for step in steps:
            if step["id"] in seen_ids:
                continue
            seen_ids.add(step["id"])
            initialized_steps.append({
                "id": step["id"],
                "name": step.get("name", step["id"]),
                "description": step.get("description", ""),
                "discipline": step.get("discipline", "general"),
                "prompt": step.get("prompt", ""),
                "max_retries": step.get("max_retries", 3),
                "timeout_seconds": step.get("timeout_seconds", 300),
                "state": StepState.PENDING.value,
                "retry_count": 0,
                "result": None,
                "error": None,
                "layer": layers.get(step["id"], 0),
            })

        workflow = {
            "id": workflow_id,
            "name": name,
            "description": description,
            "config": config or {},
            "state": WorkflowState.DRAFT.value,
            "steps": initialized_steps,
            "edges": [{"from": e[0], "to": e[1]} for e in edges],
            "layers": layers,
            "created_at": created_at,
            "updated_at": created_at,
            "started_at": None,
            "completed_at": None,
        }

        # Persist workflow, steps, edges, layers
        self._store.save_workflow(workflow)
        for step in initialized_steps:
            step["workflow_id"] = workflow_id
            self._store.save_step(step)
        self._store.save_edges(workflow_id, edges)
        layers_data = [
            {"layer_index": layer.index, "step_ids": layer.step_ids}
            for layer in dag.layers
        ]
        self._store.save_layers(workflow_id, layers_data)
        logger.info(f"Created workflow {workflow_id} with {len(steps)} steps")

        return workflow

    async def start_workflow(self, workflow_id: str) -> dict:
        """Start workflow execution.

        Args:
            workflow_id: UUID of workflow to start

        Returns:
            Updated workflow dict

        Raises:
            ValueError: If workflow not found or cannot be started
        """
        workflow = self._store.get_workflow(workflow_id, full=True)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        # Transition through states: draft → active → running
        if not can_transition(workflow["state"], WorkflowState.ACTIVE.value):
            raise ValueError(
                f"Cannot transition workflow from {workflow['state']} to active"
            )

        workflow["state"] = transition(workflow["state"], WorkflowState.ACTIVE.value)

        if not can_transition(workflow["state"], WorkflowState.RUNNING.value):
            raise ValueError(
                f"Cannot transition workflow from {workflow['state']} to running"
            )

        workflow["state"] = transition(workflow["state"], WorkflowState.RUNNING.value)
        workflow["started_at"] = time.time()
        workflow["updated_at"] = time.time()

        # Find root steps (no incoming edges) and set to ready
        step_ids = {s["id"] for s in workflow["steps"]}
        dependent_steps: dict[str, list[str]] = {sid: [] for sid in step_ids}

        for edge in workflow["edges"]:
            if edge["to"] in dependent_steps:
                dependent_steps[edge["to"]].append(edge["from"])

        root_steps = [
            sid for sid, deps in dependent_steps.items() if len(deps) == 0
        ]

        for step in workflow["steps"]:
            if step["id"] in root_steps:
                step["state"] = StepState.READY.value
                self._store.save_step(step)

        self._store.save_workflow(workflow)
        logger.info(f"Started workflow {workflow_id}, ready steps: {root_steps}")

        # Trigger scheduler if available
        if self._scheduler:
            asyncio.create_task(self._scheduler.execute_workflow(workflow_id))

        return workflow

    async def advance_step(
        self,
        workflow_id: str,
        step_id: str,
        result: str = None,
        error: str = None,
    ) -> dict:
        """Advance a step's state after execution.

        Args:
            workflow_id: UUID of workflow containing the step
            step_id: ID of step to advance
            result: Execution result text (if successful)
            error: Error message (if failed)

        Returns:
            Updated workflow status dict

        Raises:
            ValueError: If workflow or step not found
        """
        workflow = self._store.get_workflow(workflow_id, full=True)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        # Guard against advancing steps in terminal workflows
        terminal_states = {
            WorkflowState.COMPLETED.value,
            WorkflowState.FAILED.value,
            WorkflowState.CANCELLED.value,
        }
        if workflow["state"] in terminal_states:
            logger.warning(
                f"Attempted to advance step in terminal workflow {workflow_id} "
                f"(state={workflow['state']})"
            )
            return self.get_status_sync(workflow_id)

        step = next((s for s in workflow["steps"] if s["id"] == step_id), None)
        if not step:
            raise ValueError(f"Step {step_id} not found in workflow {workflow_id}")

        current_state = step["state"]

        # Determine if this is a success or failure
        if error is not None:
            # Explicit failure path
            step["retry_count"] = step.get("retry_count", 0) + 1
            step["error"] = error

            if step["retry_count"] < step["max_retries"]:
                # Schedule retry - set back to ready
                step["state"] = StepState.READY.value
                logger.info(
                    f"Step {step_id} failed (retry {step['retry_count']}/"
                    f"{step['max_retries']}), rescheduling"
                )
                # Trigger scheduler for retry
                if self._scheduler:
                    asyncio.create_task(
                        self._scheduler.execute_workflow(workflow_id)
                    )
            else:
                # Max retries exceeded - mark as failed
                step["state"] = StepState.FAILED.value
                logger.warning(
                    f"Step {step_id} failed after {step['retry_count']} retries"
                )
        elif result is not None:
            # Success path
            step["state"] = StepState.COMPLETED.value
            step["result"] = result
            step["error"] = None
            logger.info(f"Step {step_id} completed successfully")
        else:
            # Both None — treat as success with empty result (no-op advance)
            step["state"] = StepState.COMPLETED.value
            step["result"] = ""
            step["error"] = None
            logger.info(f"Step {step_id} advanced with no result")

        workflow["updated_at"] = time.time()

        # Check if all steps are done
        all_steps = workflow["steps"]
        states = [s["state"] for s in all_steps]

        # Check for any failed steps
        if StepState.FAILED.value in states:
            workflow["state"] = WorkflowState.FAILED.value
            workflow["completed_at"] = time.time()
            logger.info(f"Workflow {workflow_id} failed")
        # Check if all steps are terminal (completed or failed)
        elif all(
            s in {StepState.COMPLETED.value, StepState.FAILED.value}
            for s in states
        ):
            workflow["state"] = WorkflowState.COMPLETED.value
            workflow["completed_at"] = time.time()
            logger.info(f"Workflow {workflow_id} completed")
        else:
            # Compute new ready steps
            ready_steps = self._compute_ready_steps(workflow)
            for s in all_steps:
                if s["id"] in ready_steps and s["state"] == StepState.PENDING.value:
                    s["state"] = StepState.READY.value

        # Persist step changes
        for s in all_steps:
            self._store.save_step(s)
        self._store.save_workflow(workflow)
        status = self.get_status_sync(workflow_id)
        return status

    def get_status_sync(self, workflow_id: str) -> Optional[dict]:
        """Synchronous version of get_status for internal use."""
        workflow = self._store.get_workflow(workflow_id, full=True)
        if not workflow:
            return None

        progress = self._compute_progress(workflow, workflow["steps"])

        return {
            "id": workflow["id"],
            "name": workflow["name"],
            "state": workflow["state"],
            "steps": workflow["steps"],
            "progress": progress,
            "created_at": workflow.get("created_at"),
            "started_at": workflow.get("started_at"),
            "completed_at": workflow.get("completed_at"),
            "updated_at": workflow.get("updated_at"),
        }

    async def get_status(self, workflow_id: str) -> Optional[dict]:
        """Get workflow status with all steps and progress info.

        Args:
            workflow_id: UUID of workflow

        Returns:
            Workflow status dict with progress info, or None if not found
        """
        return self.get_status_sync(workflow_id)

    async def get_workflow_status(self, workflow_id: str) -> Optional[dict]:
        """Alias for get_status for API compatibility."""
        return await self.get_status(workflow_id)

    async def get_ready_steps(self, workflow_id: str) -> list[str]:
        """Get IDs of steps that are ready to execute.

        Args:
            workflow_id: UUID of workflow

        Returns:
            List of step IDs in ready state
        """
        status = self.get_status_sync(workflow_id)
        if not status:
            return []
        return [
            s["id"] for s in status["steps"]
            if s["state"] == StepState.READY.value
        ]

    async def list_workflows(
        self, limit: int = 50, state_filter: str = None
    ) -> list[dict]:
        """List workflows with optional state filtering.

        Args:
            limit: Maximum number of workflows to return
            state_filter: Optional state to filter by

        Returns:
            List of workflow summary dicts
        """
        workflows = self._store.list_workflows(limit=limit, state_filter=state_filter)
        return [
            {
                "id": w["id"],
                "name": w["name"],
                "state": w["state"],
                "created_at": w.get("created_at"),
                "started_at": w.get("started_at"),
                "completed_at": w.get("completed_at"),
            }
            for w in workflows
        ]

    async def cancel_workflow(self, workflow_id: str) -> dict:
        """Cancel a running workflow.

        All running steps are marked as cancelled.

        Args:
            workflow_id: UUID of workflow to cancel

        Returns:
            Updated workflow dict

        Raises:
            ValueError: If workflow not found
        """
        workflow = self._store.get_workflow(workflow_id, full=True)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        terminal_states = {
            WorkflowState.COMPLETED.value,
            WorkflowState.FAILED.value,
            WorkflowState.CANCELLED.value,
        }
        if workflow["state"] in terminal_states:
            logger.warning(
                f"Workflow {workflow_id} is already in terminal state "
                f"{workflow['state']}"
            )
            return workflow

        # Cancel all non-terminal steps
        for step in workflow["steps"]:
            if step["state"] not in {
                StepState.COMPLETED.value,
                StepState.FAILED.value,
                StepState.CANCELLED.value,
            }:
                step["state"] = StepState.CANCELLED.value
                self._store.save_step(step)

        workflow["state"] = WorkflowState.CANCELLED.value
        workflow["updated_at"] = time.time()
        workflow["completed_at"] = time.time()

        self._store.save_workflow(workflow)
        logger.info(f"Cancelled workflow {workflow_id}")

        return workflow

    def _compute_progress(self, workflow: dict, steps: list[dict]) -> dict:
        """Compute progress statistics for a workflow.

        Args:
            workflow: Workflow dict
            steps: List of step dicts

        Returns:
            Dict with total, completed, failed, running, pending counts
            and progress percentage
        """
        total = len(steps)
        completed = sum(1 for s in steps if s["state"] == StepState.COMPLETED.value)
        failed = sum(1 for s in steps if s["state"] == StepState.FAILED.value)
        running = sum(1 for s in steps if s["state"] == StepState.RUNNING.value)
        pending = sum(
            1
            for s in steps
            if s["state"] in {
                StepState.PENDING.value,
                StepState.READY.value,
            }
        )
        cancelled = sum(
            1 for s in steps if s["state"] == StepState.CANCELLED.value
        )

        # Calculate percentage based on completed + failed vs total
        done = completed + failed
        progress_pct = (done / total * 100) if total > 0 else 0

        return {
            "total": total,
            "completed": completed,
            "failed": failed,
            "running": running,
            "pending": pending,
            "cancelled": cancelled,
            "progress_pct": round(progress_pct, 1),
        }

    def _compute_layers(self, dag, steps) -> dict[str, int]:
        """Extract layer assignment from DAG object computed by core/dag.

        Args:
            dag: DAG dataclass with .layers (list of Layer objects)
            steps: List of step dicts (unused, kept for API compat)

        Returns:
            Dict mapping step_id to layer number
        """
        result = {}
        for layer in dag.layers:
            for step_id in layer.step_ids:
                result[step_id] = layer.index
        return result

    def _compute_ready_steps(self, workflow: dict) -> set[str]:
        """Compute which steps are now ready based on completed dependencies.

        Args:
            workflow: Workflow dict with steps and edges

        Returns:
            Set of step IDs that are now ready to execute
        """
        completed_ids = {
            s["id"]
            for s in workflow["steps"]
            if s["state"] == StepState.COMPLETED.value
        }

        ready: set[str] = set()
        for edge in workflow["edges"]:
            from_id, to_id = edge["from"], edge["to"]
            if from_id in completed_ids:
                # Check if all dependencies of to_id are complete
                deps = [
                    e["from"]
                    for e in workflow["edges"]
                    if e["to"] == to_id
                ]
                if all(d in completed_ids for d in deps):
                    # Check if step is still pending
                    step = next(
                        (s for s in workflow["steps"] if s["id"] == to_id), None
                    )
                    if step and step["state"] == StepState.PENDING.value:
                        ready.add(to_id)

        return ready


# Import asyncio at module level for create_task
import asyncio
