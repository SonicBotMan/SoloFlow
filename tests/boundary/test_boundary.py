"""Tests for workflow-agent boundary control."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from boundary import (
    WorkflowAgentBoundary,
    NodeDefinition,
    NodeType,
    WORKFLOW_TEMPLATES,
    AGENT_TEMPLATES,
)


@pytest.fixture
def boundary():
    b = WorkflowAgentBoundary()
    for node in WORKFLOW_TEMPLATES.values():
        b.register_node(node)
    for node in AGENT_TEMPLATES.values():
        b.register_node(node)
    return b


class TestNodeDefinition:
    def test_workflow_node(self):
        node = NodeDefinition(
            node_id="test",
            name="Test",
            node_type=NodeType.WORKFLOW,
        )
        assert node.is_deterministic() is True
        assert node.is_open_ended() is False
    
    def test_agent_node(self):
        node = NodeDefinition(
            node_id="test",
            name="Test",
            node_type=NodeType.AGENT,
        )
        assert node.is_deterministic() is False
        assert node.is_open_ended() is True


class TestWorkflowAgentBoundary:
    def test_register_node(self, boundary):
        nodes = boundary.list_nodes()
        assert len(nodes) >= 6
    
    def test_suggest_workflow(self, boundary):
        node_type, reason = boundary.suggest_node_type("Approve the payment request")
        assert node_type == NodeType.WORKFLOW
    
    def test_suggest_agent(self, boundary):
        node_type, reason = boundary.suggest_node_type("Analyze the market trends")
        assert node_type == NodeType.AGENT
    
    def test_validate_workflow_missing_handler(self, boundary):
        # Workflow templates don't have handlers, so should fail
        ok, errors = boundary.validate_workflow(["validate_input", "call_api"])
        assert ok is False
        assert any("missing handler" in e for e in errors)
    
    def test_validate_workflow_missing_node(self, boundary):
        ok, errors = boundary.validate_workflow(["nonexistent"])
        assert ok is False
        assert "not found" in errors[0]
    
    def test_validate_agent_missing_prompt(self, boundary):
        # Agent templates have prompts, so should pass
        ok, errors = boundary.validate_workflow(["analyze_data"])
        assert ok is True
    
    def test_get_node(self, boundary):
        node = boundary.get_node("validate_input")
        assert node is not None
        assert node.name == "Validate Input"
