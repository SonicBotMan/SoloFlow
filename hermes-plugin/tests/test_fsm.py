"""Tests for SoloFlow FSM (core/fsm.py)."""

import pytest

from core.fsm import can_transition, transition


class TestWorkflowTransitions:
    """Tests for workflow state transitions."""

    def test_draft_to_active(self):
        """draft -> active is valid."""
        assert can_transition("draft", "active", is_workflow=True) is True

    def test_active_to_running(self):
        """active -> running is valid."""
        assert can_transition("active", "running", is_workflow=True) is True

    def test_active_to_cancelled(self):
        """active -> cancelled is valid."""
        assert can_transition("active", "cancelled", is_workflow=True) is True

    def test_running_to_completed(self):
        """running -> completed is valid."""
        assert can_transition("running", "completed", is_workflow=True) is True

    def test_running_to_failed(self):
        """running -> failed is valid."""
        assert can_transition("running", "failed", is_workflow=True) is True

    def test_invalid_draft_to_running(self):
        """draft -> running is invalid (must go through active first)."""
        assert can_transition("draft", "running", is_workflow=True) is False

    def test_invalid_completed_to_any(self):
        """completed is a terminal state."""
        assert can_transition("completed", "active", is_workflow=True) is False
        assert can_transition("completed", "running", is_workflow=True) is False

    def test_invalid_failed_to_any(self):
        """failed is a terminal state."""
        assert can_transition("failed", "active", is_workflow=True) is False

    def test_invalid_cancelled_to_any(self):
        """cancelled is a terminal state."""
        assert can_transition("cancelled", "active", is_workflow=True) is False

    def test_invalid_unknown_state(self):
        """Unknown state should return False."""
        assert can_transition("nonexistent", "active", is_workflow=True) is False


class TestStepTransitions:
    """Tests for step state transitions."""

    def test_pending_to_ready(self):
        """pending -> ready is valid."""
        assert can_transition("pending", "ready", is_workflow=False) is True

    def test_pending_to_skipped(self):
        """pending -> skipped is valid."""
        assert can_transition("pending", "skipped", is_workflow=False) is True

    def test_ready_to_running(self):
        """ready -> running is valid."""
        assert can_transition("ready", "running", is_workflow=False) is True

    def test_running_to_completed(self):
        """running -> completed is valid."""
        assert can_transition("running", "completed", is_workflow=False) is True

    def test_running_to_failed(self):
        """running -> failed is valid."""
        assert can_transition("running", "failed", is_workflow=False) is True

    def test_invalid_pending_to_running(self):
        """pending -> running is invalid (must go through ready)."""
        assert can_transition("pending", "running", is_workflow=False) is False

    def test_invalid_completed_to_any(self):
        """completed is a terminal state for steps."""
        assert can_transition("completed", "running", is_workflow=False) is False

    def test_invalid_failed_to_any(self):
        """failed is a terminal state for steps."""
        assert can_transition("failed", "running", is_workflow=False) is False

    def test_invalid_skipped_to_any(self):
        """skipped is a terminal state for steps."""
        assert can_transition("skipped", "running", is_workflow=False) is False


class TestTransitionFunction:
    """Tests for transition() function."""

    def test_valid_transition_returns_target(self):
        """Valid transition should return the target state."""
        assert transition("draft", "active") == "active"
        assert transition("active", "running") == "running"
        assert transition("running", "completed") == "completed"

    def test_invalid_transition_raises(self):
        """Invalid transition should raise ValueError."""
        with pytest.raises(ValueError, match="Invalid workflow state transition"):
            transition("draft", "running")

    def test_invalid_step_transition_raises(self):
        """Invalid step transition should raise ValueError."""
        with pytest.raises(ValueError, match="Invalid step state transition"):
            transition("pending", "running", is_workflow=False)

    def test_valid_step_transition(self):
        """Valid step transition should return target."""
        assert transition("pending", "ready", is_workflow=False) == "ready"
        assert transition("ready", "running", is_workflow=False) == "running"
