"""Hooks system for SoloFlow.

Implements Claude Agent SDK-style lifecycle hooks:
- PreToolUse: before tool execution
- PostToolUse: after tool execution
- Stop: when agent stops
- SessionStart/End: session lifecycle
- UserPromptSubmit: when user submits input
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable, Optional

logger = logging.getLogger("soloflow.hooks")


class HookPoint(str, Enum):
    """Lifecycle hook points."""
    
    PRE_TOOL_USE = "pre_tool_use"
    POST_TOOL_USE = "post_tool_use"
    STOP = "stop"
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    USER_PROMPT_SUBMIT = "user_prompt_submit"


@dataclass
class HookContext:
    """Context passed to hooks."""
    
    hook_point: HookPoint
    session_id: str = ""
    tool_name: str = ""
    tool_args: dict = field(default_factory=dict)
    tool_result: Any = None
    user_input: str = ""
    metadata: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    
    def to_dict(self) -> dict:
        return {
            "hook_point": self.hook_point.value,
            "session_id": self.session_id,
            "tool_name": self.tool_name,
            "tool_args": self.tool_args,
            "tool_result": self.tool_result,
            "user_input": self.user_input,
            "timestamp": self.timestamp,
        }


@dataclass
class HookResult:
    """Result of a hook execution."""
    
    success: bool = True
    should_continue: bool = True  # False to block execution
    modified_args: Optional[dict] = None  # Modified tool args
    modified_result: Optional[Any] = None  # Modified tool result
    error: Optional[str] = None
    audit_data: Optional[dict] = None  # Data for audit log
    
    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "should_continue": self.should_continue,
            "error": self.error,
            "audit_data": self.audit_data,
        }


class HooksManager:
    """Manages lifecycle hooks for SoloFlow.
    
    Key patterns from Claude Agent SDK:
    - Hooks at lifecycle points for policy enforcement
    - PreToolUse for strategy checks
    - PostToolUse for audit logging
    - Stop for cleanup
    """
    
    def __init__(self) -> None:
        self._hooks: dict[HookPoint, list[Callable]] = {
            point: [] for point in HookPoint
        }
        self._audit_log: list[dict] = []
    
    def register_hook(
        self,
        hook_point: HookPoint,
        handler: Callable[[HookContext], Awaitable[HookResult]],
    ) -> None:
        """Register a hook for a lifecycle point."""
        self._hooks[hook_point].append(handler)
    
    async def execute_hooks(
        self,
        hook_point: HookPoint,
        context: HookContext,
    ) -> HookResult:
        """Execute all hooks for a lifecycle point.
        
        Returns:
            Combined result (should_continue=False if any hook blocks)
        """
        combined = HookResult(success=True, should_continue=True)
        
        for handler in self._hooks[hook_point]:
            try:
                result = await handler(context)
                
                # If any hook says don't continue, stop
                if not result.should_continue:
                    combined.should_continue = False
                    combined.error = result.error
                    break
                
                # Merge audit data
                if result.audit_data:
                    if combined.audit_data is None:
                        combined.audit_data = {}
                    combined.audit_data.update(result.audit_data)
                
                # Apply modifications
                if result.modified_args:
                    combined.modified_args = result.modified_args
                if result.modified_result is not None:
                    combined.modified_result = result.modified_result
                
            except Exception as e:
                logger.error(f"Hook error at {hook_point.value}: {e}")
                combined.success = False
                combined.error = str(e)
                break
        
        # Add to audit log
        self._audit_log.append({
            "hook_point": hook_point.value,
            "context": context.to_dict(),
            "result": combined.to_dict(),
            "timestamp": time.time(),
        })
        
        return combined
    
    def get_audit_log(
        self,
        hook_point: HookPoint | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """Get audit log with optional filter."""
        logs = self._audit_log
        
        if hook_point:
            logs = [l for l in logs if l["hook_point"] == hook_point.value]
        
        return logs[-limit:]
    
    def clear_audit_log(self) -> None:
        """Clear the audit log."""
        self._audit_log.clear()


# Predefined hook handlers

async def log_hook(context: HookContext) -> HookResult:
    """Simple logging hook."""
    logger.info(f"Hook: {context.hook_point.value} - {context.tool_name}")
    return HookResult(success=True, should_continue=True)


async def audit_hook(context: HookContext) -> HookResult:
    """Audit hook that records tool usage."""
    return HookResult(
        success=True,
        should_continue=True,
        audit_data={
            "tool_name": context.tool_name,
            "tool_args": context.tool_args,
            "timestamp": context.timestamp,
        },
    )


async def permission_check_hook(context: HookContext) -> HookResult:
    """Permission check hook for PreToolUse."""
    # Example: check if tool is in allowed list
    allowed_tools = ["read_file", "search", "list"]
    
    if context.tool_name not in allowed_tools:
        return HookResult(
            success=True,
            should_continue=False,
            error=f"Tool '{context.tool_name}' not in allowed list",
        )
    
    return HookResult(success=True, should_continue=True)
