"""MCP Server for SoloFlow.

Implements the Model Context Protocol server that exposes SoloFlow
workflow operations as tools for AI agents.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from .registry import MCPToolRegistry
from .tools import register_all_tools

logger = logging.getLogger("soloflow.mcp")


class SoloFlowMCPServer:
    """MCP Server exposing SoloFlow workflow operations.
    
    Usage:
        server = SoloFlowMCPServer(store_path=Path("soloflow.db"))
        await server.start()
    """
    
    def __init__(
        self,
        store_path: Path = Path("soloflow.db"),
        config: dict[str, Any] | None = None,
    ) -> None:
        self._store_path = store_path
        self._config = config or {}
        self._registry = MCPToolRegistry()
        self._running = False
        
        # Register all tools
        register_all_tools(self._registry, store_path)
    
    @property
    def registry(self) -> MCPToolRegistry:
        """Access the tool registry."""
        return self._registry
    
    async def start(self) -> None:
        """Start the MCP server."""
        self._running = True
        logger.info("SoloFlow MCP Server started")
        logger.info(f"Registered tools: {[t['name'] for t in self._registry.list_tools()]}")
    
    async def stop(self) -> None:
        """Stop the MCP server."""
        self._running = False
        logger.info("SoloFlow MCP Server stopped")
    
    async def handle_request(self, method: str, params: dict[str, Any]) -> Any:
        """Handle an MCP request.
        
        Args:
            method: The MCP method (e.g., "tools/list", "tools/call")
            params: The request parameters
            
        Returns:
            The response data
        """
        if method == "tools/list":
            return {"tools": self._registry.list_tools()}
        
        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})
            
            if not tool_name:
                return {"error": "Missing tool name"}
            
            try:
                result = await self._registry.call(tool_name, arguments)
                return {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}
            except Exception as e:
                logger.error(f"Tool call failed: {e}")
                return {"error": str(e)}
        
        else:
            return {"error": f"Unknown method: {method}"}
    
    def export_schemas(self, output_path: Path | None = None) -> Path:
        """Export tool schemas to JSON file.
        
        Args:
            output_path: Path to write schemas (default: mcp/schemas/tool_schemas.json)
            
        Returns:
            Path to the exported file
        """
        if output_path is None:
            output_path = Path(__file__).parent / "schemas" / "tool_schemas.json"
        
        self._registry.export_schemas(output_path)
        logger.info(f"Exported MCP schemas to {output_path}")
        return output_path
