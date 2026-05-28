"""Sub-agent dispatch system for SoloFlow.

Implements DeerFlow-style lead agent + sub-agents architecture:
- Lead agent plans and dispatches
- Sub-agents execute in parallel with scoped context
- Results are collected and merged
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable, Optional

logger = logging.getLogger("soloflow.dispatch")


class AgentStatus(str, Enum):
    """Status of a sub-agent."""
    
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"


@dataclass
class SubAgent:
    """A sub-agent with scoped context."""
    
    agent_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task: str = ""
    context: dict = field(default_factory=dict)  # Scoped context only
    status: AgentStatus = AgentStatus.PENDING
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    token_usage: dict = field(default_factory=dict)
    
    @property
    def duration_ms(self) -> float:
        if self.completed_at:
            return (self.completed_at - self.created_at) * 1000
        return 0.0
    
    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "task": self.task,
            "status": self.status.value,
            "result": self.result,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "token_usage": self.token_usage,
        }


@dataclass
class DispatchPlan:
    """Plan for dispatching sub-agents."""
    
    plan_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task: str = ""
    subtasks: list[dict] = field(default_factory=list)
    strategy: str = "parallel"  # parallel | sequential | fan-out
    created_at: float = field(default_factory=time.time)
    
    def to_dict(self) -> dict:
        return {
            "plan_id": self.plan_id,
            "task": self.task,
            "subtasks": self.subtasks,
            "strategy": self.strategy,
        }


class SubAgentDispatcher:
    """Dispatches sub-agents with scoped context.
    
    Key patterns from DeerFlow:
    1. Each sub-agent gets isolated context (no cross-contamination)
    2. Results are structured for easy merging
    3. Token usage is tracked per sub-agent
    4. File system can replace context for large state
    """
    
    def __init__(self) -> None:
        self._agents: dict[str, SubAgent] = {}
        self._executors: dict[str, Callable[..., Awaitable[Any]]] = {}
    
    def register_executor(
        self,
        name: str,
        executor: Callable[..., Awaitable[Any]],
    ) -> None:
        """Register an executor for sub-agents."""
        self._executors[name] = executor
    
    def create_plan(
        self,
        task: str,
        subtasks: list[dict],
        strategy: str = "parallel",
    ) -> DispatchPlan:
        """Create a dispatch plan.
        
        Args:
            task: Main task description
            subtasks: List of subtask definitions
            strategy: Execution strategy (parallel/sequential/fan-out)
        """
        return DispatchPlan(
            task=task,
            subtasks=subtasks,
            strategy=strategy,
        )
    
    async def dispatch(
        self,
        plan: DispatchPlan,
        executor_name: str = "default",
    ) -> list[SubAgent]:
        """Dispatch sub-agents according to plan.
        
        Key design from DeerFlow:
        - Each sub-agent gets scoped context only
        - Parallel execution where possible
        - Results collected for merging
        """
        executor = self._executors.get(executor_name)
        if not executor:
            raise ValueError(f"Executor '{executor_name}' not registered")
        
        agents = []
        
        for subtask in plan.subtasks:
            agent = SubAgent(
                task=subtask.get("task", ""),
                context=subtask.get("context", {}),  # Scoped context only
            )
            self._agents[agent.agent_id] = agent
            agents.append(agent)
        
        if plan.strategy == "parallel":
            # Run all sub-agents in parallel
            tasks = [
                self._run_agent(agent, executor)
                for agent in agents
            ]
            await asyncio.gather(*tasks, return_exceptions=True)
        else:
            # Sequential execution
            for agent in agents:
                await self._run_agent(agent, executor)
        
        return agents
    
    async def _run_agent(
        self,
        agent: SubAgent,
        executor: Callable[..., Awaitable[Any]],
    ) -> None:
        """Run a single sub-agent."""
        agent.status = AgentStatus.RUNNING
        
        try:
            result = await executor(agent.task, agent.context)
            agent.result = result
            agent.status = AgentStatus.COMPLETED
            agent.completed_at = time.time()
            
            # Track token usage if provided
            if isinstance(result, dict) and "token_usage" in result:
                agent.token_usage = result["token_usage"]
            
        except asyncio.TimeoutError:
            agent.status = AgentStatus.TIMEOUT
            agent.error = "Execution timed out"
        except Exception as e:
            agent.status = AgentStatus.FAILED
            agent.error = str(e)
    
    def get_agent(self, agent_id: str) -> Optional[SubAgent]:
        """Get a sub-agent by ID."""
        return self._agents.get(agent_id)
    
    def get_results(self, plan: DispatchPlan) -> list[dict]:
        """Get results from all sub-agents in a plan."""
        results = []
        for subtask in plan.subtasks:
            # Find matching agent
            for agent in self._agents.values():
                if agent.task == subtask.get("task"):
                    results.append(agent.to_dict())
                    break
        return results
    
    def merge_results(self, results: list[dict]) -> dict:
        """Merge sub-agent results.
        
        Key pattern from DeerFlow:
        - Summarize completed subtasks
        - Preserve key findings
        - Track total token usage
        """
        merged = {
            "total_agents": len(results),
            "completed": sum(1 for r in results if r["status"] == "completed"),
            "failed": sum(1 for r in results if r["status"] == "failed"),
            "total_tokens": sum(
                r.get("token_usage", {}).get("total", 0)
                for r in results
            ),
            "findings": [],
        }
        
        for r in results:
            if r["status"] == "completed" and r.get("result"):
                merged["findings"].append({
                    "task": r["task"],
                    "result": r["result"],
                })
        
        return merged
    
    def get_total_token_usage(self) -> dict:
        """Get total token usage across all sub-agents."""
        total = {"prompt": 0, "completion": 0, "total": 0}
        
        for agent in self._agents.values():
            if agent.token_usage:
                total["prompt"] += agent.token_usage.get("prompt", 0)
                total["completion"] += agent.token_usage.get("completion", 0)
                total["total"] += agent.token_usage.get("total", 0)
        
        return total
