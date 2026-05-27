"""MCP Tool Registry for SoloFlow.

Registers and manages MCP tool definitions with their handlers.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Awaitable


@dataclass
class MCPToolDefinition:
    """Definition of an MCP tool."""
    
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Callable[..., Awaitable[Any]]
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to MCP tool format."""
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
        }


class MCPToolRegistry:
    """Registry for MCP tools."""
    
    def __init__(self) -> None:
        self._tools: dict[str, MCPToolDefinition] = {}
    
    def register(
        self,
        name: str,
        description: str,
        input_schema: dict[str, Any],
        handler: Callable[..., Awaitable[Any]],
    ) -> None:
        """Register a new MCP tool."""
        self._tools[name] = MCPToolDefinition(
            name=name,
            description=description,
            input_schema=input_schema,
            handler=handler,
        )
    
    def get(self, name: str) -> MCPToolDefinition | None:
        """Get a tool by name."""
        return self._tools.get(name)
    
    def list_tools(self) -> list[dict[str, Any]]:
        """List all registered tools in MCP format."""
        return [tool.to_dict() for tool in self._tools.values()]
    
    async def call(self, name: str, arguments: dict[str, Any]) -> Any:
        """Call a tool by name with arguments."""
        tool = self._tools.get(name)
        if not tool:
            raise ValueError(f"Unknown tool: {name}")
        return await tool.handler(**arguments)
    
    def export_schemas(self, output_path: Path) -> None:
        """Export all tool schemas to a JSON file."""
        schemas = {
            "tools": self.list_tools(),
            "generated_at": time.time(),
        }
        output_path.write_text(json.dumps(schemas, indent=2))
