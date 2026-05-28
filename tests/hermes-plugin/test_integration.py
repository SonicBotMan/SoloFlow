"""End-to-end integration tests for SoloFlow."""

import sys
import asyncio
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService
from services.scheduler import Scheduler
from governance import GovernanceManager, Permission, AuditAction
from human.approval import HumanApprovalManager
from visualization import WorkflowVisualizer
from models import WorkflowState, StepState


@pytest.fixture
def store(tmp_path):
    db_path = tmp_path / "test.db"
    store = SQLiteStore(db_path)
    store.initialize()
    return store


@pytest.fixture
def service(store):
    ws = WorkflowService(store)
    ws.set_scheduler(Scheduler(store, ws))
    return ws


@pytest.fixture
def governance():
    return GovernanceManager()


@pytest.fixture
def approval_manager():
    return HumanApprovalManager()


@pytest.fixture
def visualizer():
    return WorkflowVisualizer()


class TestEndToEnd:
    """End-to-end integration tests."""
    
    @pytest.mark.asyncio
    async def test_complete_workflow_lifecycle(self, service, governance):
        """Test complete workflow from creation to completion."""
        # Grant permission
        governance.grant_permission("user_1", Permission.CREATE)
        governance.grant_permission("user_1", Permission.EXECUTE)
        
        # Create workflow
        steps = [
            {"id": "research", "name": "Research", "discipline": "deep", "prompt": "Research topic"},
            {"id": "write", "name": "Write", "discipline": "deep", "prompt": "Write article"},
            {"id": "review", "name": "Review", "discipline": "quick", "prompt": "Review article"},
        ]
        edges = [("research", "write"), ("write", "review")]
        
        wf = await service.create_workflow("article", "Write article", steps, edges)
        assert wf["state"] == WorkflowState.DRAFT.value
        
        # Log audit
        governance.log_audit(
            action=AuditAction.WORKFLOW_CREATED,
            workflow_id=wf["id"],
            user_id="user_1",
        )
        
        # Start workflow
        started = await service.start_workflow(wf["id"])
        assert started["state"] == WorkflowState.RUNNING.value
        
        governance.log_audit(
            action=AuditAction.WORKFLOW_STARTED,
            workflow_id=wf["id"],
            user_id="user_1",
        )
        
        # Execute steps
        await service.advance_step(wf["id"], "research", result="Research done")
        await service.advance_step(wf["id"], "write", result="Article written")
        await service.advance_step(wf["id"], "review", result="Article reviewed")
        
        # Check completion
        status = await service.get_status(wf["id"])
        assert status["state"] == WorkflowState.COMPLETED.value
        
        governance.log_audit(
            action=AuditAction.WORKFLOW_COMPLETED,
            workflow_id=wf["id"],
            user_id="user_1",
        )
        
        # Verify audit trail
        audit_trail = governance.get_audit_trail(workflow_id=wf["id"])
        assert len(audit_trail) == 3
    
    @pytest.mark.asyncio
    async def test_workflow_with_approval(self, service, approval_manager):
        """Test workflow with human approval step."""
        steps = [
            {"id": "draft", "name": "Draft", "discipline": "deep", "prompt": "Write draft"},
            {"id": "approve", "name": "Approve", "discipline": "quick", "prompt": "Get approval"},
            {"id": "publish", "name": "Publish", "discipline": "quick", "prompt": "Publish"},
        ]
        edges = [("draft", "approve"), ("approve", "publish")]
        
        wf = await service.create_workflow("publish", "Publish article", steps, edges)
        await service.start_workflow(wf["id"])
        
        # Execute draft step
        await service.advance_step(wf["id"], "draft", result="Draft ready")
        
        # Create approval request
        request = approval_manager.create_request(
            workflow_id=wf["id"],
            step_id="approve",
            prompt="Please approve the draft",
            timeout_seconds=60.0,
        )
        
        # Approve
        approval_manager.approve(request.request_id, "Looks good")
        
        # Continue workflow
        await service.advance_step(wf["id"], "approve", result="Approved")
        await service.advance_step(wf["id"], "publish", result="Published")
        
        status = await service.get_status(wf["id"])
        assert status["state"] == WorkflowState.COMPLETED.value
    
    def test_visualization(self, visualizer):
        """Test workflow visualization."""
        steps = [
            {"id": "a", "name": "Step A", "status": "completed"},
            {"id": "b", "name": "Step B", "status": "running"},
            {"id": "c", "name": "Step C", "status": "pending"},
        ]
        edges = [("a", "b"), ("b", "c")]
        
        # Generate Mermaid
        mermaid = visualizer.to_mermaid(steps, edges)
        assert "flowchart TD" in mermaid
        assert "Step A" in mermaid
        
        # Generate HTML
        html = visualizer.to_html(steps, edges)
        assert "<!DOCTYPE html>" in html
        
        # Generate dict
        result = visualizer.to_dict(steps, edges)
        assert len(result["nodes"]) == 3
        assert len(result["edges"]) == 2
    
    @pytest.mark.asyncio
    async def test_governance_policy_enforcement(self, service, governance):
        """Test governance policy enforcement."""
        # Set restrictive policy
        policy = governance.get_policy()
        policy.allowed_disciplines = ["quick"]  # Only allow quick tasks
        
        steps = [
            {"id": "deep_task", "name": "Deep Task", "discipline": "deep", "prompt": "Complex task"},
        ]
        
        wf = await service.create_workflow("test", "Test", steps, [])
        
        # Check policy
        ok, msg = governance.check_policy(wf["id"], discipline="deep")
        assert ok is False
        assert "not allowed" in msg
