"""Tests for SoloFlow MCP Tools."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from mcp.registry import MCPToolRegistry


@pytest.fixture
def registry():
    """Create a test tool registry."""
    return MCPToolRegistry()


class TestMCPToolRegistry:
    """Tests for MCPToolRegistry."""
    
    def test_register_tool(self, registry):
        """Test registering a tool."""
        async def handler(**kwargs):
            return {"result": "ok"}
        
        registry.register(
            name="test_tool",
            description="A test tool",
            input_schema={"type": "object", "properties": {}},
            handler=handler,
        )
        
        tools = registry.list_tools()
        assert len(tools) == 1
        assert tools[0]["name"] == "test_tool"
    
    def test_get_tool(self, registry):
        """Test getting a tool by name."""
        async def handler(**kwargs):
            return {"result": "ok"}
        
        registry.register(
            name="test_tool",
            description="A test tool",
            input_schema={"type": "object", "properties": {}},
            handler=handler,
        )
        
        tool = registry.get("test_tool")
        assert tool is not None
        assert tool.name == "test_tool"
    
    def test_get_unknown_tool(self, registry):
        """Test getting an unknown tool."""
        tool = registry.get("nonexistent")
        assert tool is None
    
    @pytest.mark.asyncio
    async def test_call_tool(self, registry):
        """Test calling a tool."""
        async def handler(x, y):
            return {"sum": x + y}
        
        registry.register(
            name="add",
            description="Add two numbers",
            input_schema={"type": "object", "properties": {}},
            handler=handler,
        )
        
        result = await registry.call("add", {"x": 1, "y": 2})
        assert result == {"sum": 3}
    
    @pytest.mark.asyncio
    async def test_call_unknown_tool(self, registry):
        """Test calling an unknown tool."""
        with pytest.raises(ValueError, match="Unknown tool"):
            await registry.call("nonexistent", {})
    
    def test_export_schemas(self, registry, tmp_path):
        """Test exporting schemas."""
        async def handler(**kwargs):
            return {"result": "ok"}
        
        registry.register(
            name="test_tool",
            description="A test tool",
            input_schema={"type": "object", "properties": {}},
            handler=handler,
        )
        
        output_path = tmp_path / "schemas.json"
        registry.export_schemas(output_path)
        
        assert output_path.exists()
        schemas = json.loads(output_path.read_text())
        assert "tools" in schemas
        assert len(schemas["tools"]) == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
