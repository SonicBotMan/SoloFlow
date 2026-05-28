"""Tests for FSM state machine."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from core.fsm import can_transition, transition
from models import WorkflowState, StepState

def test_workflow_transitions():
    assert can_transition("draft", "active") is True
    assert can_transition("active", "running") is True
    assert can_transition("running", "completed") is True
    assert can_transition("running", "failed") is True
    assert can_transition("running", "cancelled") is True

def test_invalid_workflow_transition():
    assert can_transition("completed", "running") is False
    assert can_transition("failed", "active") is False
    assert can_transition("draft", "completed") is False

def test_step_transitions():
    assert can_transition("pending", "ready", is_workflow=False) is True
    assert can_transition("ready", "running", is_workflow=False) is True
    assert can_transition("running", "completed", is_workflow=False) is True
    assert can_transition("running", "failed", is_workflow=False) is True

def test_invalid_step_transition():
    assert can_transition("completed", "running", is_workflow=False) is False
    assert can_transition("pending", "completed", is_workflow=False) is False

def test_transition():
    result = transition("draft", "active")
    assert result == "active"
    
    with pytest.raises(ValueError, match="Invalid"):
        transition("completed", "running")
