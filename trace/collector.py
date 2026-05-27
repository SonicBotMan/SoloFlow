"""Trace collector for SoloFlow.

Collects and stores spans during workflow execution.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional

from .span import Span, SpanStatus, TokenUsage


class TraceCollector:
    """Collects and stores execution traces.
    
    Usage:
        collector = TraceCollector(db_path=Path("traces.db"))
        
        # Start a trace
        span = collector.start_span(operation="workflow", node_name="research")
        
        # Do work...
        
        # Finish the trace
        collector.finish_span(span.span_id, status=SpanStatus.SUCCESS)
    """
    
    def __init__(self, db_path: Path = Path("traces.db")) -> None:
        self._db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None
        self._lock = threading.Lock()
        self._active_spans: dict[str, Span] = {}
        self._initialize_db()
    
    def _initialize_db(self) -> None:
        """Initialize the SQLite database for traces."""
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS spans (
                span_id TEXT PRIMARY KEY,
                parent_id TEXT,
                trace_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                node_name TEXT NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL,
                duration_ms REAL,
                input_json TEXT,
                output_json TEXT,
                prompt_tokens INTEGER DEFAULT 0,
                completion_tokens INTEGER DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0,
                status TEXT NOT NULL,
                error_message TEXT,
                metadata_json TEXT,
                created_at REAL NOT NULL
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id)
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_spans_parent_id ON spans(parent_id)
        """)
        self._conn.commit()
    
    def start_span(
        self,
        operation: str,
        node_name: str = "",
        parent_id: str | None = None,
        trace_id: str | None = None,
        input_data: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Span:
        """Start a new span.
        
        Args:
            operation: Type of operation (e.g., "workflow", "step", "llm_call")
            node_name: Name of the node being executed
            parent_id: Parent span ID (for nested spans)
            trace_id: Trace ID (for grouping related spans)
            input_data: Input data for this span
            metadata: Additional metadata
            
        Returns:
            The created Span
        """
        span = Span(
            operation=operation,
            node_name=node_name,
            parent_id=parent_id,
            trace_id=trace_id or "",
            input_data=input_data or {},
            metadata=metadata or {},
        )
        
        # If no trace_id provided, use the span_id as trace_id
        if not span.trace_id:
            span.trace_id = span.span_id
        
        with self._lock:
            self._active_spans[span.span_id] = span
        
        return span
    
    def finish_span(
        self,
        span_id: str,
        status: SpanStatus = SpanStatus.SUCCESS,
        output_data: dict[str, Any] | None = None,
        error_message: str | None = None,
        token_usage: TokenUsage | None = None,
    ) -> Optional[Span]:
        """Finish a span.
        
        Args:
            span_id: ID of the span to finish
            status: Final status
            output_data: Output data
            error_message: Error message (if failed)
            token_usage: Token usage (for LLM calls)
            
        Returns:
            The finished Span, or None if not found
        """
        with self._lock:
            span = self._active_spans.pop(span_id, None)
        
        if span is None:
            return None
        
        span.finish(
            status=status,
            output_data=output_data,
            error_message=error_message,
        )
        
        if token_usage is not None:
            span.token_usage = token_usage
        
        # Persist to database
        self._persist_span(span)
        
        return span
    
    def _persist_span(self, span: Span) -> None:
        """Persist a span to the database."""
        with self._lock:
            self._conn.execute(
                """
                INSERT OR REPLACE INTO spans (
                    span_id, parent_id, trace_id, operation, node_name,
                    start_time, end_time, duration_ms,
                    input_json, output_json,
                    prompt_tokens, completion_tokens, total_tokens, cost_usd,
                    status, error_message, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    span.span_id,
                    span.parent_id,
                    span.trace_id,
                    span.operation,
                    span.node_name,
                    span.start_time,
                    span.end_time,
                    span.duration_ms,
                    json.dumps(span.input_data),
                    json.dumps(span.output_data),
                    span.token_usage.prompt_tokens,
                    span.token_usage.completion_tokens,
                    span.token_usage.total_tokens,
                    span.token_usage.cost_usd,
                    span.status.value,
                    span.error_message,
                    json.dumps(span.metadata),
                    time.time(),
                ),
            )
            self._conn.commit()
    
    def get_trace(self, trace_id: str) -> list[dict[str, Any]]:
        """Get all spans for a trace.
        
        Args:
            trace_id: Trace ID
            
        Returns:
            List of span dictionaries
        """
        cursor = self._conn.execute(
            """
            SELECT * FROM spans
            WHERE trace_id = ?
            ORDER BY start_time ASC
            """,
            (trace_id,),
        )
        
        columns = [desc[0] for desc in cursor.description]
        spans = []
        for row in cursor.fetchall():
            span_dict = dict(zip(columns, row))
            # Parse JSON fields
            span_dict["input_data"] = json.loads(span_dict.pop("input_json") or "{}")
            span_dict["output_data"] = json.loads(span_dict.pop("output_json") or "{}")
            span_dict["metadata"] = json.loads(span_dict.pop("metadata_json") or "{}")
            spans.append(span_dict)
        
        return spans
    
    def get_recent_traces(self, limit: int = 10) -> list[dict[str, Any]]:
        """Get recent traces.
        
        Args:
            limit: Maximum number of traces to return
            
        Returns:
            List of trace summaries
        """
        cursor = self._conn.execute(
            """
            SELECT trace_id, 
                   MIN(start_time) as start_time,
                   MAX(end_time) as end_time,
                   COUNT(*) as span_count,
                   SUM(total_tokens) as total_tokens,
                   SUM(cost_usd) as total_cost,
                   GROUP_CONCAT(DISTINCT status) as statuses
            FROM spans
            GROUP BY trace_id
            ORDER BY start_time DESC
            LIMIT ?
            """,
            (limit,),
        )
        
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    def get_span_stats(self, trace_id: str) -> dict[str, Any]:
        """Get statistics for a trace.
        
        Args:
            trace_id: Trace ID
            
        Returns:
            Statistics dictionary
        """
        cursor = self._conn.execute(
            """
            SELECT 
                COUNT(*) as total_spans,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
                SUM(duration_ms) as total_duration_ms,
                SUM(prompt_tokens) as total_prompt_tokens,
                SUM(completion_tokens) as total_completion_tokens,
                SUM(total_tokens) as total_tokens,
                SUM(cost_usd) as total_cost
            FROM spans
            WHERE trace_id = ?
            """,
            (trace_id,),
        )
        
        row = cursor.fetchone()
        if row is None:
            return {}
        
        columns = [desc[0] for desc in cursor.description]
        return dict(zip(columns, row))
    
    def close(self) -> None:
        """Close the collector."""
        if self._conn:
            self._conn.close()
