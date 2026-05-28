"""Governance layer for SoloFlow workflows.

Provides permission control, audit logging, and security policies.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger("soloflow.governance")


class Permission(str, Enum):
    """Workflow permissions."""
    
    CREATE = "create"
    READ = "read"
    EXECUTE = "execute"
    CANCEL = "cancel"
    DELETE = "delete"
    ADMIN = "admin"


class AuditAction(str, Enum):
    """Audit log actions."""
    
    WORKFLOW_CREATED = "workflow_created"
    WORKFLOW_STARTED = "workflow_started"
    WORKFLOW_COMPLETED = "workflow_completed"
    WORKFLOW_FAILED = "workflow_failed"
    WORKFLOW_CANCELLED = "workflow_cancelled"
    STEP_STARTED = "step_started"
    STEP_COMPLETED = "step_completed"
    STEP_FAILED = "step_failed"
    PERMISSION_CHECK = "permission_check"
    POLICY_VIOLATION = "policy_violation"


@dataclass
class AuditEntry:
    """An audit log entry."""
    
    entry_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=time.time)
    action: AuditAction = AuditAction.WORKFLOW_CREATED
    workflow_id: str = ""
    step_id: str = ""
    user_id: str = ""
    details: dict = field(default_factory=dict)
    success: bool = True
    
    def to_dict(self) -> dict:
        return {
            "entry_id": self.entry_id,
            "timestamp": self.timestamp,
            "action": self.action.value,
            "workflow_id": self.workflow_id,
            "step_id": self.step_id,
            "user_id": self.user_id,
            "details": self.details,
            "success": self.success,
        }


@dataclass
class SecurityPolicy:
    """Security policy for workflows."""
    
    max_parallel_workflows: int = 10
    max_execution_time_seconds: float = 3600.0
    max_step_retries: int = 3
    allowed_disciplines: list[str] = field(default_factory=lambda: ["quick", "deep", "visual", "ultrabrain"])
    require_approval_for: list[str] = field(default_factory=list)
    
    def to_dict(self) -> dict:
        return {
            "max_parallel_workflows": self.max_parallel_workflows,
            "max_execution_time_seconds": self.max_execution_time_seconds,
            "max_step_retries": self.max_step_retries,
            "allowed_disciplines": self.allowed_disciplines,
            "require_approval_for": self.require_approval_for,
        }


class GovernanceManager:
    """Manages governance, permissions, and audit logging.
    
    Usage:
        governance = GovernanceManager()
        
        # Check permissions
        has_permission = governance.check_permission(
            user_id="user_123",
            permission=Permission.EXECUTE,
            workflow_id="wf_456",
        )
        
        # Log audit event
        governance.log_audit(
            action=AuditAction.WORKFLOW_STARTED,
            workflow_id="wf_456",
            user_id="user_123",
        )
        
        # Get audit trail
        entries = governance.get_audit_trail(workflow_id="wf_456")
    """
    
    def __init__(self) -> None:
        self._permissions: dict[str, set[Permission]] = {}  # user_id -> permissions
        self._audit_log: list[AuditEntry] = []
        self._policy = SecurityPolicy()
        self._running_workflows: int = 0
    
    def set_policy(self, policy: SecurityPolicy) -> None:
        """Set the security policy."""
        self._policy = policy
    
    def get_policy(self) -> SecurityPolicy:
        """Get the current security policy."""
        return self._policy
    
    def grant_permission(self, user_id: str, permission: Permission) -> None:
        """Grant a permission to a user."""
        if user_id not in self._permissions:
            self._permissions[user_id] = set()
        self._permissions[user_id].add(permission)
    
    def revoke_permission(self, user_id: str, permission: Permission) -> None:
        """Revoke a permission from a user."""
        if user_id in self._permissions:
            self._permissions[user_id].discard(permission)
    
    def check_permission(
        self,
        user_id: str,
        permission: Permission,
        workflow_id: str = "",
    ) -> bool:
        """Check if a user has a permission."""
        # Admin has all permissions
        if Permission.ADMIN in self._permissions.get(user_id, set()):
            return True
        
        # Check specific permission
        has_perm = permission in self._permissions.get(user_id, set())
        
        # Log permission check
        self.log_audit(
            action=AuditAction.PERMISSION_CHECK,
            workflow_id=workflow_id,
            user_id=user_id,
            details={"permission": permission.value, "granted": has_perm},
            success=has_perm,
        )
        
        return has_perm
    
    def check_policy(self, workflow_id: str, discipline: str = "") -> tuple[bool, str]:
        """Check if a workflow complies with the security policy."""
        # Check parallel workflow limit
        if self._running_workflows >= self._policy.max_parallel_workflows:
            return False, f"Max parallel workflows ({self._policy.max_parallel_workflows}) reached"
        
        # Check discipline
        if discipline and discipline not in self._policy.allowed_disciplines:
            return False, f"Discipline '{discipline}' not allowed"
        
        return True, "Policy check passed"
    
    def log_audit(
        self,
        action: AuditAction,
        workflow_id: str = "",
        step_id: str = "",
        user_id: str = "",
        details: dict | None = None,
        success: bool = True,
    ) -> AuditEntry:
        """Log an audit event."""
        entry = AuditEntry(
            action=action,
            workflow_id=workflow_id,
            step_id=step_id,
            user_id=user_id,
            details=details or {},
            success=success,
        )
        
        self._audit_log.append(entry)
        logger.info(f"Audit: {action.value} - {workflow_id} - {user_id}")
        
        return entry
    
    def get_audit_trail(
        self,
        workflow_id: str | None = None,
        user_id: str | None = None,
        action: AuditAction | None = None,
        limit: int = 100,
    ) -> list[AuditEntry]:
        """Get audit trail with optional filters."""
        entries = self._audit_log
        
        if workflow_id:
            entries = [e for e in entries if e.workflow_id == workflow_id]
        
        if user_id:
            entries = [e for e in entries if e.user_id == user_id]
        
        if action:
            entries = [e for e in entries if e.action == action]
        
        return entries[-limit:]
    
    def increment_running_workflows(self) -> None:
        """Increment the running workflow count."""
        self._running_workflows += 1
    
    def decrement_running_workflows(self) -> None:
        """Decrement the running workflow count."""
        self._running_workflows = max(0, self._running_workflows - 1)
    
    def get_stats(self) -> dict:
        """Get governance statistics."""
        return {
            "total_audit_entries": len(self._audit_log),
            "running_workflows": self._running_workflows,
            "registered_users": len(self._permissions),
            "policy": self._policy.to_dict(),
        }
