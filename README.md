# SoloFlow ⚡

### The Brain Behind AI Workflow Orchestration

**Turn chaotic multi-step AI tasks into structured, observable, retryable workflows — with cognitive memory, discipline-aware routing, and automatic skill evolution.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-68%20passing-brightgreen.svg)](./tests)
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
| **No Learning** — repeated patterns stay manual | **Skill Evolution** — observe → detect → package → install |

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
observe → fingerprint → detect → package → install
```

- **Passive observation** via `hermes.on("tool_call")` event hooks
- **Multi-step workflow aggregation** — consecutive tool calls grouped automatically
- **Rich step descriptions** — extracts key args into human-readable steps
- **4-dimension quality scoring** — reliability, efficiency, maturity, reusability
- **Auto-generate** SKILL.md + plugin.py and install to `~/.hermes/skills/`

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
    store = SQLiteStore(Path("soloflow.db"))
    store.initialize()
    ws = WorkflowService(store)
    ws.set_scheduler(Scheduler(store, ws))

    # Create a DAG workflow with parallel branches
    wf = await ws.create_workflow(
        name="research-report",
        description="行业调研报告",
        steps=[
            {"id": "topic",    "name": "选题",   "discipline": "deep",  "prompt": "确定研究方向"},
            {"id": "search_a", "name": "学术搜索", "discipline": "quick", "prompt": "搜索学术资料"},
            {"id": "search_b", "name": "行业搜索", "discipline": "quick", "prompt": "搜索行业报告"},
            {"id": "outline",  "name": "大纲",   "discipline": "deep",  "prompt": "整理大纲"},
            {"id": "write",    "name": "撰写",   "discipline": "deep",  "prompt": "写正文"},
            {"id": "review",   "name": "审校",   "discipline": "quick", "prompt": "审校发布"},
        ],
        edges=[
            ("topic", "search_a"), ("topic", "search_b"),     # parallel branches
            ("search_a", "outline"), ("search_b", "outline"), # merge
            ("outline", "write"), ("write", "review"),
        ],
    )

    await ws.start_workflow(wf["id"])
    status = await ws.get_status(wf["id"])
    print(f"State: {status['state']}, Progress: {status['progress']}")

asyncio.run(main())
```

---

## SoloFlow Plugin — Automatic Skill Detection

SoloFlow includes a Hermes plugin that watches your workflows and automatically generates reusable skills.

### Install

```bash
bash install.sh
```

Or manually:

```bash
cp plugins/soloflow.py ~/.hermes/plugins/
cp -r skills/meta/soloflow ~/.hermes/skills/meta/
cp -r evolution ~/.hermes/plugins/
hermes skills reload
```

### How It Works

```
tool_call events → WorkflowBuilder (aggregate) → PatternDetector (fingerprint)
                                                       ↓
                                              Pattern (2+ occurrences)
                                                       ↓
                                              SkillPackager → SKILL.md + plugin.py
                                                       ↓
                                              QualityScorer → grade (A-F)
```

- **WorkflowBuilder** accumulates consecutive `tool_call` events into multi-step workflows (auto-flushes after 60s idle)
- **PatternDetector** fingerprints workflow structure (step names + edges + tools) and groups identical executions
- **SkillPackager** generates Hermes-native SKILL.md and plugin.py with rich step descriptions
- **QualityScorer** rates skills on 4 dimensions: reliability, efficiency, maturity, reusability

### Commands

| Command | Description |
|---------|-------------|
| `/soloflow begin [name]` | Mark workflow start |
| `/soloflow end [name]` | Mark workflow end, record pattern |
| `/soloflow propose` | Analyze session, propose top skill |
| `/soloflow generate [name]` | Generate and install a skill |
| `/soloflow list` | List detected patterns |
| `/soloflow skills` | List generated skills |
| `/soloflow status` | Show tracking status |
| `/soloflow queue` | Show pending proposals |
| `/soloflow clear` | Clear session log |

### Natural Language Triggers

Tell Hermes naturally — no commands needed:

- *"Save this as a skill"*
- *"Remember how to do this"*
- *"Turn this workflow into a reusable skill"*
- *"I always do this manually..."*
- *"Let's automate this"*

### DAG Engine Integration

When a workflow completes through the DAG engine, SoloFlow automatically feeds the execution data to PatternDetector:

```python
from hermes_plugin.services.workflow_service import WorkflowService

ws = WorkflowService(store)
ws.set_on_complete(lambda wf_id, success, duration, wf_def: ...)
# Completed workflows are automatically recorded for pattern detection
```

---

## MCP Tools

5 MCP tools for integration with AI agents:

| Tool | Description |
|------|-------------|
| `soloflow_create` | Create a new workflow with steps and DAG edges |
| `soloflow_run` | Execute a workflow with DAG parallelism |
| `soloflow_status` | Get workflow status and progress |
| `soloflow_list` | List workflows with optional state filter |
| `soloflow_cancel` | Cancel a running workflow |

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

span = collector.start_span(operation="workflow", node_name="research")
step = collector.start_span(
    operation="step", node_name="search",
    parent_id=span.span_id, trace_id=span.trace_id,
)
collector.finish_span(
    step.span_id,
    status=SpanStatus.SUCCESS,
    token_usage=TokenUsage(prompt_tokens=100, completion_tokens=200),
)
print(exporter.format_trace_tree(span.trace_id))
```

---

## Ebbinghaus Memory

Memory system with automatic consolidation:

```python
from memory.forgetting.consolidation import MemoryConsolidator

consolidator = MemoryConsolidator(db_path=Path("memory.db"))

await consolidator.add_memory(
    key="user_preference",
    content={"theme": "dark"},
    tier="episodic",
    stability=1.0,
)

entry = await consolidator.get_memory("user_preference")
stats = await consolidator.consolidate_all()
```

---

## Human-in-the-Loop

Approval system for sensitive workflow steps:

```python
from hermes_plugin.human import HumanApprovalManager

manager = HumanApprovalManager()
request = manager.create_request(
    workflow_id="wf_123",
    step_id="review",
    prompt="Please review and approve",
)
result = await manager.wait_for_approval(request.request_id)
```

---

## Governance

Role-based permissions, audit logging, and policy enforcement:

```python
from hermes_plugin.governance import GovernanceManager, Permission

governance = GovernanceManager()
governance.grant_permission("user_1", Permission.EXECUTE)
has_perm = governance.check_permission("user_1", Permission.EXECUTE)
governance.log_audit(
    action=AuditAction.WORKFLOW_STARTED,
    workflow_id="wf_123",
    user_id="user_1",
)
```

---

## Architecture

```
SoloFlow/
├── hermes-plugin/          # Core engine
│   ├── core/               # DAG + FSM
│   ├── services/           # WorkflowService + Scheduler
│   ├── memory/             # Three-tier memory
│   ├── store/              # SQLite persistence
│   ├── checkpoint/         # LangGraph: resumable execution
│   ├── dispatch/           # DeerFlow: sub-agent dispatch
│   ├── roles/              # CrewAI: permission boundaries
│   ├── output/             # PydanticAI: typed contracts
│   ├── boundary/           # Mastra: workflow vs agent control
│   ├── handoff/            # OpenAI Agents SDK: control transfer
│   ├── session/            # Google ADK: session + context budget
│   ├── hooks/              # Claude Agent SDK: lifecycle hooks
│   ├── pipeline/           # Haystack: component orchestration
│   ├── context/            # Microsoft: pluggable context providers
│   ├── governance/         # Permissions + audit
│   ├── human/              # Human approval
│   └── visualization/      # Mermaid diagrams
├── plugins/                # Hermes plugins
│   └── soloflow.py         # Skill detection plugin
├── skills/                 # Hermes skills
│   └── meta/soloflow/      # AI behavior guidance
├── evolution/              # Skill auto-evolution
│   ├── pattern_detector.py # Fingerprint + detect
│   ├── skill_packager.py   # Generate SKILL.md + plugin.py
│   └── quality_scorer.py   # 4-dimension scoring
├── mcp/                    # MCP Tool Layer
├── trace/                  # Observability
├── memory/forgetting/      # Ebbinghaus forgetting curve
├── routing/                # Discipline-aware routing
├── install.sh              # One-command installer
└── tests/                  # Test suite (68 tests)
```

---

## ETCLOVG Coverage

| Layer | Component | Status |
|-------|-----------|--------|
| **T** | MCP Tool Layer | ✅ 5 tools |
| **C** | Ebbinghaus Memory + Context Providers | ✅ Forgetting curve + pluggable context |
| **L** | DAG + FSM Engine + Pipeline | ✅ Core + Haystack-style components |
| **O** | Trace System + Hooks | ✅ Nested spans + lifecycle hooks |
| **V** | Quality Scorer + Output Validation | ✅ 4-dimension scoring + typed contracts |
| **E** | Execution + Dispatch + Handoff | ✅ Sub-agent dispatch + control transfer |
| **G** | Governance + Roles + Session + Boundary | ✅ Role permissions + session mgmt |

**Coverage: 7/7 layers (100%)**

---

## Testing

```bash
# Run all tests
python3.11 -m pytest tests/ -v

# Run specific module
python3.11 -m pytest tests/evolution/ -v
python3.11 -m pytest tests/hermes-plugin/ -v
python3.11 -m pytest tests/mcp/ -v
```

**68 tests, all passing.**

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
