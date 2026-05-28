"""Tests for checkpoint system."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from checkpoint import CheckpointStore, CheckpointManager, Checkpoint, CheckpointStatus


@pytest.fixture
def store(tmp_path):
    db_path = str(tmp_path / "test.db")
    return CheckpointStore(db_path=db_path)


@pytest.fixture
def manager(store):
    return CheckpointManager(store)


class TestCheckpoint:
    def test_creation(self):
        cp = Checkpoint(thread_id="t1", workflow_id="wf1", step_id="s1")
        assert cp.thread_id == "t1"
        assert cp.status == CheckpointStatus.PENDING
    
    def test_to_dict(self):
        cp = Checkpoint(thread_id="t1", workflow_id="wf1")
        d = cp.to_dict()
        assert d["thread_id"] == "t1"
        assert "state" in d


class TestCheckpointStore:
    def test_save_and_get(self, store):
        cp = Checkpoint(thread_id="t1", workflow_id="wf1", step_id="s1")
        cp.status = CheckpointStatus.COMMITTED
        store.save(cp)
        
        result = store.get(cp.checkpoint_id)
        assert result is not None
        assert result.thread_id == "t1"
    
    def test_get_latest(self, store):
        cp1 = Checkpoint(thread_id="t1", workflow_id="wf1", step_id="s1")
        cp1.status = CheckpointStatus.COMMITTED
        store.save(cp1)
        
        cp2 = Checkpoint(thread_id="t1", workflow_id="wf1", step_id="s2")
        cp2.status = CheckpointStatus.COMMITTED
        store.save(cp2)
        
        latest = store.get_latest("t1")
        assert latest.checkpoint_id == cp2.checkpoint_id
    
    def test_supersede(self, store):
        cp = Checkpoint(thread_id="t1", workflow_id="wf1")
        cp.status = CheckpointStatus.COMMITTED
        store.save(cp)
        
        store.supersede(cp.checkpoint_id)
        result = store.get(cp.checkpoint_id)
        assert result.status == CheckpointStatus.SUPERSEDED


class TestCheckpointManager:
    def test_create_thread_id(self, manager):
        tid = manager.create_thread_id("tenant1", "user1", "wf1")
        assert tid == "tenant1:user1:wf1"
    
    def test_save_checkpoint(self, manager):
        cp = manager.save_checkpoint(
            thread_id="t1",
            workflow_id="wf1",
            step_id="s1",
            state={"key": "value"},
            completed_steps=["s0"],
            pending_steps=["s1", "s2"],
        )
        assert cp.status == CheckpointStatus.COMMITTED
        assert cp.state == {"key": "value"}
    
    def test_restore_checkpoint(self, manager):
        cp = manager.save_checkpoint(
            thread_id="t1",
            workflow_id="wf1",
            step_id="s1",
            state={"key": "value"},
            completed_steps=[],
            pending_steps=["s1"],
        )
        
        restored = manager.restore_checkpoint(cp.checkpoint_id)
        assert restored.status == CheckpointStatus.RESTORED
    
    def test_interrupt_before(self, manager):
        cp = manager.save_checkpoint(
            thread_id="t1",
            workflow_id="wf1",
            step_id="s0",
            state={},
            completed_steps=[],
            pending_steps=["s1", "s2"],
            interrupt_before=["s2"],
        )
        
        should_interrupt, reason = manager.should_interrupt(cp, "s1")
        assert should_interrupt is False
        
        should_interrupt, reason = manager.should_interrupt(cp, "s2")
        assert should_interrupt is True
    
    def test_interrupt_and_resume(self, manager):
        cp = manager.save_checkpoint(
            thread_id="t1",
            workflow_id="wf1",
            step_id="s1",
            state={},
            completed_steps=[],
            pending_steps=["s1"],
        )
        
        interrupted = manager.interrupt(cp, "Needs approval")
        assert interrupted.is_interrupted is True
        
        resumed = manager.resume(interrupted, {"approved": True})
        assert resumed.is_interrupted is False
        assert resumed.state["approved"] is True
    
    def test_get_history(self, manager):
        for i in range(3):
            manager.save_checkpoint(
                thread_id="t1",
                workflow_id="wf1",
                step_id=f"s{i}",
                state={"step": i},
                completed_steps=[],
                pending_steps=[],
            )
        
        history = manager.get_history("t1")
        assert len(history) == 3
