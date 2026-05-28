"""
SoloFlow Trace System Example

Demonstrates how to use the trace system for observability.
"""

import asyncio
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from trace.collector import TraceCollector
from trace.exporter import TraceExporter
from trace.span import SpanStatus, TokenUsage


async def main():
    print("=== SoloFlow Trace System Example ===\n")
    
    # Initialize trace collector
    db_path = Path("trace_example.db")
    collector = TraceCollector(db_path=db_path)
    exporter = TraceExporter(collector)
    
    # 1. Create a root span for the workflow
    print("1. Starting workflow trace...")
    root_span = collector.start_span(
        operation="workflow",
        node_name="content-pipeline",
        input_data={"topic": "AI Agent Architecture"},
    )
    print(f"   Root span: {root_span.span_id[:8]}...")
    
    # 2. Track individual steps
    steps = ["Research", "Outline", "Draft", "Review", "Publish"]
    for step_name in steps:
        print(f"\n2. Executing step: {step_name}")
        
        # Create step span
        step_span = collector.start_span(
            operation="step",
            node_name=step_name,
            parent_id=root_span.span_id,
            trace_id=root_span.trace_id,
        )
        
        # Simulate LLM call
        llm_span = collector.start_span(
            operation="llm_call",
            node_name=f"{step_name}_llm",
            parent_id=step_span.span_id,
            trace_id=root_span.trace_id,
        )
        
        # Finish LLM call with token usage
        collector.finish_span(
            llm_span.span_id,
            status=SpanStatus.SUCCESS,
            output_data={"response": f"Completed {step_name}"},
            token_usage=TokenUsage(
                prompt_tokens=100,
                completion_tokens=200,
                total_tokens=300,
                cost_usd=0.005,
            ),
        )
        
        # Finish step
        collector.finish_span(
            step_span.span_id,
            status=SpanStatus.SUCCESS,
            output_data={"result": f"{step_name} completed"},
        )
        
        print(f"   ✅ {step_name} completed")
    
    # 3. Finish workflow
    print("\n3. Finishing workflow...")
    collector.finish_span(
        root_span.span_id,
        status=SpanStatus.SUCCESS,
        output_data={"report": "AI Agent Architecture article"},
    )
    
    # 4. View trace statistics
    print("\n4. Trace Statistics:")
    stats = collector.get_span_stats(root_span.trace_id)
    print(f"   Total spans: {stats['total_spans']}")
    print(f"   Success count: {stats['success_count']}")
    print(f"   Total tokens: {stats['total_tokens']}")
    print(f"   Total cost: ${stats['total_cost']:.4f}")
    
    # 5. Export as JSON
    print("\n5. Exporting trace...")
    export_path = Path("trace_output.json")
    exporter.export_json(root_span.trace_id, export_path)
    print(f"   Exported to: {export_path}")
    
    # 6. View as tree
    print("\n6. Trace Tree:")
    tree = exporter.format_trace_tree(root_span.trace_id)
    print(tree)
    
    # Cleanup
    collector.close()
    db_path.unlink(missing_ok=True)
    export_path.unlink(missing_ok=True)
    
    print("\n=== Example Complete ===")


if __name__ == "__main__":
    asyncio.run(main())
