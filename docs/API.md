# SoloFlow API Reference

## Core Modules

### WorkflowService

The main service for managing workflow lifecycle.

```python
from hermes_plugin.services.workflow_service import WorkflowService

ws = WorkflowService(store)
```

#### Methods

##### `create_workflow(name, description, steps, edges, config=None)`

Create a new workflow with steps and DAG edges.

**Parameters:**
- `name` (str): Workflow name
- `description` (str): Workflow description
- `steps` (list[dict]): List of step definitions
- `edges` (list[tuple]): List of (from_id, to_id) dependency edges
- `config` (dict, optional): Additional configuration

**Returns:** dict - Created workflow with id, state, steps, edges

**Example:**
```python
workflow = await ws.create_workflow(
    name="research",
    description="Research workflow",
    steps=[
        {"id": "search", "name": "Search", "discipline": "quick", "prompt": "Search for info"},
        {"id": "analyze", "name": "Analyze", "discipline": "deep", "prompt": "Analyze results"},
    ],
    edges=[("search", "analyze")],
)
```

##### `start_workflow(workflow_id)`

Start executing a workflow. Root steps (no dependencies) become ready.

**Parameters:**
- `workflow_id` (str): UUID of the workflow to start

**Returns:** dict - Updated workflow with state='running'

##### `advance_step(workflow_id, step_id, result=None, error=None)`

Report the result of a step execution.

**Parameters:**
- `workflow_id` (str): Workflow UUID
- `step_id` (str): Step ID to advance
- `result` (str, optional): Step result on success
- `error` (str, optional): Error message on failure

**Returns:** dict - Updated workflow status

##### `get_status(workflow_id)`

Get detailed workflow status including all steps and progress.

**Parameters:**
- `workflow_id` (str): Workflow UUID

**Returns:** dict - Workflow status with steps, progress, state

##### `list_workflows(limit=50, state_filter=None)`

List workflows with optional state filter.

**Parameters:**
- `limit` (int): Maximum results (default 50)
- `state_filter` (str, optional): Filter by state (draft/active/running/completed/failed/cancelled)

**Returns:** list[dict] - List of workflows

##### `cancel_workflow(workflow_id)`

Cancel a running or active workflow.

**Parameters:**
- `workflow_id` (str): Workflow UUID

**Returns:** dict - Cancelled workflow

---

### Scheduler

Async scheduler for parallel step execution.

```python
from hermes_plugin.services.scheduler import Scheduler

scheduler = Scheduler(store, ws, config={"max_parallelism": 4})
```

#### Methods

##### `run_workflow(workflow_id)`

Execute a workflow to completion with automatic parallel scheduling.

**Parameters:**
- `workflow_id` (str): Workflow UUID

##### `cancel_step(workflow_id, step_id)`

Cancel a specific running step.

**Parameters:**
- `workflow_id` (str): Workflow UUID
- `step_id` (str): Step ID to cancel

**Returns:** bool - True if cancelled

##### `cancel_all(workflow_id)`

Cancel all running steps for a workflow.

**Parameters:**
- `workflow_id` (str): Workflow UUID

**Returns:** int - Number of cancelled tasks

---

## MCP Tools

### SoloFlowMCPServer

MCP server for exposing workflow operations as tools.

```python
from mcp.server import SoloFlowMCPServer

server = SoloFlowMCPServer(store_path=Path("soloflow.db"))
await server.start()
```

#### Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `soloflow_create` | Create a new workflow | name, description, steps, edges |
| `soloflow_run` | Execute a workflow | workflow_id, executor |
| `soloflow_status` | Get workflow status | workflow_id |
| `soloflow_list` | List workflows | limit, state |
| `soloflow_cancel` | Cancel a workflow | workflow_id |

---

## Trace System

### TraceCollector

Collects and stores execution traces.

```python
from trace.collector import TraceCollector

collector = TraceCollector(db_path=Path("traces.db"))
```

#### Methods

##### `start_span(operation, node_name, parent_id, trace_id, input_data, metadata)`

Start a new trace span.

**Returns:** Span - Created span

##### `finish_span(span_id, status, output_data, error_message, token_usage)`

Finish a span.

**Returns:** Span - Finished span

##### `get_trace(trace_id)`

Get all spans for a trace.

**Returns:** list[dict] - List of spans

##### `get_span_stats(trace_id)`

Get statistics for a trace.

**Returns:** dict - Statistics (total_spans, success_count, total_tokens, etc.)

### TraceExporter

Exports traces to various formats.

```python
from trace.exporter import TraceExporter

exporter = TraceExporter(collector)
```

#### Methods

##### `export_json(trace_id, output_path)`

Export trace to JSON.

##### `format_trace_tree(trace_id)`

Format trace as a tree string.

---

## Memory System

### ForgettingCurve

Ebbinghaus forgetting curve implementation.

```python
from memory.forgetting.curve import ForgettingCurve

curve = ForgettingCurve()
```

#### Methods

##### `retention(time_elapsed, stability, base_retention)`

Calculate retention at a given time.

**Formula:** R(t) = base × e^(-t / stability)

##### `consolidate(entry)`

Consolidate a memory (increase stability).

##### `time_until_forget(stability, base_retention, target_retention)`

Calculate time until retention drops to target.

### MemoryConsolidator

Automatic memory consolidation system.

```python
from memory.forgetting.consolidation import MemoryConsolidator

consolidator = MemoryConsolidator(db_path=Path("memory.db"))
```

#### Methods

##### `add_memory(key, content, tier, stability)`

Add a new memory.

##### `get_memory(key)`

Get a memory and record access.

##### `search_memories(query, tier, limit)`

Search memories by content.

##### `consolidate_all()`

Run consolidation cycle on all memories.

---

## Routing System

### TaskClassifier

Classify tasks by complexity.

```python
from routing.classifier import TaskClassifier

classifier = TaskClassifier()
```

#### Methods

##### `classify(task_description)`

Classify a task and determine discipline.

**Returns:** ClassificationResult with discipline, confidence, reasoning

##### `extract_features(task_description)`

Extract features from task description.

**Returns:** dict - Feature flags

### DisciplineRouter

Route tasks to appropriate executors.

```python
from routing.router import DisciplineRouter, Executor

router = DisciplineRouter(classifier=classifier)
```

#### Methods

##### `register_executor(executor)`

Register an executor for a discipline.

##### `route(task)`

Route a task to an executor.

**Returns:** RoutingResult with classification, executor, task

##### `route_and_execute(task)`

Route and execute a task.

**Returns:** Any - Execution result

---

## Evolution System

### PatternDetector

Detect repeated workflow patterns.

```python
from evolution.pattern_detector import PatternDetector

detector = PatternDetector(db_path=Path("patterns.db"))
```

#### Methods

##### `record_execution(workflow, success, duration_ms)`

Record a workflow execution.

##### `detect_patterns(min_occurrences, min_success_rate)`

Detect repeated patterns.

**Returns:** list[Pattern] - Detected patterns

### SkillPackager

Package patterns into versioned skills.

```python
from evolution.skill_packager import SkillPackager

packager = SkillPackager(db_path=Path("skills.db"))
```

#### Methods

##### `package_pattern(pattern)`

Package a pattern into a skill.

**Returns:** Skill - Created skill with MCP tool definition

### QualityScorer

Evaluate skill quality.

```python
from evolution.quality_scorer import QualityScorer

scorer = QualityScorer()
```

#### Methods

##### `score_skill(skill, pattern)`

Score a skill across 4 dimensions.

**Returns:** QualityScore with overall, reliability, efficiency, maturity, reusability scores

##### `rank_skills(skills, patterns)`

Rank skills by quality.

**Returns:** list[tuple[Skill, QualityScore]] - Ranked skills

---

## Data Models

### StepState

```python
class StepState(str, Enum):
    PENDING = "pending"
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
```

### WorkflowState

```python
class WorkflowState(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
```

### Discipline

```python
class Discipline(str, Enum):
    QUICK = "quick"        # ~2s
    DEEP = "deep"          # ~30s
    VISUAL = "visual"      # ~30s
    ULTRABRAIN = "ultrabrain"  # ~120s
```
