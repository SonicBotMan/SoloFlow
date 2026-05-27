"""Tests for SoloFlow Trace System."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from trace.span import Span, TokenUsage, SpanStatus
from trace.collector import TraceCollector
from trace.exporter import TraceExporter


@pytest.fixture
def db_path(tmp_path):
    """Create a temporary database path."""
    return tmp_path / "test_traces.db"


@pytest.fixture
def collector(db_path):
    """Create a test trace collector."""
    return TraceCollector(db_path=db_path)


@pytest.fixture
def exporter(collector):
    """Create a test trace exporter."""
    return TraceExporter(collector)


class TestSpan:
    """Tests for Span."""
    
    def test_span_creation(self):
        """Test creating a span."""
        span = Span(operation="test", node_name="node1")
        assert span.operation == "test"
        assert span.node_name == "node1"
        assert span.span_id is not None
        assert span.is_finished is False
    
    def test_span_finish(self):
        """Test finishing a span."""
        span = Span(operation="test")
        span.finish(status=SpanStatus.SUCCESS, output_data={"result": "ok"})
        
        assert span.is_finished is True
        assert span.status == SpanStatus.SUCCESS
        assert span.output_data == {"result": "ok"}
        assert span.duration_ms >= 0
    
    def test_span_to_dict(self):
        """Test converting span to dict."""
        span = Span(operation="test", node_name="node1")
        d = span.to_dict()
        
        assert d["operation"] == "test"
        assert d["node_name"] == "node1"
        assert "span_id" in d
        assert "duration_ms" in d


class TestTokenUsage:
    """Tests for TokenUsage."""
    
    def test_token_usage_add(self):
        """Test adding token usages."""
        t1 = TokenUsage(prompt_tokens=10, completion_tokens=20, total_tokens=30, cost_usd=0.01)
        t2 = TokenUsage(prompt_tokens=5, completion_tokens=10, total_tokens=15, cost_usd=0.005)
        
        t3 = t1.add(t2)
        assert t3.prompt_tokens == 15
        assert t3.completion_tokens == 30
        assert t3.total_tokens == 45
        assert t3.cost_usd == 0.015


class TestTraceCollector:
    """Tests for TraceCollector."""
    
    def test_start_span(self, collector):
        """Test starting a span."""
        span = collector.start_span(operation="test", node_name="node1")
        
        assert span.operation == "test"
        assert span.node_name == "node1"
        assert span.trace_id == span.span_id  # Auto-generated
    
    def test_finish_span(self, collector):
        """Test finishing a span."""
        span = collector.start_span(operation="test")
        finished = collector.finish_span(
            span.span_id,
            status=SpanStatus.SUCCESS,
            output_data={"result": "ok"},
        )
        
        assert finished is not None
        assert finished.status == SpanStatus.SUCCESS
        assert finished.is_finished is True
    
    def test_get_trace(self, collector):
        """Test getting a trace."""
        # Create a trace with multiple spans
        root = collector.start_span(operation="workflow", node_name="root")
        child1 = collector.start_span(
            operation="step",
            node_name="step1",
            parent_id=root.span_id,
            trace_id=root.trace_id,
        )
        child2 = collector.start_span(
            operation="step",
            node_name="step2",
            parent_id=root.span_id,
            trace_id=root.trace_id,
        )
        
        collector.finish_span(child1.span_id, status=SpanStatus.SUCCESS)
        collector.finish_span(child2.span_id, status=SpanStatus.SUCCESS)
        collector.finish_span(root.span_id, status=SpanStatus.SUCCESS)
        
        # Get the trace
        spans = collector.get_trace(root.trace_id)
        assert len(spans) == 3
    
    def test_get_recent_traces(self, collector):
        """Test getting recent traces."""
        # Create multiple traces
        for i in range(3):
            span = collector.start_span(operation=f"trace_{i}")
            collector.finish_span(span.span_id)
        
        traces = collector.get_recent_traces(limit=5)
        assert len(traces) == 3
    
    def test_get_span_stats(self, collector):
        """Test getting span stats."""
        span = collector.start_span(operation="test")
        collector.finish_span(
            span.span_id,
            status=SpanStatus.SUCCESS,
        )
        
        stats = collector.get_span_stats(span.trace_id)
        assert stats["total_spans"] == 1
        assert stats["success_count"] == 1


class TestTraceExporter:
    """Tests for TraceExporter."""
    
    def test_export_json(self, exporter, collector, tmp_path):
        """Test exporting trace to JSON."""
        span = collector.start_span(operation="test")
        collector.finish_span(span.span_id, status=SpanStatus.SUCCESS)
        
        output_path = tmp_path / "trace.json"
        exporter.export_json(span.trace_id, output_path)
        
        assert output_path.exists()
        data = json.loads(output_path.read_text())
        assert "trace_id" in data
        assert "spans" in data
    
    def test_format_trace_tree(self, exporter, collector):
        """Test formatting trace as tree."""
        root = collector.start_span(operation="workflow", node_name="root")
        child = collector.start_span(
            operation="step",
            node_name="step1",
            parent_id=root.span_id,
            trace_id=root.trace_id,
        )
        
        collector.finish_span(child.span_id, status=SpanStatus.SUCCESS)
        collector.finish_span(root.span_id, status=SpanStatus.SUCCESS)
        
        tree = exporter.format_trace_tree(root.trace_id)
        assert "workflow" in tree
        assert "step" in tree


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
