"""Handoff mechanism for SoloFlow.

Implements OpenAI Agents SDK-style handoff:
- Handoff = control transfer (special tool with ownership semantics)
- Agent-as-tool = capability call (no ownership transfer)
- Clear ownership boundary
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable, Optional

logger = logging.getLogger("soloflow.handoff")


class HandoffType(str, Enum):
    """Type of handoff."""
    
    CONTROL = "control"  # Full control transfer (handoff)
    CAPABILITY = "capability"  # Capability call (agent-as-tool)


@dataclass
class HandoffConfig:
    """Configuration for a handoff."""
    
    target_agent: str
    handoff_type: HandoffType = HandoffType.CONTROL
    description: str = ""
    
    # For control handoff
    transfer_ownership: bool = True
    transfer_context: bool = True
    
    # For capability call
    return_result: bool = True
    
    def is_control_transfer(self) -> bool:
        """Check if this is a control transfer."""
        return self.handoff_type == HandoffType.CONTROL
    
    def to_dict(self) -> dict:
        return {
            "target_agent": self.target_agent,
            "handoff_type": self.handoff_type.value,
            "description": self.description,
            "transfer_ownership": self.transfer_ownership,
        }


@dataclass
class HandoffResult:
    """Result of a handoff."""
    
    handoff_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    source_agent: str = ""
    target_agent: str = ""
    handoff_type: HandoffType = HandoffType.CONTROL
    success: bool = False
    result: Optional[Any] = None
    error: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            "handoff_id": self.handoff_id,
            "source_agent": self.source_agent,
            "target_agent": self.target_agent,
            "handoff_type": self.handoff_type.value,
            "success": self.success,
            "result": self.result,
            "error": self.error,
        }


class HandoffManager:
    """Manages handoffs between agents.
    
    Key insight from OpenAI Agents SDK:
    - Handoff = control transfer (who owns the reply)
    - Agent-as-tool = capability call (no ownership transfer)
    
    Design principle:
    "Whoever owns the user reply should own the output contract."
    """
    
    def __init__(self) -> None:
        self._agents: dict[str, dict] = {}
        self._handoff_configs: dict[str, HandoffConfig] = {}
        self._results: list[HandoffResult] = []
    
    def register_agent(
        self,
        agent_id: str,
        name: str,
        capabilities: list[str] | None = None,
        can_receive_handoff: bool = True,
    ) -> None:
        """Register an agent."""
        self._agents[agent_id] = {
            "agent_id": agent_id,
            "name": name,
            "capabilities": capabilities or [],
            "can_receive_handoff": can_receive_handoff,
        }
    
    def register_handoff(
        self,
        source_agent: str,
        target_agent: str,
        handoff_type: HandoffType = HandoffType.CONTROL,
        description: str = "",
    ) -> None:
        """Register a handoff configuration."""
        key = f"{source_agent}:{target_agent}"
        self._handoff_configs[key] = HandoffConfig(
            target_agent=target_agent,
            handoff_type=handoff_type,
            description=description,
        )
    
    def get_agent(self, agent_id: str) -> Optional[dict]:
        """Get an agent by ID."""
        return self._agents.get(agent_id)
    
    def list_agents(self) -> list[dict]:
        """List all agents."""
        return list(self._agents.values())
    
    def suggest_handoff_type(
        self,
        task_description: str,
    ) -> tuple[HandoffType, str]:
        """Suggest whether to use handoff or agent-as-tool.
        
        Decision criteria from OpenAI:
        - Different instructions/tools/policy needed? → Handoff
        - Just classification/summarization? → Agent-as-tool
        """
        # Keywords suggesting control transfer (handoff)
        control_keywords = [
            "refund", "legal", "medical", "emergency",
            "escalate", "transfer", "specialist",
            "different policy", "different rules",
        ]
        
        # Keywords suggesting capability call (agent-as-tool)
        capability_keywords = [
            "summarize", "classify", "extract", "validate",
            "search", "analyze", "format", "convert",
        ]
        
        task_lower = task_description.lower()
        
        control_score = sum(1 for kw in control_keywords if kw in task_lower)
        capability_score = sum(1 for kw in capability_keywords if kw in task_lower)
        
        if control_score > capability_score:
            return HandoffType.CONTROL, "Task requires different rules/policy"
        elif capability_score > control_score:
            return HandoffType.CAPABILITY, "Task is bounded capability"
        else:
            return HandoffType.CAPABILITY, "Default to capability for safety"
    
    async def handoff(
        self,
        source_agent: str,
        target_agent: str,
        context: dict,
        handoff_type: HandoffType = HandoffType.CONTROL,
    ) -> HandoffResult:
        """Execute a handoff between agents.
        
        Args:
            source_agent: Agent handing off
            target_agent: Agent receiving handoff
            context: Context to transfer
            handoff_type: Control or capability
        """
        # Validate agents exist
        if source_agent not in self._agents:
            return HandoffResult(
                source_agent=source_agent,
                target_agent=target_agent,
                handoff_type=handoff_type,
                success=False,
                error=f"Source agent '{source_agent}' not found",
            )
        
        if target_agent not in self._agents:
            return HandoffResult(
                source_agent=source_agent,
                target_agent=target_agent,
                handoff_type=handoff_type,
                success=False,
                error=f"Target agent '{target_agent}' not found",
            )
        
        target = self._agents[target_agent]
        if not target.get("can_receive_handoff", True):
            return HandoffResult(
                source_agent=source_agent,
                target_agent=target_agent,
                handoff_type=handoff_type,
                success=False,
                error=f"Target agent '{target_agent}' cannot receive handoffs",
            )
        
        # Execute handoff
        result = HandoffResult(
            source_agent=source_agent,
            target_agent=target_agent,
            handoff_type=handoff_type,
            success=True,
            result={
                "transferred": True,
                "context": context,
                "ownership": "transferred" if handoff_type == HandoffType.CONTROL else "retained",
            },
        )
        
        self._results.append(result)
        logger.info(f"Handoff: {source_agent} -> {target_agent} ({handoff_type.value})")
        
        return result
    
    def get_results(self) -> list[dict]:
        """Get all handoff results."""
        return [r.to_dict() for r in self._results]
    
    def get_stats(self) -> dict:
        """Get handoff statistics."""
        total = len(self._results)
        successful = sum(1 for r in self._results if r.success)
        control = sum(1 for r in self._results if r.handoff_type == HandoffType.CONTROL)
        capability = sum(1 for r in self._results if r.handoff_type == HandoffType.CAPABILITY)
        
        return {
            "total": total,
            "successful": successful,
            "control_handoffs": control,
            "capability_calls": capability,
        }
