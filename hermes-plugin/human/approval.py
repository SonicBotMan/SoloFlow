"""Human-in-the-loop node for SoloFlow workflows."""

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
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    TIMEOUT = "timeout"


@dataclass
class ApprovalRequest:
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
        if self.status != ApprovalStatus.PENDING:
            return False
        return (time.time() - self.created_at) > self.timeout_seconds
    
    def approve(self, response: str = "") -> None:
        self.status = ApprovalStatus.APPROVED
        self.response = response
        self.resolved_at = time.time()
    
    def reject(self, reason: str = "") -> None:
        self.status = ApprovalStatus.REJECTED
        self.response = reason
        self.resolved_at = time.time()
    
    def to_dict(self) -> dict:
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
    def __init__(self) -> None:
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
        return self._requests.get(request_id)
    
    def list_requests(
        self,
        workflow_id: str | None = None,
        status: ApprovalStatus | None = None,
    ) -> list[ApprovalRequest]:
        requests = list(self._requests.values())
        if workflow_id:
            requests = [r for r in requests if r.workflow_id == workflow_id]
        if status:
            requests = [r for r in requests if r.status == status]
        return requests
    
    def approve(self, request_id: str, response: str = "") -> bool:
        request = self._requests.get(request_id)
        if not request or request.status != ApprovalStatus.PENDING:
            return False
        request.approve(response)
        return True
    
    def reject(self, request_id: str, reason: str = "") -> bool:
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
        expired = [r for r in self._requests.values() if r.is_expired]
        for request in expired:
            request.status = ApprovalStatus.TIMEOUT
        return len(expired)
