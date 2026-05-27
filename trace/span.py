"""Span data structures for SoloFlow trace system."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class SpanStatus(str, Enum):
    """Status of a span."""
    
    SUCCESS = "success"
    ERROR = "error"
    SKIPPED = "skipped"
    TIMEOUT = "timeout"


@dataclass
class TokenUsage:
    """Token usage tracking for LLM calls."""
    
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    
    def add(self, other: TokenUsage) -> TokenUsage:
        """Add another TokenUsage to this one."""
        return TokenUsage(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
            total_tokens=self.total_tokens + other.total_tokens,
            cost_usd=self.cost_usd + other.cost_usd,
        )


@dataclass
class Span:
    """A single execution span in a trace.
    
    Spans represent individual operations (workflow execution, step execution,
    LLM calls, etc.) and can be nested to form a tree.
    """
    
    span_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    parent_id: Optional[str] = None
    trace_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    # Operation info
    operation: str = ""
    node_name: str = ""
    
    # Timing
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    
    # Data
    input_data: dict[str, Any] = field(default_factory=dict)
    output_data: dict[str, Any] = field(default_factory=dict)
    
    # Token usage
    token_usage: TokenUsage = field(default_factory=TokenUsage)
    
    # Status
    status: SpanStatus = SpanStatus.SUCCESS
    error_message: Optional[str] = None
    
    # Metadata
    metadata: dict[str, Any] = field(default_factory=dict)
    
    def finish(
        self,
        status: SpanStatus = SpanStatus.SUCCESS,
        output_data: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        """Finish this span."""
        self.end_time = time.time()
        self.status = status
        if output_data is not None:
            self.output_data = output_data
        if error_message is not None:
            self.error_message = error_message
    
    @property
    def duration_ms(self) -> float:
        """Duration in milliseconds."""
        if self.end_time is None:
            return (time.time() - self.start_time) * 1000
        return (self.end_time - self.start_time) * 1000
    
    @property
    def is_finished(self) -> bool:
        """Whether this span has finished."""
        return self.end_time is not None
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "span_id": self.span_id,
            "parent_id": self.parent_id,
            "trace_id": self.trace_id,
            "operation": self.operation,
            "node_name": self.node_name,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": self.duration_ms,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "token_usage": {
                "prompt_tokens": self.token_usage.prompt_tokens,
                "completion_tokens": self.token_usage.completion_tokens,
                "total_tokens": self.token_usage.total_tokens,
                "cost_usd": self.token_usage.cost_usd,
            },
            "status": self.status.value,
            "error_message": self.error_message,
            "metadata": self.metadata,
        }
