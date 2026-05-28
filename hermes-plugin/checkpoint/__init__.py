"""Checkpoint system for SoloFlow workflows.

Implements LangGraph-style checkpointing: recoverable execution context,
not just logging. Supports thread-based isolation and interrupt/resume.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class CheckpointStatus(str, Enum):
    """Status of a checkpoint."""
    
    PENDING = "pending"
    COMMITTED = "committed"
    RESTORED = "restored"
    SUPERSEDED = "superseded"


@dataclass
class Checkpoint:
    """A checkpoint representing recoverable execution state.
    
    Unlike a log entry, a checkpoint IS the execution context.
    You can resume from any checkpoint.
    """
    
    checkpoint_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    thread_id: str = ""  # Execution chain key (tenant:user:workflow)
    workflow_id: str = ""
    step_id: str = ""
    
    # State snapshot
    state: dict = field(default_factory=dict)
    completed_steps: list[str] = field(default_factory=list)
    pending_steps: list[str] = field(default_factory=list)
    
    # Metadata
    status: CheckpointStatus = CheckpointStatus.PENDING
    created_at: float = field(default_factory=time.time)
    parent_checkpoint_id: Optional[str] = None
    
    # Interrupt info
    interrupt_before: list[str] = field(default_factory=list)
    interrupt_after: list[str] = field(default_factory=list)
    is_interrupted: bool = False
    interrupt_reason: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            "checkpoint_id": self.checkpoint_id,
            "thread_id": self.thread_id,
            "workflow_id": self.workflow_id,
            "step_id": self.step_id,
            "state": self.state,
            "completed_steps": self.completed_steps,
            "pending_steps": self.pending_steps,
            "status": self.status.value,
            "created_at": self.created_at,
            "parent_checkpoint_id": self.parent_checkpoint_id,
            "interrupt_before": self.interrupt_before,
            "interrupt_after": self.interrupt_after,
            "is_interrupted": self.is_interrupted,
            "interrupt_reason": self.interrupt_reason,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> Checkpoint:
        return cls(
            checkpoint_id=data["checkpoint_id"],
            thread_id=data["thread_id"],
            workflow_id=data["workflow_id"],
            step_id=data.get("step_id", ""),
            state=data.get("state", {}),
            completed_steps=data.get("completed_steps", []),
            pending_steps=data.get("pending_steps", []),
            status=CheckpointStatus(data.get("status", "pending")),
            created_at=data.get("created_at", time.time()),
            parent_checkpoint_id=data.get("parent_checkpoint_id"),
            interrupt_before=data.get("interrupt_before", []),
            interrupt_after=data.get("interrupt_after", []),
            is_interrupted=data.get("is_interrupted", False),
            interrupt_reason=data.get("interrupt_reason"),
        )


class CheckpointStore:
    """Persistent checkpoint storage.
    
    Key design from LangGraph:
    - thread_id = tenant_id:user_id:workflow_id (multi-tenant isolation)
    - Checkpoints are execution contexts, not logs
    - Pending writes are preserved on partial failure
    """
    
    def __init__(self, db_path: str = "checkpoints.db") -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._init_db()
    
    def _init_db(self) -> None:
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS checkpoints (
                checkpoint_id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                workflow_id TEXT NOT NULL,
                step_id TEXT,
                state_json TEXT,
                completed_steps_json TEXT,
                pending_steps_json TEXT,
                status TEXT NOT NULL,
                created_at REAL NOT NULL,
                parent_checkpoint_id TEXT,
                interrupt_before_json TEXT,
                interrupt_after_json TEXT,
                is_interrupted BOOLEAN DEFAULT 0,
                interrupt_reason TEXT
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_checkpoints_thread 
            ON checkpoints(thread_id)
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_checkpoints_workflow 
            ON checkpoints(workflow_id)
        """)
        self._conn.commit()
    
    def save(self, checkpoint: Checkpoint) -> None:
        """Save a checkpoint."""
        self._conn.execute("""
            INSERT OR REPLACE INTO checkpoints (
                checkpoint_id, thread_id, workflow_id, step_id,
                state_json, completed_steps_json, pending_steps_json,
                status, created_at, parent_checkpoint_id,
                interrupt_before_json, interrupt_after_json,
                is_interrupted, interrupt_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            checkpoint.checkpoint_id,
            checkpoint.thread_id,
            checkpoint.workflow_id,
            checkpoint.step_id,
            json.dumps(checkpoint.state),
            json.dumps(checkpoint.completed_steps),
            json.dumps(checkpoint.pending_steps),
            checkpoint.status.value,
            checkpoint.created_at,
            checkpoint.parent_checkpoint_id,
            json.dumps(checkpoint.interrupt_before),
            json.dumps(checkpoint.interrupt_after),
            checkpoint.is_interrupted,
            checkpoint.interrupt_reason,
        ))
        self._conn.commit()
    
    def get(self, checkpoint_id: str) -> Optional[Checkpoint]:
        """Get a checkpoint by ID."""
        cursor = self._conn.execute(
            "SELECT * FROM checkpoints WHERE checkpoint_id = ?",
            (checkpoint_id,)
        )
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_checkpoint(row)
    
    def get_latest(self, thread_id: str) -> Optional[Checkpoint]:
        """Get the latest checkpoint for a thread."""
        cursor = self._conn.execute("""
            SELECT * FROM checkpoints 
            WHERE thread_id = ? AND status != 'superseded'
            ORDER BY created_at DESC LIMIT 1
        """, (thread_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_checkpoint(row)
    
    def get_history(self, thread_id: str, limit: int = 100) -> list[Checkpoint]:
        """Get checkpoint history for a thread."""
        cursor = self._conn.execute("""
            SELECT * FROM checkpoints 
            WHERE thread_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (thread_id, limit))
        return [self._row_to_checkpoint(row) for row in cursor.fetchall()]
    
    def supersede(self, checkpoint_id: str) -> None:
        """Mark a checkpoint as superseded."""
        self._conn.execute("""
            UPDATE checkpoints SET status = 'superseded' 
            WHERE checkpoint_id = ?
        """, (checkpoint_id,))
        self._conn.commit()
    
    def _row_to_checkpoint(self, row: tuple) -> Checkpoint:
        """Convert database row to Checkpoint."""
        return Checkpoint(
            checkpoint_id=row[0],
            thread_id=row[1],
            workflow_id=row[2],
            step_id=row[3] or "",
            state=json.loads(row[4]) if row[4] else {},
            completed_steps=json.loads(row[5]) if row[5] else [],
            pending_steps=json.loads(row[6]) if row[6] else [],
            status=CheckpointStatus(row[7]),
            created_at=row[8],
            parent_checkpoint_id=row[9],
            interrupt_before=json.loads(row[10]) if row[10] else [],
            interrupt_after=json.loads(row[11]) if row[11] else [],
            is_interrupted=bool(row[12]),
            interrupt_reason=row[13],
        )
    
    def close(self) -> None:
        """Close the store."""
        self._conn.close()


class CheckpointManager:
    """Manages checkpoints for workflow execution.
    
    Key patterns from LangGraph:
    1. Checkpoint before side effects (not after)
    2. thread_id = tenant:user:workflow for multi-tenancy
    3. Interrupt before dangerous nodes
    4. Preserve pending writes on partial failure
    """
    
    def __init__(self, store: CheckpointStore) -> None:
        self._store = store
    
    def create_thread_id(
        self,
        tenant: str = "default",
        user: str = "default",
        workflow_id: str = "",
    ) -> str:
        """Create a thread ID with multi-tenant isolation."""
        return f"{tenant}:{user}:{workflow_id}"
    
    def save_checkpoint(
        self,
        thread_id: str,
        workflow_id: str,
        step_id: str,
        state: dict,
        completed_steps: list[str],
        pending_steps: list[str],
        interrupt_before: list[str] | None = None,
        interrupt_after: list[str] | None = None,
        parent_checkpoint_id: str | None = None,
    ) -> Checkpoint:
        """Save a checkpoint (execution context snapshot)."""
        # Supersede previous checkpoint for this thread
        previous = self._store.get_latest(thread_id)
        if previous:
            self._store.supersede(previous.checkpoint_id)
        
        checkpoint = Checkpoint(
            thread_id=thread_id,
            workflow_id=workflow_id,
            step_id=step_id,
            state=state,
            completed_steps=completed_steps,
            pending_steps=pending_steps,
            status=CheckpointStatus.COMMITTED,
            interrupt_before=interrupt_before or [],
            interrupt_after=interrupt_after or [],
            parent_checkpoint_id=parent_checkpoint_id or (previous.checkpoint_id if previous else None),
        )
        
        self._store.save(checkpoint)
        return checkpoint
    
    def restore_checkpoint(self, checkpoint_id: str) -> Optional[Checkpoint]:
        """Restore execution context from a checkpoint."""
        checkpoint = self._store.get(checkpoint_id)
        if checkpoint:
            checkpoint.status = CheckpointStatus.RESTORED
            self._store.save(checkpoint)
        return checkpoint
    
    def restore_latest(self, thread_id: str) -> Optional[Checkpoint]:
        """Restore the latest checkpoint for a thread."""
        checkpoint = self._store.get_latest(thread_id)
        if checkpoint:
            checkpoint.status = CheckpointStatus.RESTORED
            self._store.save(checkpoint)
        return checkpoint
    
    def should_interrupt(
        self,
        checkpoint: Checkpoint,
        next_step: str,
    ) -> tuple[bool, str]:
        """Check if execution should be interrupted before a step.
        
        Returns:
            (should_interrupt, reason)
        """
        if next_step in checkpoint.interrupt_before:
            return True, f"Interrupt before '{next_step}' (configured)"
        
        if checkpoint.is_interrupted:
            return True, checkpoint.interrupt_reason or "Interrupted"
        
        return False, ""
    
    def interrupt(
        self,
        checkpoint: Checkpoint,
        reason: str,
    ) -> Checkpoint:
        """Mark a checkpoint as interrupted."""
        checkpoint.is_interrupted = True
        checkpoint.interrupt_reason = reason
        self._store.save(checkpoint)
        return checkpoint
    
    def resume(
        self,
        checkpoint: Checkpoint,
        updated_state: dict | None = None,
    ) -> Checkpoint:
        """Resume execution from a checkpoint.
        
        Args:
            checkpoint: The checkpoint to resume from
            updated_state: Optional state updates (from human review)
        """
        if updated_state:
            checkpoint.state.update(updated_state)
        
        checkpoint.is_interrupted = False
        checkpoint.interrupt_reason = None
        checkpoint.status = CheckpointStatus.COMMITTED
        self._store.save(checkpoint)
        return checkpoint
    
    def get_history(self, thread_id: str) -> list[dict]:
        """Get checkpoint history for a thread."""
        checkpoints = self._store.get_history(thread_id)
        return [cp.to_dict() for cp in checkpoints]
