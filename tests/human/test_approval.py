import asyncio
import sys
import time
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from human.approval import HumanApprovalManager, ApprovalRequest, ApprovalStatus

@pytest.fixture
def manager():
    return HumanApprovalManager()

def test_create_request(manager):
    request = manager.create_request(workflow_id="wf_1", step_id="review", prompt="Review")
    assert request.workflow_id == "wf_1"
    assert request.status == ApprovalStatus.PENDING

def test_approve_request(manager):
    request = manager.create_request(workflow_id="wf_1", step_id="review", prompt="Review")
    success = manager.approve(request.request_id, "Approved")
    assert success is True
    updated = manager.get_request(request.request_id)
    assert updated.status == ApprovalStatus.APPROVED

def test_reject_request(manager):
    request = manager.create_request(workflow_id="wf_1", step_id="review", prompt="Review")
    success = manager.reject(request.request_id, "Needs work")
    assert success is True
    updated = manager.get_request(request.request_id)
    assert updated.status == ApprovalStatus.REJECTED

@pytest.mark.asyncio
async def test_wait_for_approval(manager):
    request = manager.create_request(workflow_id="wf_1", step_id="review", prompt="Review")
    async def approve_later():
        await asyncio.sleep(0.1)
        manager.approve(request.request_id, "Done")
    asyncio.create_task(approve_later())
    result = await manager.wait_for_approval(request.request_id)
    assert result.status == ApprovalStatus.APPROVED
