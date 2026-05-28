"""Tests for hooks system."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from hooks import HooksManager, HookPoint, HookContext, HookResult


@pytest.fixture
def manager():
    return HooksManager()


class TestHooksManager:
    @pytest.mark.asyncio
    async def test_register_and_execute(self, manager):
        executed = []
        
        async def test_hook(context):
            executed.append(context.tool_name)
            return HookResult(success=True, should_continue=True)
        
        manager.register_hook(HookPoint.PRE_TOOL_USE, test_hook)
        
        context = HookContext(
            hook_point=HookPoint.PRE_TOOL_USE,
            tool_name="read_file",
        )
        
        result = await manager.execute_hooks(HookPoint.PRE_TOOL_USE, context)
        assert result.success is True
        assert result.should_continue is True
        assert "read_file" in executed
    
    @pytest.mark.asyncio
    async def test_hook_blocks_execution(self, manager):
        async def blocking_hook(context):
            return HookResult(
                success=True,
                should_continue=False,
                error="Blocked by policy",
            )
        
        manager.register_hook(HookPoint.PRE_TOOL_USE, blocking_hook)
        
        context = HookContext(
            hook_point=HookPoint.PRE_TOOL_USE,
            tool_name="dangerous_tool",
        )
        
        result = await manager.execute_hooks(HookPoint.PRE_TOOL_USE, context)
        assert result.should_continue is False
        assert "Blocked" in result.error
    
    @pytest.mark.asyncio
    async def test_audit_log(self, manager):
        async def audit_hook(context):
            return HookResult(
                success=True,
                should_continue=True,
                audit_data={"action": "test"},
            )
        
        manager.register_hook(HookPoint.POST_TOOL_USE, audit_hook)
        
        context = HookContext(
            hook_point=HookPoint.POST_TOOL_USE,
            tool_name="read_file",
        )
        
        await manager.execute_hooks(HookPoint.POST_TOOL_USE, context)
        
        logs = manager.get_audit_log()
        assert len(logs) == 1
        assert logs[0]["hook_point"] == "post_tool_use"
    
    @pytest.mark.asyncio
    async def test_multiple_hooks(self, manager):
        call_order = []
        
        async def hook1(context):
            call_order.append("hook1")
            return HookResult(success=True, should_continue=True)
        
        async def hook2(context):
            call_order.append("hook2")
            return HookResult(success=True, should_continue=True)
        
        manager.register_hook(HookPoint.PRE_TOOL_USE, hook1)
        manager.register_hook(HookPoint.PRE_TOOL_USE, hook2)
        
        context = HookContext(hook_point=HookPoint.PRE_TOOL_USE)
        await manager.execute_hooks(HookPoint.PRE_TOOL_USE, context)
        
        assert call_order == ["hook1", "hook2"]
    
    def test_get_audit_log_filter(self, manager):
        manager._audit_log = [
            {"hook_point": "pre_tool_use", "timestamp": 1},
            {"hook_point": "post_tool_use", "timestamp": 2},
            {"hook_point": "pre_tool_use", "timestamp": 3},
        ]
        
        logs = manager.get_audit_log(hook_point=HookPoint.PRE_TOOL_USE)
        assert len(logs) == 2
