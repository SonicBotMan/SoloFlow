import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from governance import GovernanceManager, Permission, AuditAction, SecurityPolicy

@pytest.fixture
def governance():
    return GovernanceManager()

def test_grant_permission(governance):
    governance.grant_permission("user_1", Permission.CREATE)
    assert governance.check_permission("user_1", Permission.CREATE) is True

def test_revoke_permission(governance):
    governance.grant_permission("user_1", Permission.CREATE)
    governance.revoke_permission("user_1", Permission.CREATE)
    assert governance.check_permission("user_1", Permission.CREATE) is False

def test_admin_permission(governance):
    governance.grant_permission("admin_1", Permission.ADMIN)
    assert governance.check_permission("admin_1", Permission.DELETE) is True
    assert governance.check_permission("admin_1", Permission.EXECUTE) is True

def test_check_policy(governance):
    ok, msg = governance.check_policy("wf_1", discipline="quick")
    assert ok is True

def test_check_policy_invalid_discipline(governance):
    ok, msg = governance.check_policy("wf_1", discipline="invalid")
    assert ok is False

def test_log_audit(governance):
    entry = governance.log_audit(
        action=AuditAction.WORKFLOW_CREATED,
        workflow_id="wf_1",
        user_id="user_1",
    )
    assert entry.workflow_id == "wf_1"
    assert len(governance.get_audit_trail()) == 1

def test_get_audit_trail(governance):
    governance.log_audit(action=AuditAction.WORKFLOW_CREATED, workflow_id="wf_1")
    governance.log_audit(action=AuditAction.WORKFLOW_STARTED, workflow_id="wf_1")
    governance.log_audit(action=AuditAction.WORKFLOW_CREATED, workflow_id="wf_2")
    
    # Filter by workflow
    wf1_entries = governance.get_audit_trail(workflow_id="wf_1")
    assert len(wf1_entries) == 2
    
    # Filter by action
    created_entries = governance.get_audit_trail(action=AuditAction.WORKFLOW_CREATED)
    assert len(created_entries) == 2

def test_running_workflows(governance):
    governance.increment_running_workflows()
    governance.increment_running_workflows()
    assert governance.get_stats()["running_workflows"] == 2
    
    governance.decrement_running_workflows()
    assert governance.get_stats()["running_workflows"] == 1
