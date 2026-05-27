# SoloFlow MCP Server

MCP (Model Context Protocol) server for SoloFlow workflow orchestration.

## Overview

This module exposes SoloFlow's workflow operations as MCP tools, enabling AI agents to create, execute, monitor, and manage workflows programmatically.

## Tools

| Tool | Description |
|------|-------------|
| `soloflow_create` | Create a new workflow with steps and DAG edges |
| `soloflow_run` | Execute a workflow with DAG parallelism |
| `soloflow_status` | Get workflow status and progress |
| `soloflow_list` | List workflows with optional state filter |
| `soloflow_cancel` | Cancel a running workflow |

## Quick Start

```python
from pathlib import Path
from mcp.server import SoloFlowMCPServer

# Create server
server = SoloFlowMCPServer(store_path=Path("soloflow.db"))

# Start server
await server.start()

# Create a workflow
result = await server.handle_request("tools/call", {
    "name": "soloflow_create",
    "arguments": {
        "name": "research-report",
        "description": "Generate a research report",
        "steps": [
            {"id": "topic", "name": "Define Topic", "prompt": "Choose research topic"},
            {"id": "search", "name": "Search", "prompt": "Search for information"},
            {"id": "write", "name": "Write Report", "prompt": "Write the report"},
        ],
        "edges": [["topic", "search"], ["search", "write"]],
    },
})

# Execute the workflow
workflow_id = result["workflow_id"]
await server.handle_request("tools/call", {
    "name": "soloflow_run",
    "arguments": {"workflow_id": workflow_id},
})

# Check status
status = await server.handle_request("tools/call", {
    "name": "soloflow_status",
    "arguments": {"workflow_id": workflow_id},
})

# Stop server
await server.stop()
```

## Integration with AI Agents

### Hermes Agent

Add to your Hermes config:

```yaml
tools:
  mcp:
    servers:
      soloflow:
        command: python
        args: ["-m", "mcp.server"]
```

### Claude Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "soloflow": {
      "command": "python",
      "args": ["-m", "mcp.server"],
      "env": {
        "SOLOFLOW_DB": "/path/to/soloflow.db"
      }
    }
  }
}
```

## Tool Schemas

Export tool schemas for integration:

```python
server.export_schemas(Path("tool_schemas.json"))
```

## Architecture

```
mcp/
├── __init__.py          # Package exports
├── server.py            # MCP Server implementation
├── registry.py          # Tool registry
├── tools/
│   ├── __init__.py      # Tool registration
│   ├── tools_create.py  # soloflow_create handler
│   ├── tools_run.py     # soloflow_run handler
│   ├── tools_status.py  # soloflow_status handler
│   ├── tools_list.py    # soloflow_list handler
│   └── tools_cancel.py  # soloflow_cancel handler
└── schemas/
    └── tool_schemas.json  # Exported tool schemas
```

## Testing

```bash
# Run MCP tests
python -m pytest tests/mcp/ -v

# Run all tests
python -m pytest tests/ -v
```

## License

MIT
