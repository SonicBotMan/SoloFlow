# SoloFlow Examples

This directory contains example scripts demonstrating SoloFlow's capabilities.

## Quick Start

```bash
cd SoloFlow
python examples/01_basic_workflow.py
```

## Examples

### Core Features
- `01_basic_workflow.py` - Basic workflow creation and execution
- `02_scheduler_and_memory.py` - Scheduler and memory integration
- `03_error_handling.py` - Error handling and recovery

### Advanced Features
- `04_mcp_tools.py` - MCP tools integration
- `05_trace_system.py` - Trace system for observability
- `06_ebbinghaus_memory.py` - Ebbinghaus forgetting curve memory
- `07_discipline_routing.py` - Discipline-aware task routing
- `08_skill_evolution.py` - Skill auto-evolution

## Running Examples

Each example is self-contained and can be run independently:

```bash
# Basic workflow
python examples/01_basic_workflow.py

# MCP tools
python examples/04_mcp_tools.py

# Trace system
python examples/05_trace_system.py
```

## Creating Your Own

Use the examples as templates for your own workflows. Key patterns:

1. **Initialize store and services**
2. **Define workflow steps and edges**
3. **Execute and monitor**
4. **Handle results**
