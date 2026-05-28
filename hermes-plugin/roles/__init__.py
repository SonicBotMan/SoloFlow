"""Role-based agent system for SoloFlow.

Implements CrewAI-style role-based agents:
- Roles define permissions and responsibilities
- Delegation is explicit and controlled
- Structured outputs for reliable data passing
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger("soloflow.roles")


class Permission(str, Enum):
    """Agent permissions."""
    
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    DELEGATE = "delegate"
    APPROVE = "approve"


@dataclass
class AgentRole:
    """Defines an agent's role with permissions and responsibilities.
    
    Key insight from CrewAI:
    "Roles are not personas, they are permission and responsibility boundaries."
    """
    
    name: str
    description: str
    permissions: set[Permission] = field(default_factory=set)
    can_delegate_to: list[str] = field(default_factory=list)  # Role names
    tools: list[str] = field(default_factory=list)
    
    def has_permission(self, permission: Permission) -> bool:
        """Check if role has a specific permission."""
        return permission in self.permissions
    
    def can_delegate_to_role(self, role_name: str) -> bool:
        """Check if role can delegate to another role."""
        return role_name in self.can_delegate_to
    
    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "permissions": [p.value for p in self.permissions],
            "can_delegate_to": self.can_delegate_to,
            "tools": self.tools,
        }


# Predefined roles
BUILTIN_ROLES = {
    "planner": AgentRole(
        name="planner",
        description="Plans tasks, decides delegation, manages workflow",
        permissions={Permission.READ, Permission.DELEGATE},
        can_delegate_to=["researcher", "specialist", "writer", "reviewer"],
        tools=["workflow_create", "workflow_status"],
    ),
    "researcher": AgentRole(
        name="researcher",
        description="Collects information, extracts facts, fills context",
        permissions={Permission.READ, Permission.WRITE, Permission.EXECUTE},
        can_delegate_to=[],
        tools=["web_search", "file_read", "database_query"],
    ),
    "specialist": AgentRole(
        name="specialist",
        description="Handles specific tasks like code, retrieval, analysis",
        permissions={Permission.READ, Permission.WRITE, Permission.EXECUTE},
        can_delegate_to=[],
        tools=["code_execute", "data_analyze"],
    ),
    "writer": AgentRole(
        name="writer",
        description="Synthesizes output, produces structured results",
        permissions={Permission.READ, Permission.WRITE},
        can_delegate_to=[],
        tools=["document_generate"],
    ),
    "reviewer": AgentRole(
        name="reviewer",
        description="Validates format, checks compliance, verifies facts",
        permissions={Permission.READ, Permission.APPROVE},
        can_delegate_to=[],
        tools=["validate_output"],
    ),
}


@dataclass
class RoleAgent:
    """An agent with a specific role."""
    
    agent_id: str
    role: AgentRole
    name: str
    context: dict = field(default_factory=dict)  # Scoped context
    
    def can_do(self, permission: Permission) -> bool:
        """Check if agent can perform an action."""
        return self.role.has_permission(permission)
    
    def can_delegate_to(self, role_name: str) -> bool:
        """Check if agent can delegate to a role."""
        return self.role.can_delegate_to_role(role_name)
    
    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "role": self.role.name,
            "name": self.name,
            "permissions": [p.value for p in self.role.permissions],
        }


class RoleRegistry:
    """Registry for managing roles and agents."""
    
    def __init__(self) -> None:
        self._roles: dict[str, AgentRole] = dict(BUILTIN_ROLES)
        self._agents: dict[str, RoleAgent] = {}
    
    def register_role(self, role: AgentRole) -> None:
        """Register a custom role."""
        self._roles[role.name] = role
    
    def get_role(self, name: str) -> Optional[AgentRole]:
        """Get a role by name."""
        return self._roles.get(name)
    
    def create_agent(
        self,
        agent_id: str,
        role_name: str,
        name: str,
        context: dict | None = None,
    ) -> RoleAgent:
        """Create an agent with a specific role."""
        role = self._roles.get(role_name)
        if not role:
            raise ValueError(f"Role '{role_name}' not found")
        
        agent = RoleAgent(
            agent_id=agent_id,
            role=role,
            name=name,
            context=context or {},
        )
        self._agents[agent_id] = agent
        return agent
    
    def get_agent(self, agent_id: str) -> Optional[RoleAgent]:
        """Get an agent by ID."""
        return self._agents.get(agent_id)
    
    def list_roles(self) -> list[dict]:
        """List all registered roles."""
        return [role.to_dict() for role in self._roles.values()]
    
    def list_agents(self) -> list[dict]:
        """List all agents."""
        return [agent.to_dict() for agent in self._agents.values()]
    
    def check_delegation(
        self,
        from_agent_id: str,
        to_role: str,
    ) -> tuple[bool, str]:
        """Check if delegation is allowed."""
        from_agent = self._agents.get(from_agent_id)
        if not from_agent:
            return False, "Agent not found"
        
        if not from_agent.can_do(Permission.DELEGATE):
            return False, f"Agent '{from_agent.name}' does not have DELEGATE permission"
        
        if not from_agent.can_delegate_to(to_role):
            return False, f"Agent '{from_agent.name}' cannot delegate to role '{to_role}'"
        
        return True, "Delegation allowed"
