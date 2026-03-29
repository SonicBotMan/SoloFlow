"""ContextBus 测试"""
import pytest
from soloflow.context_bus import ContextBus


@pytest.fixture
def bus():
    return ContextBus()


class TestContextBus:
    def test_publish_and_get(self, bus):
        """测试发布和获取"""
        bus.publish("flow1", "writer", "脚本内容", "task-1")
        result = bus.get("flow1", "writer")
        assert result is not None
        assert result["content"] == "脚本内容"

    def test_build_context_prompt(self, bus):
        """测试构建上下文提示词"""
        bus.publish("flow1", "writer", "脚本内容", "task-1")
        bus.publish("flow1", "visual", "分镜描述", "task-2")
        
        prompt = bus.build_context_prompt("flow1")
        assert "writer" in prompt
        assert "脚本内容" in prompt

    def test_empty_context(self, bus):
        """测试空上下文"""
        result = bus.get("flow1", "writer")
        assert result is None
        prompt = bus.build_context_prompt("flow1")
        assert prompt == ""

    def test_overwrite(self, bus):
        """测试覆盖更新"""
        bus.publish("flow1", "writer", "版本1", "task-1")
        bus.publish("flow1", "writer", "版本2", "task-2")
        result = bus.get("flow1", "writer")
        assert result["content"] == "版本2"
