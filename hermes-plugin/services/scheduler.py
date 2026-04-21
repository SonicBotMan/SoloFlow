"""DAG parallel execution engine with proper task cancellation."""

import asyncio
import logging
import time
from typing import Callable, Optional

from core.fsm import transition
from models import StepState, WorkflowState

logger = logging.getLogger("soloflow.scheduler")


class Scheduler:
    """Scheduler for parallel DAG-based workflow execution.

    Executes steps in topological order while respecting max_parallelism.
    Properly handles task cancellation and retry with exponential backoff.
    """

    def __init__(
        self,
        store,
        workflow_service,
        config: dict = None,
    ):
        """Initialize the scheduler.

        Args:
            store: SQLiteStore instance for persistence
            workflow_service: WorkflowService instance
            config: Optional config dict with keys:
                - max_parallelism: max concurrent steps (default 4)
                - default_timeout: default step timeout in seconds (default 300)
                - base_backoff: base backoff seconds for retries (default 1)
        """
        self._store = store
        self._ws = workflow_service
        self._config = config or {}
        self._max_parallelism = self._config.get("max_parallelism", 4)
        self._default_timeout = self._config.get("default_timeout", 300)
        self._base_backoff = self._config.get("base_backoff", 1)
        self._running_tasks: dict[str, asyncio.Task] = {}

    async def execute_workflow(
        self,
        workflow_id: str,
        executor: Callable = None,
    ) -> dict:
        """Execute all steps in a workflow using DAG layers.

        Args:
            workflow_id: UUID of workflow to execute
            executor: Optional async callable(step_dict) -> str result text.
                If None, returns step prompt for LLM processing.

        Returns:
            Final workflow status dict
        """
        if executor is None:
            executor = self._default_executor

        workflow = self._store.get_workflow(workflow_id, full=True)
        if not workflow:
            logger.error(f"Workflow {workflow_id} not found")
            return {"error": "Workflow not found"}

        # Check if workflow is in terminal state
        terminal_states = {
            WorkflowState.COMPLETED.value,
            WorkflowState.FAILED.value,
            WorkflowState.CANCELLED.value,
        }
        if workflow["state"] in terminal_states:
            logger.info(
                f"Workflow {workflow_id} is in terminal state {workflow['state']}, "
                "skipping execution"
            )
            return workflow

        logger.info(f"Starting execution of workflow {workflow_id}")

        while True:
            # Refresh workflow state
            workflow = self._store.get_workflow(workflow_id, full=True)
            if not workflow:
                break

            # Check for terminal state
            if workflow["state"] in terminal_states:
                break

            # Get ready steps: steps whose all deps are completed
            completed_ids = {s["id"] for s in workflow["steps"] if s["state"] == StepState.COMPLETED.value}
            edges = workflow.get("edges", [])
            ready = []
            for s in workflow["steps"]:
                if s["state"] not in {StepState.PENDING.value, StepState.READY.value}:
                    continue
                deps = [e["from"] for e in edges if e["to"] == s["id"]]
                if all(d in completed_ids for d in deps):
                    ready.append(s["id"])
            if not ready:
                # No ready steps - either waiting or done
                states = {s["state"] for s in workflow["steps"]}
                if any(
                    s in {StepState.RUNNING.value, StepState.READY.value}
                    for s in states
                ):
                    # Some steps still running/ready, wait and retry
                    await asyncio.sleep(0.1)
                    continue
                else:
                    # No steps running and none ready - check if all done
                    break

            # Filter to pending ready steps only
            ready_steps = [
                s
                for s in workflow["steps"]
                if s["id"] in ready
                and s["state"] in {StepState.READY.value, StepState.PENDING.value}
            ]

            if not ready_steps:
                await asyncio.sleep(0.1)
                continue

            # Execute up to max_parallelism steps
            batch = ready_steps[: self._max_parallelism]

            # Launch tasks for this batch
            tasks = []
            for step in batch:
                # Transition step to running
                step["state"] = StepState.RUNNING.value
                self._store.save_workflow(workflow)

                task = asyncio.create_task(
                    self._execute_step(workflow_id, step, executor)
                )
                tasks.append((step["id"], task))
                self._running_tasks[f"{workflow_id}:{step['id']}"] = task

            # Wait for all tasks in batch to complete
            for step_id, task in tasks:
                try:
                    await task
                except asyncio.CancelledError:
                    logger.warning(f"Task for step {step_id} was cancelled")
                finally:
                    self._running_tasks.pop(f"{workflow_id}:{step_id}", None)

            # Small delay before checking for next batch
            await asyncio.sleep(0.05)

        logger.info(f"Workflow execution loop ended for {workflow_id}")
        return await self._ws.get_status(workflow_id)

    async def _execute_step(
        self,
        workflow_id: str,
        step: dict,
        executor: Callable,
        timeout: int = None,
    ) -> None:
        """Execute a single step with timeout and retry.

        Args:
            workflow_id: UUID of workflow containing the step
            step: Step dict with execution details
            executor: Async callable to execute the step
            timeout: Optional timeout in seconds (defaults to step.timeout_seconds)
        """
        timeout = timeout or step.get("timeout_seconds", self._default_timeout)
        max_retries = step.get("max_retries", 3)
        retry_count = step.get("retry_count", 0)

        step_id = step["id"]
        logger.debug(f"Executing step {step_id} (attempt {retry_count + 1}/{max_retries})")

        for attempt in range(max_retries):
            task = None
            try:
                # Create task for this execution attempt
                task = asyncio.create_task(executor(step))

                # Wait for completion with timeout
                result = await asyncio.wait_for(task, timeout=timeout)

                # Success - advance step with result
                await self._ws.advance_step(workflow_id, step_id, result=result)
                logger.debug(f"Step {step_id} completed successfully")
                return

            except asyncio.TimeoutError:
                logger.warning(
                    f"Step {step_id} timed out after {timeout}s "
                    f"(attempt {attempt + 1}/{max_retries})"
                )
                if task:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

                # Exponential backoff before retry
                if attempt < max_retries - 1:
                    backoff = self._base_backoff * (2**attempt)
                    logger.debug(f"Retrying step {step_id} after {backoff}s backoff")
                    await asyncio.sleep(backoff)

            except asyncio.CancelledError:
                logger.info(f"Step {step_id} execution cancelled")
                # Still advance step to mark it appropriately
                await self._ws.advance_step(
                    workflow_id, step_id, error="Execution cancelled"
                )
                raise

            except Exception as e:
                logger.error(
                    f"Step {step_id} failed with error: {e} "
                    f"(attempt {attempt + 1}/{max_retries})"
                )
                if task:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

                # Exponential backoff before retry
                if attempt < max_retries - 1:
                    backoff = self._base_backoff * (2**attempt)
                    logger.debug(f"Retrying step {step_id} after {backoff}s backoff")
                    await asyncio.sleep(backoff)

        # All retries exhausted - mark as failed
        logger.error(f"Step {step_id} failed after {max_retries} attempts")
        await self._ws.advance_step(
            workflow_id, step_id, error=f"Failed after {max_retries} attempts"
        )

    async def _default_executor(self, step: dict) -> str:
        """Default executor that returns step prompt.

        This is a placeholder that returns the step's prompt text.
        In production, this would call an LLM or other executor.

        Args:
            step: Step dict

        Returns:
            Step prompt text (would be LLM response in production)
        """
        # Simulate some processing time
        await asyncio.sleep(0.1)
        return f"[EXECUTED] {step.get('prompt', step.get('name', 'unnamed step'))}"

    async def cancel_step(self, workflow_id: str, step_id: str) -> bool:
        """Cancel a specific running step.

        Args:
            workflow_id: UUID of workflow
            step_id: ID of step to cancel

        Returns:
            True if task was found and cancelled, False otherwise
        """
        task_key = f"{workflow_id}:{step_id}"
        task = self._running_tasks.get(task_key)
        if task:
            task.cancel()
            logger.info(f"Cancelled step {step_id} in workflow {workflow_id}")
            return True
        return False

    async def cancel_all(self, workflow_id: str) -> int:
        """Cancel all running steps for a workflow.

        Args:
            workflow_id: UUID of workflow

        Returns:
            Number of tasks cancelled
        """
        prefix = f"{workflow_id}:"
        tasks_to_cancel = [
            (key, task)
            for key, task in self._running_tasks.items()
            if key.startswith(prefix)
        ]

        for key, task in tasks_to_cancel:
            task.cancel()
            self._running_tasks.pop(key, None)

        if tasks_to_cancel:
            logger.info(
                f"Cancelled {len(tasks_to_cancel)} tasks for workflow {workflow_id}"
            )

        return len(tasks_to_cancel)
