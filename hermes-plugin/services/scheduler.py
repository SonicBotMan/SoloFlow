"""Async workflow scheduler with DAG-based parallel execution."""

import asyncio
import logging
from typing import Optional

from core import build_dag, get_ready_steps

logger = logging.getLogger("soloflow")


class Scheduler:
    """Async scheduler that manages parallel step execution within a workflow."""

    def __init__(self, store, workflow_service, config: dict = None):
        self._store = store
        self._workflow_service = workflow_service
        self._running_tasks: dict[str, asyncio.Task] = {}
        self._config = config or {}
        self._base_backoff = self._config.get("retry_delay", 5)
        self._max_retries = self._config.get("max_retries", 2)

    async def run_workflow(self, workflow_id: str) -> None:
        """Run a workflow to completion, scheduling steps as they become ready."""
        workflow = await self._workflow_service.start_workflow(workflow_id)
        if workflow["state"] != "running":
            return

        dag = build_dag(workflow.get("steps", []), workflow.get("edges", []))
        steps_map = {s["id"]: s for s in workflow.get("steps", [])}

        while True:
            ready_ids = get_ready_steps(dag, steps_map)
            if not ready_ids:
                break

            # Launch all ready steps in parallel
            tasks = []
            for step_id in ready_ids:
                task = asyncio.create_task(self._run_step(workflow_id, step_id))
                tasks.append(task)
                self._running_tasks[f"{workflow_id}:{step_id}"] = task

            await asyncio.gather(*tasks, return_exceptions=True)

            # Refresh state
            workflow = self._store.get_workflow(workflow_id, full=True)
            steps_map = {s["id"]: s for s in workflow.get("steps", [])}

            if workflow["state"] in ("completed", "failed", "cancelled"):
                break

    async def _run_step(self, workflow_id: str, step_id: str) -> None:
        """Execute a single step with retries and timeout."""
        step = None
        for s in self._store.get_steps(workflow_id):
            if s["id"] == step_id:
                step = s
                break
        if not step:
            return

        max_retries = step.get("max_retries", self._max_retries)
        timeout = step.get("timeout_seconds", self._config.get("default_timeout", 300))

        for attempt in range(max_retries + 1):
            self._store.update_step(workflow_id, step_id, state="running")

            try:
                result = await asyncio.wait_for(
                    self._execute_step(step),
                    timeout=timeout,
                )
                await self._workflow_service.advance_step(workflow_id, step_id, result=result)
                return

            except asyncio.TimeoutError:
                logger.warning(f"Step {step_id} timed out after {timeout}s")
                if attempt < max_retries:
                    backoff = self._base_backoff * (2 ** attempt)
                    await asyncio.sleep(backoff)
                else:
                    await self._workflow_service.advance_step(
                        workflow_id, step_id, error=f"Timed out after {max_retries + 1} attempts"
                    )

            except Exception as e:
                logger.error(f"Step {step_id} failed: {e}")
                if attempt < max_retries:
                    backoff = self._base_backoff * (2 ** attempt)
                    await asyncio.sleep(backoff)
                else:
                    await self._workflow_service.advance_step(
                        workflow_id, step_id, error=f"Failed: {e}"
                    )

    async def _execute_step(self, step: dict) -> str:
        """Execute a step. Override in production to call LLM/tools."""
        await asyncio.sleep(0.1)
        return f"[EXECUTED] {step.get('prompt', step.get('name', 'unnamed step'))}"

    async def cancel_step(self, workflow_id: str, step_id: str) -> bool:
        """Cancel a specific running step."""
        task_key = f"{workflow_id}:{step_id}"
        task = self._running_tasks.get(task_key)
        if task:
            task.cancel()
            logger.info(f"Cancelled step {step_id} in workflow {workflow_id}")
            return True
        return False

    async def cancel_all(self, workflow_id: str) -> int:
        """Cancel all running steps for a workflow."""
        prefix = f"{workflow_id}:"
        tasks_to_cancel = [
            (key, task) for key, task in self._running_tasks.items() if key.startswith(prefix)
        ]
        for key, task in tasks_to_cancel:
            task.cancel()
            self._running_tasks.pop(key, None)
        logger.info(f"Cancelled {len(tasks_to_cancel)} tasks for workflow {workflow_id}")
        return len(tasks_to_cancel)
