# SoloFlow ⚡

### The Brain Behind AI Workflow Orchestration

**Turn chaotic multi-step AI tasks into structured, observable, retryable workflows — with cognitive memory and discipline-aware routing.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-64%20passing-brightgreen.svg)](./tests)
[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./requirements.txt)

---

## Why SoloFlow?

AI Agents fail in predictable ways:

| Problem | SoloFlow Solution |
|---------|-------------------|
| **No Observability** — 8-step chain fails at step 5, no trace, no resume | **Trace System** — nested spans, token tracking, JSON export |
| **Amnesiac Agents** — every invocation starts from zero | **Ebbinghaus Memory** — three-tier memory with forgetting curve |
| **One-Size-Fits-All** — simple tasks waste deep reasoning | **Discipline Routing** — auto-classify to quick/deep/visual/ultrabrain |
| **No Learning** — repeated patterns stay manual | **Skill Evolution** — detect patterns → package skills → expose as MCP tools |

---

## Four Pillars

### 1. DAG + FSM Hybrid Architecture
```
expressiveness(DAG) + rigor(FSM) = reliability
```
- Kahn algorithm for topological sorting
- Parallel execution where possible, sequential where required
- Automatic retry with exponential backoff

### 2. Cognitive Memory System
```
R(t) = base × e^(-t / stability)
```
- **Working Memory** — LRU cache for current context
- **Episodic Memory** — SQLite + FTS5 for event history
- **Semantic Memory** — pattern extraction and template storage
- **Ebbinghaus Forgetting Curve** — automatic memory consolidation

### 3. Discipline-Aware Routing
```
quick (~2s) → deep (~30s) → visual (~30s) → ultrabrain (~120s)
```
- Auto-classify tasks by complexity
- Route to appropriate agent discipline
- Fallback to default when uncertain

### 4. Skill Auto-Evolution
```
pattern → detect → package → skill → MCP tool
```
- Detect repeated workflow patterns
- Package into versioned, reusable skills
- Expose as MCP tools for other agents

---

## ETCLOVG Coverage

| Layer | Component | Status |
|-------|-----------|--------|
| **T** | MCP Tool Layer | ✅ 5 tools |
| **C** | Ebbinghaus Memory | ✅ Forgetting curve |
| **L** | DAG + FSM Engine | ✅ Core |
| **O** | Trace System | ✅ Nested spans |
| **V** | Quality Scorer | ✅ 4-dimension scoring |
| **E** | Execution | 🔜 Planned |
| **G** | Governance | 🔜 Planned |

**Coverage: 5/7 layers (71%)**

---

## Quick Start

```bash
git clone https://github.com/SonicBotMan/SoloFlow.git
cd SoloFlow
# Pure Python, zero dependencies
```

### Create and Execute a Workflow

```python
import asyncio
from pathlib import Path
from hermes_plugin.store.sqlite_store import SQLiteStore
from hermes_plugin.services.workflow_service import WorkflowService
from hermes_plugin.services.scheduler import Scheduler

async def main():
    # Initialize
    store = SQLiteStore(Path("soloflow.db"))
    store.initialize()
    ws = WorkflowService(store)
    ws.set_scheduler(Scheduler(store, ws))

    # Create workflow
    wf = await ws.create_workflow(
        name="research-report",
        description="行业调研报告",
        steps=[
            {"id": "topic", "name": "选题", "discipline": "deep", "prompt": "确定研究方向"},
            {"id": "search_a", "name": "学术搜索", "discipline": "quick", "prompt": "搜索学术资料"},
            {"id": "search_b", "name": "行业搜索", "discipline": "quick", "prompt": "搜索行业报告"},
            {"id": "outline", "name": "大纲", "discipline": "deep", "prompt": "整理大纲"},
            {"id": "write", "name": "撰写", "discipline": "deep", "prompt": "写正文"},
            {"id": "review", "name": "审校", "discipline": "quick", "prompt": "审校发布"},
        ],
        edges=[
            ("topic", "search_a"), ("topic", "search_b"),
            ("search_a", "outline"), ("search_b", "outline"),
            ("outline", "write"), ("write", "review"),
        ],
    )

    # Execute
    await ws.start_workflow(wf["id"])
    
    # Check status
    status = await ws.get_status(wf["id"])
    print(f"State: {status['state']}, Progress: {status['progress']}")

asyncio.run(main())
```

---

## MCP Tools

SoloFlow exposes 5 MCP tools for integration with AI agents:

| Tool | Description |
|------|-------------|
| `soloflow_create` | Create a new workflow with steps and DAG edges |
| `soloflow_run` | Execute a workflow with DAG parallelism |
| `soloflow_status` | Get workflow status and progress |
| `soloflow_list` | List workflows with optional state filter |
| `soloflow_cancel` | Cancel a running workflow |

### Usage with Hermes Agent

```yaml
# config.yaml
tools:
  mcp:
    servers:
      soloflow:
        command: python
        args: ["-m", "mcp.server"]
```

---

## Trace System

Track every workflow execution with nested spans:

```python
from trace.collector import TraceCollector
from trace.exporter import TraceExporter
from trace.span import SpanStatus, TokenUsage

collector = TraceCollector(db_path=Path("traces.db"))
exporter = TraceExporter(collector)

# Start trace
span = collector.start_span(operation="workflow", node_name="research")

# Track steps
step = collector.start_span(
    operation="step", 
    node_name="search",
    parent_id=span.span_id,
    trace_id=span.trace_id,
)

# Finish with token usage
collector.finish_span(
    step.span_id,
    status=SpanStatus.SUCCESS,
    token_usage=TokenUsage(prompt_tokens=100, completion_tokens=200),
)

# Export
print(exporter.format_trace_tree(span.trace_id))
```

---

## Ebbinghaus Memory

Memory system with automatic consolidation:

```python
from memory.forgetting.consolidation import MemoryConsolidator

consolidator = MemoryConsolidator(db_path=Path("memory.db"))

# Add memories
await consolidator.add_memory(
    key="user_preference",
    content={"theme": "dark"},
    tier="episodic",
    stability=1.0,
)

# Access increases stability
entry = await consolidator.get_memory("user_preference")

# Run consolidation cycle
stats = await consolidator.consolidate_all()
```

---

## Project Structure

```
SoloFlow/
├── hermes-plugin/          # Core engine
│   ├── core/               # DAG + FSM
│   ├── services/           # WorkflowService + Scheduler
│   ├── memory/             # Three-tier memory
│   └── store/              # SQLite persistence
├── mcp/                    # MCP Tool Layer
├── trace/                  # Observability
├── memory/forgetting/      # Ebbinghaus forgetting curve
├── routing/                # Discipline-aware routing
├── evolution/              # Skill auto-evolution
├── cli/                    # CLI tools
└── tests/                  # Test suite (64 tests)
```

---

## Testing

```bash
# Run all tests
python -m pytest tests/ -v

# Run specific module
python -m pytest tests/mcp/ -v
python -m pytest tests/trace/ -v
python -m pytest tests/memory/ -v
python -m pytest tests/routing/ -v
python -m pytest tests/evolution/ -v

# Run end-to-end test
python -m pytest tests/e2e/ -v
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## License

MIT License - see [LICENSE](./LICENSE)

---

## Acknowledgments

- Inspired by LangGraph, AutoGen, and the Agent Harness Engineering research
- Built with ❤️ for the AI Agent community

---

## Recent Additions

### Human-in-the-Loop (NEW)

Approval system for sensitive workflow steps:

```python
from hermes_plugin.human import HumanApprovalManager

manager = HumanApprovalManager()

# Create approval request
request = manager.create_request(
    workflow_id="wf_123",
    step_id="review",
    prompt="Please review and approve",
)

# Wait for approval
result = await manager.wait_for_approval(request.request_id)
```

### Workflow Visualization (NEW)

Generate Mermaid diagrams from workflows:

```python
from hermes_plugin.visualization import WorkflowVisualizer

visualizer = WorkflowVisualizer()

# Generate Mermaid diagram
mermaid = visualizer.to_mermaid(steps, edges)

# Generate HTML with embedded diagram
html = visualizer.to_html(steps, edges, title="My Workflow")
```


### Governance Layer (NEW)

Complete ETCLOVG framework coverage with permissions, audit, and policies:

```python
from hermes_plugin.governance import GovernanceManager, Permission

governance = GovernanceManager()

# Grant permissions
governance.grant_permission("user_1", Permission.EXECUTE)

# Check permissions
has_perm = governance.check_permission("user_1", Permission.EXECUTE)

# Log audit events
governance.log_audit(
    action=AuditAction.WORKFLOW_STARTED,
    workflow_id="wf_123",
    user_id="user_1",
)
```

