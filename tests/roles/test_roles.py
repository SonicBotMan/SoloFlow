"""Tests for role-based agent system."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from roles import RoleRegistry, AgentRole, Permission, BUILTIN_ROLES


@pytest.fixture
def registry():
    return RoleRegistry()


class TestAgentRole:
    def test_has_permission(self):
        role = AgentRole(
            name="test",
            description="Test role",
            permissions={Permission.READ, Permission.WRITE},
        )
        assert role.has_permission(Permission.READ) is True
        assert role.has_permission(Permission.EXECUTE) is False
    
    def test_can_delegate_to(self):
        role = AgentRole(
            name="manager",
            description="Manager",
            can_delegate_to=["worker"],
        )
        assert role.can_delegate_to_role("worker") is True
        assert role.can_delegate_to_role("other") is False


class TestRoleRegistry:
    def test_builtin_roles(self, registry):
        roles = registry.list_roles()
        assert len(roles) >= 5
        role_names = [r["name"] for r in roles]
        assert "planner" in role_names
        assert "researcher" in role_names
    
    def test_create_agent(self, registry):
        agent = registry.create_agent("a1", "planner", "Alice")
        assert agent.name == "Alice"
        assert agent.role.name == "planner"
        assert agent.can_do(Permission.DELEGATE) is True
    
    def test_create_agent_invalid_role(self, registry):
        with pytest.raises(ValueError, match="not found"):
            registry.create_agent("a1", "nonexistent", "Bob")
    
    def test_check_delegation_allowed(self, registry):
        registry.create_agent("a1", "planner", "Alice")
        ok, msg = registry.check_delegation("a1", "researcher")
        assert ok is True
    
    def test_check_delegation_denied(self, registry):
        registry.create_agent("a1", "researcher", "Bob")
        ok, msg = registry.check_delegation("a1", "planner")
        assert ok is False
        assert "DELEGATE" in msg
