"""
SoloFlow — Pattern Detector

Detects repeated workflow patterns from execution history.
Uses fingerprinting to identify similar workflows.
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


@dataclass
class WorkflowExecution:
    """A single workflow execution record."""
    workflow_id: str
    workflow_name: str
    steps: list[dict[str, Any]]
    edges: list[tuple[str, str]]
    success: bool
    duration_ms: int
    tools_used: list[str]
    timestamp: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Pattern:
    """A detected workflow pattern."""
    pattern_id: str
    name: str
    description: str
    fingerprint: str
    steps: list[dict[str, Any]]
    edges: list[tuple[str, str]]
    occurrence_count: int
    success_count: int
    success_rate: float
    avg_duration_ms: float
    first_seen: float
    last_seen: float
    sources: list[str] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)
    category: str = "custom"
    tags: list[str] = field(default_factory=list)


class PatternDetector:
    """
    Detects repeated workflow patterns from execution history.
    
    Uses a two-phase approach:
    1. Fingerprinting: Hash workflow structure (steps + edges) to group similar executions
    2. Pattern extraction: When same fingerprint appears 2+ times, extract as a pattern
    """
    
    def __init__(self, db_path: Optional[Path] = None):
        self._executions: list[WorkflowExecution] = []
        self._fingerprints: dict[str, list[WorkflowExecution]] = {}
        self._patterns: dict[str, Pattern] = {}
        self._db_path = db_path
        
        if db_path and db_path.exists():
            self._load_from_db()
    
    def record_execution(
        self,
        workflow: dict[str, Any],
        success: bool = True,
        duration_ms: int = 0,
        tools_used: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> WorkflowExecution:
        """Record a workflow execution for pattern analysis."""
        execution = WorkflowExecution(
            workflow_id=workflow.get("id", str(uuid.uuid4())),
            workflow_name=workflow.get("name", "unnamed"),
            steps=workflow.get("steps", []),
            edges=[tuple(e) if isinstance(e, (list, tuple)) else (e["from"], e["to"]) 
                   for e in workflow.get("edges", [])],
            success=success,
            duration_ms=duration_ms,
            tools_used=tools_used or [],
            metadata=metadata or {},
        )
        
        self._executions.append(execution)
        
        # Compute fingerprint and group
        fingerprint = self._compute_fingerprint(execution)
        if fingerprint not in self._fingerprints:
            self._fingerprints[fingerprint] = []
        self._fingerprints[fingerprint].append(execution)
        
        # Persist if db_path set
        if self._db_path:
            self._save_execution(execution, fingerprint)
        
        return execution
    
    def _compute_fingerprint(self, execution: WorkflowExecution) -> str:
        """
        Compute a fingerprint for a workflow execution.
        
        Fingerprints capture the *structure* of the workflow:
        - Step names (normalized)
        - Edge connections (normalized)
        - Tool usage pattern
        
        This allows detection of "same workflow, different data" patterns.
        """
        # Normalize step names: lowercase, sorted
        step_names = sorted([
            s.get("name", s.get("id", "")).lower().strip()
            for s in execution.steps
        ])
        
        # Normalize edges: sorted pairs
        edge_pairs = sorted([
            (f.lower(), t.lower()) for f, t in execution.edges
        ])
        
        # Normalize tools
        tools = sorted([t.lower() for t in execution.tools_used])
        
        # Build fingerprint string
        fingerprint_data = {
            "steps": step_names,
            "edges": edge_pairs,
            "tools": tools,
        }
        
        fingerprint_str = json.dumps(fingerprint_data, sort_keys=True)
        return hashlib.sha256(fingerprint_str.encode()).hexdigest()[:16]
    
    def detect_patterns(self, min_occurrences: int = 2) -> list[Pattern]:
        """
        Detect patterns from execution history.
        
        A pattern is a workflow structure that has been executed 2+ times.
        Returns patterns sorted by occurrence count (most frequent first).
        """
        new_patterns = []
        
        for fingerprint, executions in self._fingerprints.items():
            if len(executions) < min_occurrences:
                continue
            
            # Check if pattern already exists and needs update
            if fingerprint in self._patterns:
                self._update_pattern(self._patterns[fingerprint], executions)
                continue
            
            # Extract pattern from executions
            pattern = self._extract_pattern(fingerprint, executions)
            self._patterns[fingerprint] = pattern
            new_patterns.append(pattern)
        
        # Return all patterns sorted by occurrence count
        all_patterns = list(self._patterns.values())
        all_patterns.sort(key=lambda p: p.occurrence_count, reverse=True)
        
        return all_patterns
    
    def _extract_pattern(self, fingerprint: str, executions: list[WorkflowExecution]) -> Pattern:
        """Extract a pattern from a group of similar executions."""
        # Use the most recent execution as reference
        reference = executions[-1]
        
        # Compute success rate
        success_count = sum(1 for e in executions if e.success)
        success_rate = success_count / len(executions) if executions else 0
        
        # Compute average duration
        durations = [e.duration_ms for e in executions if e.duration_ms > 0]
        avg_duration = sum(durations) / len(durations) if durations else 0
        
        # Collect all tools used
        all_tools = set()
        for e in executions:
            all_tools.update(e.tools_used)
        
        # Generate pattern name from workflow name
        name = reference.workflow_name or "unnamed-pattern"
        
        # Generate description from steps
        step_names = [s.get("name", s.get("id", "step")) for s in reference.steps]
        description = f"Workflow: {' → '.join(step_names)}"
        
        return Pattern(
            pattern_id=str(uuid.uuid4()),
            name=name,
            description=description,
            fingerprint=fingerprint,
            steps=reference.steps,
            edges=reference.edges,
            occurrence_count=len(executions),
            success_count=success_count,
            success_rate=success_rate,
            avg_duration_ms=avg_duration,
            first_seen=min(e.timestamp for e in executions),
            last_seen=max(e.timestamp for e in executions),
            sources=[e.workflow_id for e in executions],
            tools_used=list(all_tools),
        )
    
    def _update_pattern(self, pattern: Pattern, executions: list[WorkflowExecution]):
        """Update an existing pattern with new execution data."""
        pattern.occurrence_count = len(executions)
        pattern.success_count = sum(1 for e in executions if e.success)
        pattern.success_rate = pattern.success_count / pattern.occurrence_count
        pattern.last_seen = max(e.timestamp for e in executions)
        pattern.sources = [e.workflow_id for e in executions]
        
        # Update tools
        all_tools = set()
        for e in executions:
            all_tools.update(e.tools_used)
        pattern.tools_used = list(all_tools)
    
    def get_pattern_by_fingerprint(self, fingerprint: str) -> Optional[Pattern]:
        """Get a pattern by its fingerprint."""
        return self._patterns.get(fingerprint)
    
    def get_pattern_by_id(self, pattern_id: str) -> Optional[Pattern]:
        """Get a pattern by its ID."""
        for pattern in self._patterns.values():
            if pattern.pattern_id == pattern_id:
                return pattern
        return None
    
    def get_executions(self, fingerprint: Optional[str] = None) -> list[WorkflowExecution]:
        """Get executions, optionally filtered by fingerprint."""
        if fingerprint:
            return self._fingerprints.get(fingerprint, [])
        return self._executions
    
    def clear(self):
        """Clear all execution history and patterns."""
        self._executions.clear()
        self._fingerprints.clear()
        self._patterns.clear()
    
    def _save_execution(self, execution: WorkflowExecution, fingerprint: str):
        """Save execution to SQLite database."""
        if not self._db_path:
            return
        
        import sqlite3
        
        conn = sqlite3.connect(str(self._db_path))
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS executions (
                    id TEXT PRIMARY KEY,
                    workflow_id TEXT,
                    workflow_name TEXT,
                    fingerprint TEXT,
                    steps_json TEXT,
                    edges_json TEXT,
                    success INTEGER,
                    duration_ms INTEGER,
                    tools_json TEXT,
                    metadata_json TEXT,
                    timestamp REAL
                )
            """)
            
            conn.execute(
                "INSERT INTO executions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    execution.workflow_id,
                    execution.workflow_name,
                    fingerprint,
                    json.dumps(execution.steps),
                    json.dumps([list(e) for e in execution.edges]),
                    1 if execution.success else 0,
                    execution.duration_ms,
                    json.dumps(execution.tools_used),
                    json.dumps(execution.metadata),
                    execution.timestamp,
                ),
            )
            conn.commit()
        finally:
            conn.close()
    
    def _load_from_db(self):
        """Load execution history from SQLite database."""
        if not self._db_path or not self._db_path.exists():
            return
        
        import sqlite3
        
        conn = sqlite3.connect(str(self._db_path))
        try:
            # Check if table exists
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='executions'"
            )
            if not cursor.fetchone():
                return
            
            rows = conn.execute(
                "SELECT workflow_id, workflow_name, fingerprint, steps_json, edges_json, "
                "success, duration_ms, tools_json, metadata_json, timestamp FROM executions"
            ).fetchall()
            
            for row in rows:
                execution = WorkflowExecution(
                    workflow_id=row[0],
                    workflow_name=row[1],
                    steps=json.loads(row[3]),
                    edges=[tuple(e) for e in json.loads(row[4])],
                    success=bool(row[5]),
                    duration_ms=row[6],
                    tools_used=json.loads(row[7]),
                    metadata=json.loads(row[8]),
                    timestamp=row[9],
                )
                
                fingerprint = row[2]
                self._executions.append(execution)
                
                if fingerprint not in self._fingerprints:
                    self._fingerprints[fingerprint] = []
                self._fingerprints[fingerprint].append(execution)
        finally:
            conn.close()
    
    def close(self):
        """Close database connection if open."""
        pass  # SQLite connections are closed after each operation
