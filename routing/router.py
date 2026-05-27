"""Discipline router for SoloFlow.

Routes tasks to appropriate executors based on classification.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable, Optional

from .classifier import (
    TaskClassifier,
    Discipline,
    DisciplineConfig,
    ClassificationResult,
    DISCIPLINE_CONFIGS,
)

logger = logging.getLogger("soloflow.routing")


@dataclass
class Executor:
    """An executor for a specific discipline."""
    
    name: str
    discipline: Discipline
    handler: Callable[..., Awaitable[Any]]
    config: DisciplineConfig = field(default_factory=lambda: DISCIPLINE_CONFIGS[Discipline.DEEP])
    
    async def execute(self, task: str, **kwargs: Any) -> Any:
        """Execute a task."""
        return await self.handler(task, **kwargs)


@dataclass
class RoutingResult:
    """Result of routing a task."""
    
    classification: ClassificationResult
    executor: Executor
    task: str
    
    async def execute(self, **kwargs: Any) -> Any:
        """Execute the task with the selected executor."""
        return await self.executor.execute(self.task, **kwargs)


class DisciplineRouter:
    """Routes tasks to appropriate executors based on discipline.
    
    Usage:
        router = DisciplineRouter()
        
        # Register executors
        router.register_executor(Executor(
            name="quick-agent",
            discipline=Discipline.QUICK,
            handler=quick_handler,
        ))
        
        # Route and execute
        result = await router.route_and_execute("Summarize this article")
    """
    
    def __init__(
        self,
        classifier: TaskClassifier | None = None,
        default_discipline: Discipline = Discipline.DEEP,
    ) -> None:
        """Initialize the router.
        
        Args:
            classifier: Task classifier (default: TaskClassifier)
            default_discipline: Default discipline for unclassified tasks
        """
        self._classifier = classifier or TaskClassifier()
        self._default_discipline = default_discipline
        self._executors: dict[Discipline, list[Executor]] = {
            d: [] for d in Discipline
        }
    
    def register_executor(self, executor: Executor) -> None:
        """Register an executor for a discipline.
        
        Args:
            executor: Executor to register
        """
        self._executors[executor.discipline].append(executor)
        logger.info(f"Registered executor '{executor.name}' for {executor.discipline.value}")
    
    def get_executor(self, discipline: Discipline) -> Optional[Executor]:
        """Get an executor for a discipline.
        
        Args:
            discipline: Discipline to get executor for
            
        Returns:
            Executor, or None if not registered
        """
        executors = self._executors.get(discipline, [])
        if not executors:
            return None
        # Return first available executor
        return executors[0]
    
    def classify(self, task: str) -> ClassificationResult:
        """Classify a task.
        
        Args:
            task: Task description
            
        Returns:
            Classification result
        """
        return self._classifier.classify(task)
    
    def route(self, task: str) -> RoutingResult:
        """Route a task to an executor.
        
        Args:
            task: Task description
            
        Returns:
            Routing result with executor
            
        Raises:
            ValueError: If no executor found for discipline
        """
        classification = self.classify(task)
        executor = self.get_executor(classification.discipline)
        
        if executor is None:
            # Fall back to default discipline
            logger.warning(
                f"No executor for {classification.discipline.value}, "
                f"falling back to {self._default_discipline.value}"
            )
            executor = self.get_executor(self._default_discipline)
        
        if executor is None:
            raise ValueError(
                f"No executor registered for {classification.discipline.value} "
                f"or {self._default_discipline.value}"
            )
        
        return RoutingResult(
            classification=classification,
            executor=executor,
            task=task,
        )
    
    async def route_and_execute(self, task: str, **kwargs: Any) -> Any:
        """Route and execute a task.
        
        Args:
            task: Task description
            **kwargs: Additional arguments to pass to executor
            
        Returns:
            Execution result
        """
        result = self.route(task)
        
        logger.info(
            f"Routing task to {result.executor.name} "
            f"({result.classification.discipline.value}, "
            f"confidence={result.classification.confidence:.2f})"
        )
        
        return await result.execute(**kwargs)
    
    def list_executors(self) -> dict[str, list[str]]:
        """List all registered executors.
        
        Returns:
            Dictionary of discipline -> executor names
        """
        return {
            discipline.value: [e.name for e in executors]
            for discipline, executors in self._executors.items()
            if executors
        }
