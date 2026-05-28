"""Workflow-Agent boundary control for SoloFlow.

Implements Mastra-style separation:
- Workflow = deterministic control flow
- Agent = open-ended reasoning
- Clear boundary between the two
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable, Optional

logger = logging.getLogger("soloflow.boundary")


class NodeType(str, Enum):
    """Type of workflow node."""
    
    WORKFLOW = "workflow"  # Deterministic, predefined
    AGENT = "agent"       # Open-ended, LLM-driven
    GATEWAY = "gateway"   # Decision point
    HUMAN = "human"       # Human-in-the-loop


@dataclass
class NodeDefinition:
    """Defines a workflow node with boundary control."""
    
    node_id: str
    name: str
    node_type: NodeType
    description: str = ""
    
    # For workflow nodes: predefined logic
    handler: Optional[Callable[..., Awaitable[Any]]] = None
    
    # For agent nodes: LLM configuration
    system_prompt: str = ""
    tools: list[str] = field(default_factory=list)
    max_iterations: int = 10
    
    # For gateway nodes: decision logic
    condition: Optional[Callable[..., bool]] = None
    
    # For human nodes: approval config
    approval_required: bool = False
    timeout_seconds: float = 3600.0
    
    def is_deterministic(self) -> bool:
        """Check if node is deterministic (workflow type)."""
        return self.node_type == NodeType.WORKFLOW
    
    def is_open_ended(self) -> bool:
        """Check if node is open-ended (agent type)."""
        return self.node_type == NodeType.AGENT
    
    def to_dict(self) -> dict:
        return {
            "node_id": self.node_id,
            "name": self.name,
            "node_type": self.node_type.value,
            "description": self.description,
            "is_deterministic": self.is_deterministic(),
        }


class WorkflowAgentBoundary:
    """Manages the boundary between workflow and agent nodes.
    
    Key insight from Mastra:
    "Workflow manages control, Agent manages uncertainty."
    
    This class helps decide which nodes should be workflow
    (deterministic) and which should be agent (open-ended).
    """
    
    def __init__(self) -> None:
        self._nodes: dict[str, NodeDefinition] = {}
    
    def register_node(self, node: NodeDefinition) -> None:
        """Register a node definition."""
        self._nodes[node.node_id] = node
    
    def get_node(self, node_id: str) -> Optional[NodeDefinition]:
        """Get a node by ID."""
        return self._nodes.get(node_id)
    
    def list_nodes(self) -> list[dict]:
        """List all registered nodes."""
        return [node.to_dict() for node in self._nodes.values()]
    
    def suggest_node_type(
        self,
        task_description: str,
    ) -> tuple[NodeType, str]:
        """Suggest whether a task should be workflow or agent.
        
        Decision criteria from Mastra:
        - Can you predefine steps, order, completion conditions? → Workflow
        - Does it require open-ended reasoning, tool selection, iteration? → Agent
        """
        # Keywords suggesting workflow (deterministic)
        workflow_keywords = [
            "approve", "validate", "check", "verify",
            "sequential", "parallel", "retry", "timeout",
            "database", "api call", "file operation",
        ]
        
        # Keywords suggesting agent (open-ended)
        agent_keywords = [
            "analyze", "research", "generate", "create",
            "decide", "choose", "explore", "brainstorm",
            "summarize", "explain", "debug", "optimize",
        ]
        
        task_lower = task_description.lower()
        
        workflow_score = sum(1 for kw in workflow_keywords if kw in task_lower)
        agent_score = sum(1 for kw in agent_keywords if kw in task_lower)
        
        if workflow_score > agent_score:
            return NodeType.WORKFLOW, "Task has deterministic steps"
        elif agent_score > workflow_score:
            return NodeType.AGENT, "Task requires open-ended reasoning"
        else:
            return NodeType.AGENT, "Default to agent for flexibility"
    
    def validate_workflow(self, nodes: list[str]) -> tuple[bool, list[str]]:
        """Validate a workflow definition.
        
        Checks:
        - All nodes exist
        - Workflow nodes have handlers
        - Agent nodes have prompts
        """
        errors = []
        
        for node_id in nodes:
            node = self._nodes.get(node_id)
            if not node:
                errors.append(f"Node '{node_id}' not found")
                continue
            
            if node.is_deterministic() and not node.handler:
                errors.append(f"Workflow node '{node_id}' missing handler")
            
            if node.is_open_ended() and not node.system_prompt:
                errors.append(f"Agent node '{node_id}' missing system_prompt")
        
        return len(errors) == 0, errors


# Predefined node templates
WORKFLOW_TEMPLATES = {
    "validate_input": NodeDefinition(
        node_id="validate_input",
        name="Validate Input",
        node_type=NodeType.WORKFLOW,
        description="Validate input data against schema",
    ),
    "call_api": NodeDefinition(
        node_id="call_api",
        name="Call API",
        node_type=NodeType.WORKFLOW,
        description="Make external API call",
    ),
    "save_to_db": NodeDefinition(
        node_id="save_to_db",
        name="Save to Database",
        node_type=NodeType.WORKFLOW,
        description="Persist data to database",
    ),
    "send_notification": NodeDefinition(
        node_id="send_notification",
        name="Send Notification",
        node_type=NodeType.WORKFLOW,
        description="Send notification to user",
    ),
}

AGENT_TEMPLATES = {
    "analyze_data": NodeDefinition(
        node_id="analyze_data",
        name="Analyze Data",
        node_type=NodeType.AGENT,
        description="Analyze data and extract insights",
        system_prompt="You are a data analyst. Analyze the provided data and extract key insights.",
        tools=["data_query", "visualization"],
    ),
    "generate_report": NodeDefinition(
        node_id="generate_report",
        name="Generate Report",
        node_type=NodeType.AGENT,
        description="Generate a structured report",
        system_prompt="You are a report writer. Generate a clear, structured report based on the provided data.",
        tools=["document_generate"],
    ),
    "research_topic": NodeDefinition(
        node_id="research_topic",
        name="Research Topic",
        node_type=NodeType.AGENT,
        description="Research a topic thoroughly",
        system_prompt="You are a researcher. Research the given topic thoroughly and provide comprehensive findings.",
        tools=["web_search", "file_read"],
    ),
}

GATEWAY_TEMPLATES = {
    "check_approval": NodeDefinition(
        node_id="check_approval",
        name="Check Approval",
        node_type=NodeType.GATEWAY,
        description="Check if approval is required",
    ),
    "check_budget": NodeDefinition(
        node_id="check_budget",
        name="Check Budget",
        node_type=NodeType.GATEWAY,
        description="Check if within budget constraints",
    ),
}
