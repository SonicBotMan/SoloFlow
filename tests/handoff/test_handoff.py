"""Tests for handoff mechanism."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from handoff import HandoffManager, HandoffType, HandoffConfig


@pytest.fixture
def manager():
    m = HandoffManager()
    m.register_agent("manager", "Manager Agent", ["routing", "decision"])
    m.register_agent("researcher", "Research Agent", ["search", "analysis"])
    m.register_agent("writer", "Writer Agent", ["writing", "formatting"])
    return m


class TestHandoffManager:
    def test_register_agent(self, manager):
        agent = manager.get_agent("manager")
        assert agent is not None
        assert agent["name"] == "Manager Agent"
    
    def test_list_agents(self, manager):
        agents = manager.list_agents()
        assert len(agents) == 3
    
    def test_suggest_control_handoff(self, manager):
        handoff_type, reason = manager.suggest_handoff_type("Escalate to legal team")
        assert handoff_type == HandoffType.CONTROL
    
    def test_suggest_capability_call(self, manager):
        handoff_type, reason = manager.suggest_handoff_type("Summarize this document")
        assert handoff_type == HandoffType.CAPABILITY
    
    @pytest.mark.asyncio
    async def test_handoff_control(self, manager):
        result = await manager.handoff(
            source_agent="manager",
            target_agent="researcher",
            context={"task": "research AI"},
            handoff_type=HandoffType.CONTROL,
        )
        assert result.success is True
        assert result.handoff_type == HandoffType.CONTROL
        assert result.result["ownership"] == "transferred"
    
    @pytest.mark.asyncio
    async def test_handoff_capability(self, manager):
        result = await manager.handoff(
            source_agent="manager",
            target_agent="writer",
            context={"text": "summarize this"},
            handoff_type=HandoffType.CAPABILITY,
        )
        assert result.success is True
        assert result.handoff_type == HandoffType.CAPABILITY
        assert result.result["ownership"] == "retained"
    
    @pytest.mark.asyncio
    async def test_handoff_invalid_source(self, manager):
        result = await manager.handoff(
            source_agent="nonexistent",
            target_agent="researcher",
            context={},
        )
        assert result.success is False
        assert "not found" in result.error
    
    @pytest.mark.asyncio
    async def test_handoff_invalid_target(self, manager):
        result = await manager.handoff(
            source_agent="manager",
            target_agent="nonexistent",
            context={},
        )
        assert result.success is False
        assert "not found" in result.error
    
    @pytest.mark.asyncio
    async def test_get_stats(self, manager):
        await manager.handoff("manager", "researcher", {}, HandoffType.CONTROL)
        await manager.handoff("manager", "writer", {}, HandoffType.CAPABILITY)
        
        stats = manager.get_stats()
        assert stats["total"] == 2
        assert stats["control_handoffs"] == 1
        assert stats["capability_calls"] == 1
