"""
SoloFlow — Workflow Orchestration Plugin for Hermes
Shared type definitions based on TypeScript types.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional


class WorkflowState(str, Enum):
    """Valid states for a workflow."""
    DRAFT = "draft"
    ACTIVE = "active"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepState(str, Enum):
    """Valid states for a workflow step."""
    PENDING = "pending"
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class Discipline(str, Enum):
    """Agent discipline types for step execution."""
    QUICK = "quick"
    DEEP = "deep"
    VISUAL = "visual"
    ULTRABRAIN = "ultrabrain"


@dataclass
class Edge:
    """Represents a directed edge in the DAG."""
    from_id: str
    to_id: str


@dataclass
class Layer:
    """Represents a layer in the DAG containing steps that can run in parallel."""
    index: int
    step_ids: list[str]


@dataclass
class DAG:
    """Directed Acyclic Graph for workflow step execution."""
    nodes: dict[str, Any] = field(default_factory=dict)  # Map[str, Step]
    edges: list[Edge] = field(default_factory=list)
    layers: list[Layer] = field(default_factory=list)


@dataclass
class WorkflowConfig:
    """Configuration for workflow execution."""
    max_parallelism: int = 4
    default_timeout: int = 300  # seconds
    retry_delay: int = 5  # seconds
    max_retries: int = 2


@dataclass
class Step:
    """Represents a single step in a workflow."""
    id: str
    workflow_id: str
    name: str
    description: str
    discipline: Discipline
    prompt: str
    state: StepState = StepState.PENDING
    result: Optional[str] = None
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    timeout_seconds: int = 300
    created_at: int = 0
    updated_at: int = 0


@dataclass
class Workflow:
    """Represents a complete workflow with steps and DAG structure."""
    id: str
    name: str
    description: str
    state: WorkflowState = WorkflowState.DRAFT
    steps: dict[str, Step] = field(default_factory=dict)  # Map[str, Step]
    dag: DAG = field(default_factory=DAG)
    config: WorkflowConfig = field(default_factory=WorkflowConfig)
    created_at: int = 0
    updated_at: int = 0


@dataclass
class SchedulerOptions:
    """Options for the workflow scheduler."""
    max_parallelism: Optional[int] = None
    timeout_seconds: Optional[int] = None
    retry_delay: Optional[int] = None
    max_retries: Optional[int] = None
    on_step_start: Optional[Callable[["Step"], None]] = None
    on_step_complete: Optional[Callable[["Step"], None]] = None
    on_step_fail: Optional[Callable[["Step", str], None]] = None
    on_workflow_complete: Optional[Callable[["Workflow"], None]] = None
