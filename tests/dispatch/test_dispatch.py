"""Tests for sub-agent dispatch system."""

import sys
import asyncio
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from dispatch import SubAgentDispatcher, SubAgent, DispatchPlan, AgentStatus


@pytest.fixture
def dispatcher():
    d = SubAgentDispatcher()
    
    async def mock_executor(task, context):
        await asyncio.sleep(0.01)
        return {"result": f"Done: {task}", "token_usage": {"total": 100}}
    
    d.register_executor("default", mock_executor)
    return d


class TestSubAgent:
    def test_creation(self):
        agent = SubAgent(task="test task")
        assert agent.task == "test task"
        assert agent.status == AgentStatus.PENDING
    
    def test_to_dict(self):
        agent = SubAgent(task="test")
        d = agent.to_dict()
        assert d["task"] == "test"
        assert d["status"] == "pending"


class TestDispatchPlan:
    def test_creation(self):
        plan = DispatchPlan(
            task="main task",
            subtasks=[{"task": "sub1"}, {"task": "sub2"}],
        )
        assert plan.task == "main task"
        assert len(plan.subtasks) == 2


class TestSubAgentDispatcher:
    def test_register_executor(self, dispatcher):
        assert "default" in dispatcher._executors
    
    def test_create_plan(self, dispatcher):
        plan = dispatcher.create_plan(
            task="research",
            subtasks=[
                {"task": "search"},
                {"task": "analyze"},
            ],
        )
        assert plan.task == "research"
        assert len(plan.subtasks) == 2
    
    @pytest.mark.asyncio
    async def test_dispatch_parallel(self, dispatcher):
        plan = dispatcher.create_plan(
            task="research",
            subtasks=[
                {"task": "search web"},
                {"task": "search papers"},
            ],
            strategy="parallel",
        )
        
        agents = await dispatcher.dispatch(plan)
        assert len(agents) == 2
        assert all(a.status == AgentStatus.COMPLETED for a in agents)
    
    @pytest.mark.asyncio
    async def test_dispatch_sequential(self, dispatcher):
        plan = dispatcher.create_plan(
            task="workflow",
            subtasks=[
                {"task": "step 1"},
                {"task": "step 2"},
            ],
            strategy="sequential",
        )
        
        agents = await dispatcher.dispatch(plan)
        assert len(agents) == 2
        assert all(a.status == AgentStatus.COMPLETED for a in agents)
    
    def test_merge_results(self, dispatcher):
        results = [
            {"task": "search", "status": "completed", "result": {"data": "A"}, "token_usage": {"total": 100}},
            {"task": "analyze", "status": "completed", "result": {"data": "B"}, "token_usage": {"total": 200}},
        ]
        
        merged = dispatcher.merge_results(results)
        assert merged["total_agents"] == 2
        assert merged["completed"] == 2
        assert merged["total_tokens"] == 300
    
    @pytest.mark.asyncio
    async def test_get_total_token_usage(self, dispatcher):
        plan = dispatcher.create_plan(
            task="test",
            subtasks=[{"task": "a"}, {"task": "b"}],
        )
        await dispatcher.dispatch(plan)
        
        usage = dispatcher.get_total_token_usage()
        assert usage["total"] > 0
