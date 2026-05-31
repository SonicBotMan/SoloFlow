"""
SoloFlow — Skill Packager

Packages detected patterns into reusable Hermes skills.
Generates SKILL.md and plugin.py files following Hermes conventions.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from .pattern_detector import Pattern


@dataclass
class Skill:
    """A packaged skill ready for installation."""
    skill_id: str
    name: str
    display_name: str
    category: str
    description: str
    version: str
    tags: list[str]
    pattern_id: str
    
    # Skill content
    skill_md_content: str = ""
    plugin_py_content: str = ""
    
    # Usage tracking
    use_count: int = 0
    success_count: int = 0
    last_used_at: Optional[float] = None
    
    # Quality metrics
    quality_score: float = 0.0
    reliability_score: float = 0.0
    efficiency_score: float = 0.0
    maturity_score: float = 0.0
    reusability_score: float = 0.0
    
    # Metadata
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    sources: list[str] = field(default_factory=list)
    
    def to_mcp_tool(self) -> dict[str, Any]:
        """Convert skill to MCP tool definition."""
        return {
            "name": f"soloflow_{self.name}",
            "description": self.description,
            "inputSchema": {
                "type": "object",
                "properties": {
                    "args": {
                        "type": "string",
                        "description": "Optional arguments for the workflow"
                    }
                }
            }
        }


class SkillPackager:
    """
    Packages detected patterns into reusable Hermes skills.
    
    Generates:
    - SKILL.md: AI instructions for the workflow
    - plugin.py: Slash command + tool registration
    """
    
    # Standard categories
    CATEGORIES = {
        "software-development": ["git", "code", "debug", "test", "build", "deploy"],
        "research": ["search", "analyze", "report", "data"],
        "productivity": ["meeting", "email", "calendar", "task"],
        "content": ["write", "edit", "publish", "format"],
        "automation": ["script", "cron", "schedule", "monitor"],
        "custom": [],  # Default
    }
    
    def __init__(self, db_path: Optional[Path] = None):
        self._skills: dict[str, Skill] = {}
        self._db_path = db_path
        
        if db_path and db_path.exists():
            self._load_from_db()
    
    def package_pattern(
        self,
        pattern: Pattern,
        category: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> Skill:
        """
        Package a detected pattern into a reusable skill.
        
        Args:
            pattern: The detected workflow pattern
            category: Skill category (auto-detected if not provided)
            tags: Additional tags (merged with auto-detected ones)
        
        Returns:
            A Skill object ready for installation
        """
        # Auto-detect category if not provided
        if not category:
            category = self._detect_category(pattern)
        
        # Generate skill name
        skill_name = self._sanitize_name(pattern.name)
        display_name = skill_name.replace("-", " ").title()
        
        # Merge tags
        all_tags = list(set(
            (tags or []) + 
            pattern.tags + 
            [category, "auto-generated", "soloflow"]
        ))
        
        # Generate skill content
        skill_md = self._generate_skill_md(pattern, skill_name, display_name, category, all_tags)
        plugin_py = self._generate_plugin_py(pattern, skill_name, display_name)
        
        # Create skill object
        skill = Skill(
            skill_id=str(uuid.uuid4()),
            name=skill_name,
            display_name=display_name,
            category=category,
            description=pattern.description,
            version="1.0.0",
            tags=all_tags,
            pattern_id=pattern.pattern_id,
            skill_md_content=skill_md,
            plugin_py_content=plugin_py,
            sources=pattern.sources,
            reliability_score=pattern.success_rate,
            quality_score=pattern.success_rate * 0.8,  # Initial estimate
        )
        
        # Store skill
        self._skills[skill.skill_id] = skill
        
        # Persist if db_path set
        if self._db_path:
            self._save_skill(skill)
        
        return skill
    
    def _detect_category(self, pattern: Pattern) -> str:
        """Auto-detect skill category from pattern content."""
        # Check workflow name and description
        text = f"{pattern.name} {pattern.description}".lower()
        
        # Check tools used
        tools_text = " ".join(pattern.tools_used).lower()
        
        combined = f"{text} {tools_text}"
        
        for category, keywords in self.CATEGORIES.items():
            if category == "custom":
                continue
            if any(keyword in combined for keyword in keywords):
                return category
        
        return "custom"
    
    def _sanitize_name(self, name: str) -> str:
        """Convert any string to a valid kebab-case skill name."""
        name = name.lower().strip()
        name = re.sub(r"[^a-z0-9\s-]", "", name)
        name = re.sub(r"[\s_]+", "-", name)
        name = re.sub(r"-+", "-", name).strip("-")
        
        # Ensure it's not empty
        if not name:
            name = "unnamed-skill"
        
        return name
    
    def _generate_skill_md(
        self,
        pattern: Pattern,
        skill_name: str,
        display_name: str,
        category: str,
        tags: list[str],
    ) -> str:
        """Generate SKILL.md content following Hermes conventions."""
        # Build steps documentation
        steps_md = ""
        for i, step in enumerate(pattern.steps, 1):
            step_name = step.get("name", step.get("id", f"Step {i}"))
            step_desc = step.get("prompt", step.get("description", ""))
            steps_md += f"### Step {i}: {step_name}\n"
            if step_desc:
                steps_md += f"{step_desc}\n"
            steps_md += "\n"
        
        # Build edges documentation (dependencies)
        edges_md = ""
        if pattern.edges:
            edges_md = "## Dependencies\n\n"
            for from_id, to_id in pattern.edges:
                edges_md += f"- `{from_id}` → `{to_id}`\n"
            edges_md += "\n"
        
        # Build tools documentation
        tools_md = ""
        if pattern.tools_used:
            tools_md = "## Required Tools\n\n"
            for tool in pattern.tools_used:
                tools_md += f"- `{tool}`\n"
            tools_md += "\n"
        
        # Build quality metrics
        metrics_md = f"""## Quality Metrics

- **Reliability**: {pattern.success_rate:.1%} success rate ({pattern.success_count}/{pattern.occurrence_count} executions)
- **Average Duration**: {pattern.avg_duration_ms:.0f}ms
- **Pattern Confidence**: High (detected from {pattern.occurrence_count} similar executions)

"""
        
        # Build tags string
        tags_str = ", ".join(f'"{tag}"' for tag in tags)
        
        content = f"""---
name: {display_name}
version: 1.0.0
category: {category}
description: {pattern.description}
tags: [{tags_str}]
generated_by: soloflow
generated_at: {datetime.now().strftime("%Y-%m-%d")}
---

# {display_name}

{pattern.description}

This skill was auto-detected by SoloFlow from {pattern.occurrence_count} similar workflow executions.

## When to Activate

Activate this skill when:
- You need to perform the {display_name} workflow
- The task matches the pattern: {pattern.description}
- You want consistent, tested execution steps

## Workflow

{steps_md}{edges_md}{tools_md}{metrics_md}## Quality Checklist

Before completing this workflow:
- [ ] All steps completed in order
- [ ] Output verified against expected result
- [ ] No side effects left behind
- [ ] Error handling applied for each step

## Anti-patterns

- ❌ Skipping steps or reordering without justification
- ❌ Ignoring error conditions
- ❌ Not validating intermediate results

## Integration

This skill was auto-generated by [SoloFlow](https://github.com/SonicBotMan/SoloFlow).
Edit this file to refine the workflow steps and examples.

To trigger this skill: `/soloflow run {skill_name}`
"""
        return content
    
    def _generate_plugin_py(
        self,
        pattern: Pattern,
        skill_name: str,
        display_name: str,
    ) -> str:
        """Generate plugin.py content following Hermes conventions."""
        # Build step comments
        steps_comments = ""
        for i, step in enumerate(pattern.steps, 1):
            step_name = step.get("name", step.get("id", f"Step {i}"))
            steps_comments += f"        # Step {i}: {step_name}\n"
        
        content = f'''"""
{display_name} Plugin — Auto-generated by SoloFlow
{pattern.description}

Install: cp {skill_name}.py ~/.hermes/plugins/
Usage:   /{skill_name} [args]

Generated from {pattern.occurrence_count} similar workflow executions.
Success rate: {pattern.success_rate:.1%}
"""

from __future__ import annotations

PLUGIN_NAME = "{skill_name}"
PLUGIN_VERSION = "1.0.0"
PLUGIN_DESCRIPTION = "{pattern.description}"


def register(hermes):
    """Register the {display_name} skill as a Hermes command."""

    @hermes.command(
        name="{skill_name}",
        description="{pattern.description}",
        usage="/{skill_name} [args]",
    )
    async def run_skill(ctx, args: str = ""):
        """Execute the {display_name} workflow.

        Auto-detected by SoloFlow from {pattern.occurrence_count} similar executions.
        Edit the steps below to refine the implementation.
        """
{steps_comments}
        await ctx.reply(
            "Running **{display_name}** workflow...\\n\\n"
            "Edit `~/.hermes/plugins/{skill_name}.py` to implement the steps."
        )

    # Optional: register a tool this skill exposes to the AI
    # @hermes.tool(
    #     name="{skill_name.replace("-", "_")}_tool",
    #     description="{pattern.description}",
    # )
    # async def skill_tool(ctx, input: str) -> str:
    #     """Execute the {display_name} workflow programmatically."""
    #     return f"Result for: {{input}}"
'''
        return content
    
    def get_skill(self, skill_id: str) -> Optional[Skill]:
        """Get a skill by ID."""
        return self._skills.get(skill_id)
    
    def get_skill_by_name(self, name: str) -> Optional[Skill]:
        """Get a skill by name."""
        for skill in self._skills.values():
            if skill.name == name:
                return skill
        return None
    
    def list_skills(self) -> list[Skill]:
        """List all packaged skills."""
        return list(self._skills.values())
    
    def install_skill(self, skill: Skill, hermes_dir: Optional[Path] = None) -> list[Path]:
        """
        Install a skill to the Hermes directory.
        
        Args:
            skill: The skill to install
            hermes_dir: Hermes directory (defaults to ~/.hermes)
        
        Returns:
            List of installed file paths
        """
        if not hermes_dir:
            hermes_dir = Path.home() / ".hermes"
        
        installed = []
        
        # Install SKILL.md
        skill_dir = hermes_dir / "skills" / skill.category / skill.name
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_md_path = skill_dir / "SKILL.md"
        skill_md_path.write_text(skill.skill_md_content, encoding="utf-8")
        installed.append(skill_md_path)
        
        # Install plugin.py
        plugins_dir = hermes_dir / "plugins"
        plugins_dir.mkdir(parents=True, exist_ok=True)
        plugin_py_path = plugins_dir / f"{skill.name}.py"
        plugin_py_path.write_text(skill.plugin_py_content, encoding="utf-8")
        installed.append(plugin_py_path)
        
        return installed
    
    def _save_skill(self, skill: Skill):
        """Save skill to SQLite database."""
        if not self._db_path:
            return
        
        import sqlite3
        
        conn = sqlite3.connect(str(self._db_path))
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS skills (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    display_name TEXT,
                    category TEXT,
                    description TEXT,
                    version TEXT,
                    tags_json TEXT,
                    pattern_id TEXT,
                    skill_md_content TEXT,
                    plugin_py_content TEXT,
                    use_count INTEGER,
                    success_count INTEGER,
                    last_used_at REAL,
                    quality_score REAL,
                    reliability_score REAL,
                    efficiency_score REAL,
                    maturity_score REAL,
                    reusability_score REAL,
                    created_at REAL,
                    updated_at REAL,
                    sources_json TEXT
                )
            """)
            
            conn.execute(
                "INSERT INTO skills VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    skill.skill_id,
                    skill.name,
                    skill.display_name,
                    skill.category,
                    skill.description,
                    skill.version,
                    json.dumps(skill.tags),
                    skill.pattern_id,
                    skill.skill_md_content,
                    skill.plugin_py_content,
                    skill.use_count,
                    skill.success_count,
                    skill.last_used_at,
                    skill.quality_score,
                    skill.reliability_score,
                    skill.efficiency_score,
                    skill.maturity_score,
                    skill.reusability_score,
                    skill.created_at,
                    skill.updated_at,
                    json.dumps(skill.sources),
                ),
            )
            conn.commit()
        finally:
            conn.close()
    
    def _load_from_db(self):
        """Load skills from SQLite database."""
        if not self._db_path or not self._db_path.exists():
            return
        
        import sqlite3
        
        conn = sqlite3.connect(str(self._db_path))
        try:
            # Check if table exists
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='skills'"
            )
            if not cursor.fetchone():
                return
            
            rows = conn.execute(
                "SELECT * FROM skills"
            ).fetchall()
            
            for row in rows:
                skill = Skill(
                    skill_id=row[0],
                    name=row[1],
                    display_name=row[2],
                    category=row[3],
                    description=row[4],
                    version=row[5],
                    tags=json.loads(row[6]),
                    pattern_id=row[7],
                    skill_md_content=row[8],
                    plugin_py_content=row[9],
                    use_count=row[10],
                    success_count=row[11],
                    last_used_at=row[12],
                    quality_score=row[13],
                    reliability_score=row[14],
                    efficiency_score=row[15],
                    maturity_score=row[16],
                    reusability_score=row[17],
                    created_at=row[18],
                    updated_at=row[19],
                    sources=json.loads(row[20]),
                )
                self._skills[skill.skill_id] = skill
        finally:
            conn.close()
    
    def close(self):
        """Close database connection if open."""
        pass  # SQLite connections are closed after each operation
