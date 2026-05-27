"""Skill packager for SoloFlow.

Packages detected patterns into versioned, reusable skills.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from .pattern_detector import Pattern


@dataclass
class Skill:
    """A packaged skill derived from a workflow pattern."""
    
    skill_id: str
    name: str
    version: str
    description: str
    pattern_id: str
    steps: list[dict[str, Any]]
    edges: list[tuple[str, str]]
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "skill_id": self.skill_id,
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "pattern_id": self.pattern_id,
            "steps": self.steps,
            "edges": self.edges,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Skill:
        """Create from dictionary."""
        return cls(
            skill_id=data["skill_id"],
            name=data["name"],
            version=data["version"],
            description=data["description"],
            pattern_id=data["pattern_id"],
            steps=data["steps"],
            edges=[tuple(e) for e in data["edges"]],
            input_schema=data["input_schema"],
            output_schema=data["output_schema"],
            metadata=data.get("metadata", {}),
            created_at=data.get("created_at", time.time()),
        )
    
    def to_mcp_tool(self) -> dict[str, Any]:
        """Convert to MCP tool definition."""
        return {
            "name": f"soloflow_skill_{self.name}",
            "description": self.description,
            "inputSchema": self.input_schema,
        }


class SkillPackager:
    """Packages detected patterns into versioned skills.
    
    Usage:
        packager = SkillPackager(db_path=Path("skills.db"))
        
        # Package a pattern into a skill
        skill = packager.package_pattern(pattern)
        
        # List skills
        skills = packager.list_skills()
    """
    
    def __init__(self, db_path: Path = Path("skills.db")) -> None:
        self._db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None
        self._initialize_db()
    
    def _initialize_db(self) -> None:
        """Initialize the SQLite database."""
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS skills (
                skill_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                description TEXT,
                pattern_id TEXT NOT NULL,
                steps_json TEXT NOT NULL,
                edges_json TEXT NOT NULL,
                input_schema_json TEXT NOT NULL,
                output_schema_json TEXT NOT NULL,
                metadata_json TEXT,
                created_at REAL NOT NULL
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_skills_pattern_id 
            ON skills(pattern_id)
        """)
        self._conn.commit()
    
    def package_pattern(self, pattern: Pattern) -> Skill:
        """Package a pattern into a skill.
        
        Args:
            pattern: Detected pattern to package
            
        Returns:
            Created skill
        """
        skill_id = f"skill_{uuid.uuid4().hex[:8]}"
        
        # Generate schemas from pattern
        input_schema = self._generate_input_schema(pattern)
        output_schema = self._generate_output_schema(pattern)
        
        # Clean name for skill
        name = self._clean_name(pattern.name)
        
        skill = Skill(
            skill_id=skill_id,
            name=name,
            version="1.0.0",
            description=pattern.description or f"Auto-evolved skill from pattern '{pattern.name}'",
            pattern_id=pattern.pattern_id,
            steps=pattern.steps,
            edges=pattern.edges,
            input_schema=input_schema,
            output_schema=output_schema,
            metadata={
                "occurrence_count": pattern.occurrence_count,
                "success_rate": pattern.success_rate,
                "avg_duration_ms": pattern.avg_duration_ms,
                "auto_evolved": True,
            },
        )
        
        # Persist to database
        self._persist_skill(skill)
        
        return skill
    
    def _clean_name(self, name: str) -> str:
        """Clean a name for use as a skill name."""
        # Replace spaces and special chars with underscores
        import re
        cleaned = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower())
        # Remove consecutive underscores
        cleaned = re.sub(r'_+', '_', cleaned)
        # Remove leading/trailing underscores
        cleaned = cleaned.strip('_')
        return cleaned or "unnamed_skill"
    
    def _generate_input_schema(self, pattern: Pattern) -> dict[str, Any]:
        """Generate input schema from pattern."""
        # Extract unique prompts from steps
        prompts = []
        for step in pattern.steps:
            prompt = step.get("prompt", "")
            if prompt:
                prompts.append(prompt)
        
        # Generate schema based on step prompts
        properties = {}
        required = []
        
        for i, prompt in enumerate(prompts[:3]):  # Limit to 3 inputs
            param_name = f"input_{i+1}"
            properties[param_name] = {
                "type": "string",
                "description": prompt,
            }
            required.append(param_name)
        
        return {
            "type": "object",
            "properties": properties,
            "required": required,
        }
    
    def _generate_output_schema(self, pattern: Pattern) -> dict[str, Any]:
        """Generate output schema from pattern."""
        return {
            "type": "object",
            "properties": {
                "result": {
                    "type": "string",
                    "description": "Execution result",
                },
                "steps_completed": {
                    "type": "integer",
                    "description": "Number of steps completed",
                },
            },
        }
    
    def _persist_skill(self, skill: Skill) -> None:
        """Persist a skill to the database."""
        self._conn.execute(
            """
            INSERT OR REPLACE INTO skills (
                skill_id, name, version, description, pattern_id,
                steps_json, edges_json, input_schema_json, output_schema_json,
                metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                skill.skill_id,
                skill.name,
                skill.version,
                skill.description,
                skill.pattern_id,
                json.dumps(skill.steps),
                json.dumps(skill.edges),
                json.dumps(skill.input_schema),
                json.dumps(skill.output_schema),
                json.dumps(skill.metadata),
                skill.created_at,
            ),
        )
        self._conn.commit()
    
    def get_skill(self, skill_id: str) -> Optional[Skill]:
        """Get a skill by ID."""
        cursor = self._conn.execute(
            "SELECT * FROM skills WHERE skill_id = ?",
            (skill_id,),
        )
        row = cursor.fetchone()
        
        if row is None:
            return None
        
        return Skill(
            skill_id=row[0],
            name=row[1],
            version=row[2],
            description=row[3] or "",
            pattern_id=row[4],
            steps=json.loads(row[5]),
            edges=[tuple(e) for e in json.loads(row[6])],
            input_schema=json.loads(row[7]),
            output_schema=json.loads(row[8]),
            metadata=json.loads(row[9] or "{}"),
            created_at=row[10],
        )
    
    def list_skills(self, limit: int = 50) -> list[Skill]:
        """List all skills."""
        cursor = self._conn.execute(
            "SELECT * FROM skills ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        
        skills = []
        for row in cursor.fetchall():
            skills.append(Skill(
                skill_id=row[0],
                name=row[1],
                version=row[2],
                description=row[3] or "",
                pattern_id=row[4],
                steps=json.loads(row[5]),
                edges=[tuple(e) for e in json.loads(row[6])],
                input_schema=json.loads(row[7]),
                output_schema=json.loads(row[8]),
                metadata=json.loads(row[9] or "{}"),
                created_at=row[10],
            ))
        
        return skills
    
    def get_skill_count(self) -> int:
        """Get total number of skills."""
        cursor = self._conn.execute("SELECT COUNT(*) FROM skills")
        return cursor.fetchone()[0]
    
    def close(self) -> None:
        """Close the packager."""
        if self._conn:
            self._conn.close()
