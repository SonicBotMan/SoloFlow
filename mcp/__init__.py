"""SoloFlow MCP (Model Context Protocol) Server.

Standalone MCP server for exposing SoloFlow workflow operations
as tools for AI agents. Does NOT depend on hermes_agent.
"""

from .server import SoloFlowMCPServer
from .registry import MCPToolRegistry

__all__ = ["SoloFlowMCPServer", "MCPToolRegistry"]
