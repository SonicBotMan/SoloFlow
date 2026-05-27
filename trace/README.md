# SoloFlow Trace System

Observability module for SoloFlow workflow execution.

## Overview

The trace system provides:
- **Span tracking**: Track individual operations (workflow, step, LLM calls)
- **Nested spans**: Parent-child relationships for hierarchical tracing
- **Token usage**: Track prompt/completion tokens and costs
- **SQLite storage**: Persistent trace storage with WAL mode
- **Export**: JSON export and tree visualization

## Quick Start

```python
from trace.collector import TraceCollector
from trace.exporter import TraceExporter
from trace.span import SpanStatus, TokenUsage

# Create collector
collector = TraceCollector(db_path=Path("traces.db"))

# Start a trace
span = collector.start_span(
    operation="workflow",
    node_name="research-report",
    input_data={"topic": "AI agents"},
)

# Do work...

# Finish the trace
collector.finish_span(
    span.span_id,
    status=SpanStatus.SUCCESS,
    output_data={"result": "Report generated"},
    token_usage=TokenUsage(
        prompt_tokens=100,
        completion_tokens=500,
        total_tokens=600,
        cost_usd=0.01,
    ),
)

# View traces
exporter = TraceExporter(collector)
print(exporter.format_trace_tree(span.trace_id))
```

## CLI Usage

```bash
# List recent traces
python cli/trace_cmd.py list --limit 10

# Show a trace (tree format)
python cli/trace_cmd.py show <trace_id>

# Show a trace (JSON format)
python cli/trace_cmd.py show <trace_id> --format json

# Export a trace
python cli/trace_cmd.py export <trace_id> --output trace.json
```

## Architecture

```
trace/
├── __init__.py      # Package exports
├── span.py          # Span and TokenUsage data structures
├── collector.py     # Trace collection and SQLite storage
└── exporter.py      # Export to JSON and tree formats

cli/
└── trace_cmd.py     # CLI commands for trace viewing

tests/trace/
└── test_trace.py    # Tests (11 passing)
```

## Integration with Workflow Service

To integrate tracing with SoloFlow's workflow execution:

```python
from trace.collector import TraceCollector
from trace.span import SpanStatus

collector = TraceCollector(db_path=Path("traces.db"))

# In WorkflowService.start_workflow()
trace_span = collector.start_span(
    operation="workflow",
    node_name=workflow["name"],
    input_data={"workflow_id": workflow["id"]},
)

# In Scheduler._run_step()
step_span = collector.start_span(
    operation="step",
    node_name=step["name"],
    parent_id=trace_span.span_id,
    trace_id=trace_span.trace_id,
)

# When step completes
collector.finish_span(
    step_span.span_id,
    status=SpanStatus.SUCCESS,
    output_data={"result": result},
)

# When workflow completes
collector.finish_span(
    trace_span.span_id,
    status=SpanStatus.SUCCESS,
)
```

## Testing

```bash
python -m pytest tests/trace/ -v
```

## License

MIT
