"""
SoloFlow MCP Tools Example

Demonstrates how to use SoloFlow's MCP tools for integration with AI agents.
"""

import asyncio
import json
from pathlib import Path

# Add parent directory to path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from mcp.server import SoloFlowMCPServer


async def main():
    # Initialize MCP server
    store_path = Path("mcp_example.db")
    server = SoloFlowMCPServer(store_path=store_path)
    await server.start()
    
    print("=== SoloFlow MCP Tools Example ===\n")
    
    # 1. Create a workflow
    print("1. Creating workflow...")
    create_result = await server.handle_request("tools/call", {
        "name": "soloflow_create",
        "arguments": {
            "name": "content-pipeline",
            "description": "Content creation pipeline",
            "steps": [
                {"id": "research", "name": "Research", "discipline": "deep", "prompt": "Research the topic"},
                {"id": "outline", "name": "Outline", "discipline": "deep", "prompt": "Create outline"},
                {"id": "draft", "name": "Draft", "discipline": "deep", "prompt": "Write first draft"},
                {"id": "review", "name": "Review", "discipline": "quick", "prompt": "Review and edit"},
                {"id": "publish", "name": "Publish", "discipline": "quick", "prompt": "Publish content"},
            ],
            "edges": [
                ["research", "outline"],
                ["outline", "draft"],
                ["draft", "review"],
                ["review", "publish"],
            ],
        },
    })
    
    create_data = json.loads(create_result["content"][0]["text"])
    workflow_id = create_data["workflow_id"]
    print(f"   Created: {workflow_id}")
    print(f"   State: {create_data['state']}")
    print(f"   Steps: {create_data['step_count']}\n")
    
    # 2. List workflows
    print("2. Listing workflows...")
    list_result = await server.handle_request("tools/call", {
        "name": "soloflow_list",
        "arguments": {},
    })
    
    list_data = json.loads(list_result["content"][0]["text"])
    print(f"   Found: {list_data['count']} workflow(s)\n")
    
    # 3. Get status
    print("3. Getting workflow status...")
    status_result = await server.handle_request("tools/call", {
        "name": "soloflow_status",
        "arguments": {"workflow_id": workflow_id},
    })
    
    status_data = json.loads(status_result["content"][0]["text"])
    print(f"   State: {status_data['state']}")
    print(f"   Steps: {len(status_data['steps'])}\n")
    
    # 4. List available tools
    print("4. Available MCP tools:")
    tools = server.registry.list_tools()
    for tool in tools:
        print(f"   - {tool['name']}: {tool['description'][:50]}...")
    
    print("\n=== Example Complete ===")
    
    # Cleanup
    await server.stop()
    store_path.unlink(missing_ok=True)


if __name__ == "__main__":
    asyncio.run(main())
