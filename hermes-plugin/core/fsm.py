"""
FSM (Finite State Machine) for SoloFlow workflow and step state transitions.

Defines valid state transitions and provides validation helpers.
"""

from __future__ import annotations

from typing import Final

# Workflow state transitions
_WORKFLOW_TRANSITIONS: Final[dict[str, set[str]]] = {
    "draft": {"active"},
    "active": {"running", "cancelled"},
    "running": {"completed", "failed", "cancelled"},
    "completed": set(),
    "failed": set(),
    "cancelled": set(),
}

# Step state transitions
_STEP_TRANSITIONS: Final[dict[str, set[str]]] = {
    "pending": {"ready", "skipped"},
    "ready": {"running", "skipped"},
    "running": {"completed", "failed"},
    "completed": set(),
    "failed": set(),
    "skipped": set(),
}


def can_transition(current: str, target: str, is_workflow: bool = True) -> bool:
    """Check if a state transition is valid."""
    if is_workflow:
        return target in _WORKFLOW_TRANSITIONS.get(current, set())
    else:
        return target in _STEP_TRANSITIONS.get(current, set())


def transition(current: str, target: str, is_workflow: bool = True) -> str:
    """Perform a state transition, raising an error if invalid."""
    if not can_transition(current, target, is_workflow):
        entity_type = "workflow" if is_workflow else "step"
        raise ValueError(
            f"Invalid {entity_type} state transition: {current} → {target}"
        )
    return target
