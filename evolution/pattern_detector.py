"""Pattern detector for SoloFlow skill evolution.

Detects repeated workflow patterns across executions.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


@dataclass
class Pattern:
    """A detected workflow pattern."""
    
    pattern_id: str
    name: str
    description: str
    steps: list[dict[str, Any]]
    edges: list[tuple[str, str]]
    occurrence_count: int = 1
    success_count: int = 0
    failure_count: int = 0
    avg_duration_ms: float = 0.0
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    fingerprint: str = ""
    
    def __post_init__(self) -> None:
        if not self.fingerprint:
            self.fingerprint = self._compute_fingerprint()
    
    def _compute_fingerprint(self) -> str:
        """Compute a fingerprint for this pattern."""
        # Use step names and edges to create a unique fingerprint
        step_names = tuple(s.get("name", s.get("id", "")) for s in self.steps)
        edge_pairs = tuple(sorted(self.edges))
        content = f"{step_names}:{edge_pairs}"
        return hashlib.md5(content.encode()).hexdigest()[:12]
    
    @property
    def success_rate(self) -> float:
        """Success rate (0.0 to 1.0)."""
        total = self.success_count + self.failure_count
        if total == 0:
            return 0.0
        return self.success_count / total
    
    @property
    def is_reliable(self) -> bool:
        """Whether this pattern is reliable (>= 80% success rate, >= 3 occurrences)."""
        return self.success_rate >= 0.8 and self.occurrence_count >= 3
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "pattern_id": self.pattern_id,
            "name": self.name,
            "description": self.description,
            "steps": self.steps,
            "edges": self.edges,
            "occurrence_count": self.occurrence_count,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "success_rate": self.success_rate,
            "avg_duration_ms": self.avg_duration_ms,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
            "fingerprint": self.fingerprint,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Pattern:
        """Create from dictionary."""
        return cls(
            pattern_id=data["pattern_id"],
            name=data["name"],
            description=data["description"],
            steps=data["steps"],
            edges=[tuple(e) for e in data["edges"]],
            occurrence_count=data.get("occurrence_count", 1),
            success_count=data.get("success_count", 0),
            failure_count=data.get("failure_count", 0),
            avg_duration_ms=data.get("avg_duration_ms", 0.0),
            first_seen=data.get("first_seen", time.time()),
            last_seen=data.get("last_seen", time.time()),
            fingerprint=data.get("fingerprint", ""),
        )


class PatternDetector:
    """Detects repeated workflow patterns.
    
    Analyzes workflow execution history to find patterns that
    occur frequently and can be packaged into reusable skills.
    
    Usage:
        detector = PatternDetector(db_path=Path("patterns.db"))
        
        # Record workflow executions
        detector.record_execution(workflow, success=True, duration_ms=1000)
        
        # Detect patterns
        patterns = detector.detect_patterns(min_occurrences=3)
    """
    
    def __init__(self, db_path: Path = Path("patterns.db")) -> None:
        self._db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None
        self._initialize_db()
    
    def _initialize_db(self) -> None:
        """Initialize the SQLite database."""
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS workflow_executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id TEXT NOT NULL,
                workflow_name TEXT NOT NULL,
                steps_json TEXT NOT NULL,
                edges_json TEXT NOT NULL,
                success BOOLEAN NOT NULL,
                duration_ms REAL,
                executed_at REAL NOT NULL
            )
        """)
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS detected_patterns (
                pattern_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                steps_json TEXT NOT NULL,
                edges_json TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                occurrence_count INTEGER DEFAULT 1,
                success_count INTEGER DEFAULT 0,
                failure_count INTEGER DEFAULT 0,
                avg_duration_ms REAL DEFAULT 0,
                first_seen REAL NOT NULL,
                last_seen REAL NOT NULL
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_patterns_fingerprint 
            ON detected_patterns(fingerprint)
        """)
        self._conn.commit()
    
    def record_execution(
        self,
        workflow: dict[str, Any],
        success: bool,
        duration_ms: float = 0.0,
    ) -> None:
        """Record a workflow execution.
        
        Args:
            workflow: Workflow definition (with steps and edges)
            success: Whether execution succeeded
            duration_ms: Execution duration in milliseconds
        """
        now = time.time()
        
        steps = workflow.get("steps", [])
        edges = workflow.get("edges", [])
        
        # Convert edges to list of tuples
        if edges and isinstance(edges[0], dict):
            edge_list = [(e["from"], e["to"]) for e in edges]
        else:
            edge_list = [tuple(e) for e in edges]
        
        self._conn.execute(
            """
            INSERT INTO workflow_executions (
                workflow_id, workflow_name, steps_json, edges_json,
                success, duration_ms, executed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                workflow.get("id", ""),
                workflow.get("name", "unnamed"),
                json.dumps(steps),
                json.dumps(edge_list),
                success,
                duration_ms,
                now,
            ),
        )
        self._conn.commit()
        
        # Update pattern if exists
        self._update_pattern(workflow, success, duration_ms, now)
    
    def _update_pattern(
        self,
        workflow: dict[str, Any],
        success: bool,
        duration_ms: float,
        timestamp: float,
    ) -> None:
        """Update or create a pattern for this workflow."""
        steps = workflow.get("steps", [])
        edges = workflow.get("edges", [])
        
        if edges and isinstance(edges[0], dict):
            edge_list = [(e["from"], e["to"]) for e in edges]
        else:
            edge_list = [tuple(e) for e in edges]
        
        # Compute fingerprint
        step_names = tuple(s.get("name", s.get("id", "")) for s in steps)
        edge_pairs = tuple(sorted(edge_list))
        content = f"{step_names}:{edge_pairs}"
        fingerprint = hashlib.md5(content.encode()).hexdigest()[:12]
        
        # Check if pattern exists
        cursor = self._conn.execute(
            "SELECT pattern_id, occurrence_count, success_count, failure_count, avg_duration_ms FROM detected_patterns WHERE fingerprint = ?",
            (fingerprint,),
        )
        row = cursor.fetchone()
        
        if row:
            # Update existing pattern
            pattern_id = row[0]
            occurrence_count = row[1] + 1
            success_count = row[2] + (1 if success else 0)
            failure_count = row[3] + (0 if success else 1)
            
            # Update average duration
            old_avg = row[4]
            new_avg = ((old_avg * (occurrence_count - 1)) + duration_ms) / occurrence_count
            
            self._conn.execute(
                """
                UPDATE detected_patterns
                SET occurrence_count = ?, success_count = ?, failure_count = ?,
                    avg_duration_ms = ?, last_seen = ?
                WHERE pattern_id = ?
                """,
                (occurrence_count, success_count, failure_count, new_avg, timestamp, pattern_id),
            )
        else:
            # Create new pattern
            pattern_id = f"pattern_{fingerprint}"
            name = workflow.get("name", "unnamed")
            
            self._conn.execute(
                """
                INSERT INTO detected_patterns (
                    pattern_id, name, description, steps_json, edges_json,
                    fingerprint, occurrence_count, success_count, failure_count,
                    avg_duration_ms, first_seen, last_seen
                ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
                """,
                (
                    pattern_id,
                    name,
                    f"Auto-detected pattern from '{name}'",
                    json.dumps(steps),
                    json.dumps(edge_list),
                    fingerprint,
                    1 if success else 0,
                    0 if success else 1,
                    duration_ms,
                    timestamp,
                    timestamp,
                ),
            )
        
        self._conn.commit()
    
    def detect_patterns(
        self,
        min_occurrences: int = 3,
        min_success_rate: float = 0.5,
    ) -> list[Pattern]:
        """Detect repeated patterns.
        
        Args:
            min_occurrences: Minimum occurrences to be considered a pattern
            min_success_rate: Minimum success rate
            
        Returns:
            List of detected patterns
        """
        cursor = self._conn.execute(
            """
            SELECT * FROM detected_patterns
            WHERE occurrence_count >= ?
            AND (success_count * 1.0 / occurrence_count) >= ?
            ORDER BY occurrence_count DESC
            """,
            (min_occurrences, min_success_rate),
        )
        
        patterns = []
        for row in cursor.fetchall():
            pattern = Pattern(
                pattern_id=row[0],
                name=row[1],
                description=row[2] or "",
                steps=json.loads(row[3]),
                edges=[tuple(e) for e in json.loads(row[4])],
                occurrence_count=row[6],
                success_count=row[7],
                failure_count=row[8],
                avg_duration_ms=row[9],
                first_seen=row[10],
                last_seen=row[11],
                fingerprint=row[5],
            )
            patterns.append(pattern)
        
        return patterns
    
    def get_pattern(self, pattern_id: str) -> Optional[Pattern]:
        """Get a pattern by ID."""
        cursor = self._conn.execute(
            "SELECT * FROM detected_patterns WHERE pattern_id = ?",
            (pattern_id,),
        )
        row = cursor.fetchone()
        
        if row is None:
            return None
        
        return Pattern(
            pattern_id=row[0],
            name=row[1],
            description=row[2] or "",
            steps=json.loads(row[3]),
            edges=[tuple(e) for e in json.loads(row[4])],
            occurrence_count=row[6],
            success_count=row[7],
            failure_count=row[8],
            avg_duration_ms=row[9],
            first_seen=row[10],
            last_seen=row[11],
            fingerprint=row[5],
        )
    
    def get_execution_count(self) -> int:
        """Get total number of recorded executions."""
        cursor = self._conn.execute("SELECT COUNT(*) FROM workflow_executions")
        return cursor.fetchone()[0]
    
    def close(self) -> None:
        """Close the detector."""
        if self._conn:
            self._conn.close()
