"""Trace exporter for SoloFlow.

Exports traces to various formats (JSON, OpenTelemetry).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .collector import TraceCollector


class TraceExporter:
    """Exports traces to various formats."""
    
    def __init__(self, collector: TraceCollector) -> None:
        self._collector = collector
    
    def export_json(self, trace_id: str, output_path: Path) -> Path:
        """Export a trace to JSON format.
        
        Args:
            trace_id: Trace ID to export
            output_path: Path to write the JSON file
            
        Returns:
            Path to the exported file
        """
        spans = self._collector.get_trace(trace_id)
        stats = self._collector.get_span_stats(trace_id)
        
        export = {
            "trace_id": trace_id,
            "stats": stats,
            "spans": spans,
            "exported_at": __import__("time").time(),
        }
        
        output_path.write_text(json.dumps(export, indent=2, default=str))
        return output_path
    
    def export_summary(self, output_path: Path, limit: int = 20) -> Path:
        """Export a summary of recent traces.
        
        Args:
            output_path: Path to write the summary
            limit: Maximum number of traces to include
            
        Returns:
            Path to the exported file
        """
        traces = self._collector.get_recent_traces(limit)
        
        export = {
            "traces": traces,
            "count": len(traces),
            "exported_at": __import__("time").time(),
        }
        
        output_path.write_text(json.dumps(export, indent=2, default=str))
        return output_path
    
    def format_trace_tree(self, trace_id: str) -> str:
        """Format a trace as a tree string.
        
        Args:
            trace_id: Trace ID to format
            
        Returns:
            Formatted tree string
        """
        spans = self._collector.get_trace(trace_id)
        if not spans:
            return f"No spans found for trace {trace_id}"
        
        # Build parent-child relationships
        children: dict[str | None, list[dict]] = {}
        for span in spans:
            parent_id = span.get("parent_id")
            if parent_id not in children:
                children[parent_id] = []
            children[parent_id].append(span)
        
        # Find root spans (no parent)
        roots = children.get(None, [])
        
        lines = [f"Trace: {trace_id}"]
        lines.append("=" * 60)
        
        def format_span(span: dict, indent: int = 0) -> None:
            prefix = "  " * indent
            status_icon = "✓" if span["status"] == "success" else "✗"
            duration = span.get("duration_ms", 0)
            tokens = span.get("total_tokens", 0)
            
            line = f"{prefix}{status_icon} {span['operation']}"
            if span.get("node_name"):
                line += f" [{span['node_name']}]"
            line += f" ({duration:.1f}ms"
            if tokens > 0:
                line += f", {tokens} tokens"
            line += ")"
            
            lines.append(line)
            
            # Add children
            for child in children.get(span["span_id"], []):
                format_span(child, indent + 1)
        
        for root in roots:
            format_span(root)
        
        # Add summary
        stats = self._collector.get_span_stats(trace_id)
        lines.append("-" * 60)
        lines.append(f"Total: {stats.get('total_spans', 0)} spans, "
                    f"{stats.get('total_duration_ms', 0):.1f}ms, "
                    f"{stats.get('total_tokens', 0)} tokens, "
                    f"${stats.get('total_cost', 0):.4f}")
        
        return "\n".join(lines)
