"""Workflow CRUD and state management service."""

import time
import uuid
import logging
from typing import Optional

from core import build_dag, get_ready_steps
from core.fsm import can_transition, transition
from models import StepState, WorkflowState

logger = logging.getLogger("soloflow")


class WorkflowService:
    """Service for managing workflow lifecycle and execution state."""

    def __init__(self, store):
        self._store = store
        self._scheduler = None

    def set_scheduler(self, scheduler) -> None:
        """Set the scheduler for workflow execution."""
        self._scheduler = scheduler

    async def create_workflow(
        self,
        name: str,
        description: str,
        steps: list[dict],
        edges: list[tuple[str, str]],
        config: dict = None,
    ) -> dict:
        """Create a new workflow with steps and DAG edges."""
        workflow_id = str(uuid.uuid4())
        created_at = time.time()

        # Build DAG and compute layers
        dag = build_dag(steps, edges)
        layers = self._compute_layers(dag, steps)

        # Initialize all steps with pending state
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
        """Start workflow execution."""
        workflow = self._store.get_workflow(workflow_id, full=True)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        if not can_transition(workflow["state"], WorkflowState.ACTIVE.value):
            raise ValueError(f"Cannot transition workflow from {workflow['state']} to active")

        workflow["state"] = transition(workflow["state"], WorkflowState.ACTIVE.value)

        if not can_transition(workflow["state"], WorkflowState.RUNNING.value):
            raise ValueError(f"Cannot transition workflow from {workflow['state']} to running")

        workflow["state"] = transition(workflow["state"], WorkflowState.RUNNING.value)
        workflow["started_at"] = time.time()

        self._store.update_workflow_state(workflow_id, WorkflowState.RUNNING.value)

        # Set initial ready steps (root steps with no dependencies)
        steps_map = {s["id"]: s for s in workflow.get("steps", [])}
        ready_ids = get_ready_steps(build_dag(workflow.get("steps", []), workflow.get("edges", [])), steps_map)

        for step_id in ready_ids:
            self._store.update_step(workflow_id, step_id, state=StepState.READY.value)

        return self._store.get_workflow(workflow_id, full=True)

    async def advance_step(
        self,
        workflow_id: str,
        step_id: str,
        result: str = None,
        error: str = None,
    ) -> dict:
        """Advance a step with result or error, compute next steps."""
        workflow = self._store.get_workflow(workflow_id, full=True)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        steps_map = {s["id"]: s for s in workflow.get("steps", [])}
        step = steps_map.get(step_id)
        if not step:
            raise ValueError(f"Step {step_id} not found in workflow")

        # Update step with result or error
        if error:
            new_state = StepState.FAILED.value
            self._store.update_step(workflow_id, step_id, state=new_state, error=error)
        else:
            new_state = StepState.COMPLETED.value
            self._store.update_step(workflow_id, step_id, state=new_state, result=result)

        # Check workflow completion
        dag = build_dag(workflow.get("steps", []), workflow.get("edges", []))
        updated_steps_map = {s["id"]: s for s in self._store.get_steps(workflow_id)}
        ready_ids = get_ready_steps(dag, updated_steps_map)

        for ready_id in ready_ids:
            self._store.update_step(workflow_id, ready_id, state=StepState.READY.value)

        # Check if all steps are done
        all_steps = self._store.get_steps(workflow_id)
        non_terminal = [
            s for s in all_steps
            if s["state"] not in (StepState.COMPLETED.value, StepState.FAILED.value, StepState.SKIPPED.value)
        ]

        if not non_terminal:
            has_failed = any(s["state"] == StepState.FAILED.value for s in all_steps)
            final_state = WorkflowState.FAILED.value if has_failed else WorkflowState.COMPLETED.value
            self._store.update_workflow_state(workflow_id, final_state)

        return await self.get_status(workflow_id)

    async def get_status(self, workflow_id: str) -> dict:
        """Get full workflow status with all steps."""
        workflow = self._store.get_workflow(workflow_id, full=True)
        if not workflow:
            return None

        steps = workflow.get("steps", [])
        total = len(steps)
        completed = sum(1 for s in steps if s["state"] == StepState.COMPLETED.value)
        failed = sum(1 for s in steps if s["state"] == StepState.FAILED.value)
        ready = sum(1 for s in steps if s["state"] == StepState.READY.value)
        running = sum(1 for s in steps if s["state"] == StepState.RUNNING.value)

        return {
            "id": workflow["id"],
            "name": workflow["name"],
            "state": workflow["state"],
            "steps": steps,
            "progress": {"total": total, "completed": completed, "failed": failed, "ready": ready, "running": running},
            "created_at": workflow["created_at"],
            "updated_at": workflow["updated_at"],
        }

    async def list_workflows(self, limit: int = 50, state_filter: str = None) -> list[dict]:
        """List workflows with optional state filter."""
        return self._store.list_workflows(limit=limit, state_filter=state_filter)

    async def cancel_workflow(self, workflow_id: str) -> dict:
        """Cancel a workflow."""
        workflow = self._store.get_workflow(workflow_id, full=True)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        if not can_transition(workflow["state"], WorkflowState.CANCELLED.value):
            raise ValueError(f"Cannot cancel workflow in state {workflow['state']}")

        workflow["state"] = transition(workflow["state"], WorkflowState.CANCELLED.value)
        self._store.update_workflow_state(workflow_id, WorkflowState.CANCELLED.value)

        return self._store.get_workflow(workflow_id, full=True)

    def _compute_layers(self, dag, steps: list[dict]) -> dict[str, int]:
        """Compute layer index for each step."""
        layer_map = {}
        for layer in dag.layers:
            for step_id in layer.step_ids:
                layer_map[step_id] = layer.index
        return layer_map
