"""Human-in-the-loop node for SoloFlow workflows.

Pauses workflow execution and waits for human approval/input.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Callable, Awaitable

logger = logging.getLogger("soloflow.human")


class ApprovalStatus(str, Enum):
    """Status of a human approval request."""
    
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    TIMEOUT = "timeout"


@dataclass
class ApprovalRequest:
    """A request for human approval.
    
    Attributes:
        request_id: Unique identifier for the request
        workflow_id: ID of the workflow requesting approval
        step_id: ID of the step requiring approval
        prompt: Message to display to the human
        context: Additional context for the approval
        status: Current status of the request
        response: Human response (if approved/rejected)
        created_at: Timestamp when request was created
        resolved_at: Timestamp when request was resolved
        timeout_seconds: How long to wait before timeout
    """
    
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    workflow_id: str = ""
    step_id: str = ""
    prompt: str = ""
    context: dict = field(default_factory=dict)
    status: ApprovalStatus = ApprovalStatus.PENDING
    response: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    resolved_at: Optional[float] = None
    timeout_seconds: float = 3600.0
    
    @property
    def is_expired(self) -> bool:
        """Check if the request has timed out."""
        if self.status != ApprovalStatus.PENDING:
            return False
        return (time.time() - self.created_at) > self.timeout_seconds
    
    def approve(self, response: str = "") -> None:
        """Approve the request.
        
        Args:
            response: Optional response message from the human
        """
        self.status = ApprovalStatus.APPROVED
        self.response = response
        self.resolved_at = time.time()
    
    def reject(self, reason: str = "") -> None:
        """Reject the request.
        
        Args:
            reason: Reason for rejection
        """
        self.status = ApprovalStatus.REJECTED
        self.response = reason
        self.resolved_at = time.time()
    
    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "request_id": self.request_id,
            "workflow_id": self.workflow_id,
            "step_id": self.step_id,
            "prompt": self.prompt,
            "context": self.context,
            "status": self.status.value,
            "response": self.response,
            "created_at": self.created_at,
            "resolved_at": self.resolved_at,
        }


class HumanApprovalManager:
    """Manages human approval requests for workflow steps.
    
    Usage:
        manager = HumanApprovalManager()
        
        # Create approval request
        request = manager.create_request(
            workflow_id="wf_123",
            step_id="review",
            prompt="Please review and approve the output",
            context={"output": "..."},
        )
        
        # Wait for approval
        result = await manager.wait_for_approval(request.request_id)
        
        # Or approve directly
        manager.approve(request.request_id, "Looks good!")
    """
    
    def __init__(self) -> None:
        """Initialize the approval manager."""
        self._requests: dict[str, ApprovalRequest] = {}
        self._callbacks: dict[str, list] = {}
    
    def create_request(
        self,
        workflow_id: str,
        step_id: str,
        prompt: str,
        context: dict | None = None,
        timeout_seconds: float = 3600.0,
    ) -> ApprovalRequest:
        """Create a new approval request.
        
        Args:
            workflow_id: ID of the workflow
            step_id: ID of the step requiring approval
            prompt: Message to display to the human
            context: Additional context for the approval
            timeout_seconds: How long to wait before timeout
            
        Returns:
            Created ApprovalRequest
        """
        request = ApprovalRequest(
            workflow_id=workflow_id,
            step_id=step_id,
            prompt=prompt,
            context=context or {},
            timeout_seconds=timeout_seconds,
        )
        self._requests[request.request_id] = request
        return request
    
    def get_request(self, request_id: str) -> Optional[ApprovalRequest]:
        """Get an approval request by ID.
        
        Args:
            request_id: ID of the request
            
        Returns:
            ApprovalRequest if found, None otherwise
        """
        return self._requests.get(request_id)
    
    def list_requests(
        self,
        workflow_id: str | None = None,
        status: ApprovalStatus | None = None,
    ) -> list[ApprovalRequest]:
        """List approval requests with optional filters.
        
        Args:
            workflow_id: Filter by workflow ID
            status: Filter by status
            
        Returns:
            List of matching ApprovalRequest objects
        """
        requests = list(self._requests.values())
        if workflow_id:
            requests = [r for r in requests if r.workflow_id == workflow_id]
        if status:
            requests = [r for r in requests if r.status == status]
        return requests
    
    def approve(self, request_id: str, response: str = "") -> bool:
        """Approve a request.
        
        Args:
            request_id: ID of the request to approve
            response: Optional response message
            
        Returns:
            True if approved, False if not found or already resolved
        """
        request = self._requests.get(request_id)
        if not request or request.status != ApprovalStatus.PENDING:
            return False
        request.approve(response)
        return True
    
    def reject(self, request_id: str, reason: str = "") -> bool:
        """Reject a request.
        
        Args:
            request_id: ID of the request to reject
            reason: Reason for rejection
            
        Returns:
            True if rejected, False if not found or already resolved
        """
        request = self._requests.get(request_id)
        if not request or request.status != ApprovalStatus.PENDING:
            return False
        request.reject(reason)
        return True
    
    async def wait_for_approval(
        self,
        request_id: str,
        poll_interval: float = 1.0,
    ) -> ApprovalRequest:
        """Wait for a request to be approved or rejected.
        
        Args:
            request_id: ID of the request to wait for
            poll_interval: How often to check for status changes (seconds)
            
        Returns:
            The resolved ApprovalRequest
            
        Raises:
            ValueError: If request not found
        """
        request = self._requests.get(request_id)
        if not request:
            raise ValueError(f"Request {request_id} not found")
        
        while request.status == ApprovalStatus.PENDING:
            if request.is_expired:
                request.status = ApprovalStatus.TIMEOUT
                break
            await asyncio.sleep(poll_interval)
        
        return request
    
    def cleanup_expired(self) -> int:
        """Clean up expired requests.
        
        Returns:
            Number of requests that were expired
        """
        expired = [r for r in self._requests.values() if r.is_expired]
        for request in expired:
            request.status = ApprovalStatus.TIMEOUT
        return len(expired)
