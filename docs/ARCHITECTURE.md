# SoloFlow Architecture

## Overview

SoloFlow is a cognitive workflow engine for AI agents, designed to turn chaotic multi-step tasks into structured, observable, retryable workflows.

## Design Principles

1. **Reliability First** — DAG + FSM hybrid for deterministic execution
2. **Cognitive Memory** — Ebbinghaus forgetting curve for natural memory decay
3. **Discipline-Aware** — Route tasks to appropriate execution strategies
4. **Self-Improving** — Automatic skill detection and packaging
5. **Observable** — Full trace system for debugging and optimization

## ETCLOVG Framework

SoloFlow follows the ETCLOVG framework for Agent Harness Engineering:

```
┌─────────────────────────────────────────────┐
│           MCP TOOL LAYER (T)                │
│  soloflow_run / status / list / cancel      │
├─────────────────────────────────────────────┤
│         ORCHESTRATION ENGINE (L)            │
│  DAG Builder + FSM Controller               │
├─────────────────────────────────────────────┤
│       MEMORY & INTELLIGENCE (C)             │
│  Cognitive Memory + Skill Evolution         │
├─────────────────────────────────────────────┤
│       OBSERVABILITY (O)                     │
│  Trace System + Token Tracking              │
├─────────────────────────────────────────────┤
│       VERIFICATION (V)                      │
│  Quality Scorer + Pattern Detection         │
└─────────────────────────────────────────────┘
```

## Core Components

### 1. DAG Engine

Kahn's algorithm for topological sorting with cycle detection.

```
Steps: [A, B, C, D]
Edges: [(A,B), (A,C), (B,D), (C,D)]

Layers:
  Layer 0: [A]
  Layer 1: [B, C]  ← Can run in parallel
  Layer 2: [D]
```

**Key Features:**
- Topological sort
- Cycle detection
- Layer computation
- Ready step identification

### 2. FSM Controller

Strict state machine for workflow and step transitions.

```
Workflow States:
  draft → active → running → completed / failed / cancelled

Step States:
  pending → ready → running → completed / failed (→ ready retry)
```

**Key Features:**
- Validated transitions
- Terminal state enforcement
- Error handling

### 3. Three-Tier Memory

```
Working Memory (LRU)
  ↓
Episodic Memory (SQLite + FTS5)
  ↓
Semantic Memory (Pattern Extraction)
```

**Working Memory:**
- Fast LRU cache
- Current task context
- Auto-eviction on overflow

**Episodic Memory:**
- SQLite persistence
- FTS5 full-text search
- Timestamped events

**Semantic Memory:**
- Pattern extraction from completed workflows
- Template storage
- Reusable knowledge

### 4. Ebbinghaus Forgetting Curve

```
R(t) = base × e^(-t / stability)

Where:
  R(t) = retention at time t
  base = initial retention (1.0)
  t = time elapsed
  stability = memory stability factor
```

**Memory Consolidation:**
- Each access increases stability
- High-frequency memories persist longer
- Low-retention memories expire automatically

### 5. Discipline Routing

Auto-classify tasks by complexity:

| Discipline | Response Time | Use Case |
|------------|---------------|----------|
| `quick` | ~2s | Simple tasks, summaries |
| `deep` | ~30s | Complex analysis, research |
| `visual` | ~30s | Image/UI generation |
| `ultrabrain` | ~120s | Multi-agent coordination |

### 6. Trace System

Nested span tracking for observability:

```
Workflow Span
├── Step Span 1
│   └── LLM Call Span
├── Step Span 2
│   └── LLM Call Span
└── Step Span 3
    └── LLM Call Span
```

**Features:**
- Nested spans
- Token usage tracking
- Cost calculation
- JSON export
- Tree visualization

### 7. Skill Evolution

Automatic pattern detection and packaging:

```
Workflow Executions
      ↓
Pattern Detection (≥3 occurrences)
      ↓
Skill Packaging (versioned)
      ↓
MCP Tool Export
      ↓
Quality Scoring (4 dimensions)
```

## Data Flow

```
1. User creates workflow
   ↓
2. DAG engine computes layers
   ↓
3. FSM sets initial state (draft → running)
   ↓
4. Scheduler executes ready steps in parallel
   ↓
5. Steps report results (success/failure)
   ↓
6. DAG computes next ready steps
   ↓
7. Repeat until all steps complete
   ↓
8. Pattern detector records execution
   ↓
9. Skill packager creates reusable skills
```

## Storage

### SQLite Schema

**Workflows Table:**
- id, name, description, state
- config, created_at, updated_at

**Steps Table:**
- id, workflow_id, name, discipline
- state, result, error, layer

**Edges Table:**
- workflow_id, from_id, to_id

**Episodic Memory Table:**
- id, workflow_id, event_type, data_json, timestamp

**Evolved Templates Table:**
- id, name, description, template_json, source_count

## Extension Points

### Custom Executors

```python
async def my_executor(step: dict) -> str:
    # Your custom logic here
    return result

scheduler = Scheduler(store, ws)
await scheduler.execute_workflow(workflow_id, executor=my_executor)
```

### Custom Memory Providers

```python
class CustomMemoryProvider:
    async def record(self, event): ...
    async def search(self, query): ...
```

### Custom Classifiers

```python
classifier = TaskClassifier(custom_patterns={
    "my_pattern": [r"\bmy_keyword\b"],
})
```

## Performance Considerations

- **Parallelism:** DAG enables parallel execution of independent steps
- **Memory:** LRU cache for working memory, SQLite for persistence
- **Token Efficiency:** Discipline routing minimizes unnecessary LLM calls
- **Caching:** Pattern detection enables skill reuse

## Security Considerations

- SQLite WAL mode for concurrent access
- Input validation on all state transitions
- No external dependencies (pure Python)
- Sandboxed execution (planned for E layer)

## Future Directions

- **E Layer:** Execution sandboxing
- **G Layer:** Governance and audit
- **Distributed:** Multi-node execution
- **Streaming:** Real-time workflow updates
