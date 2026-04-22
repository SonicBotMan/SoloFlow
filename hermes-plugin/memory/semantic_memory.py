"""Semantic memory for pattern extraction and template storage."""

import hashlib
import json
import time
import uuid
from typing import Optional


class SemanticMemory:
    """Semantic memory system for storing and retrieving evolved patterns."""

    def __init__(self, store):
        self._store = store

    async def extract_and_store(self, workflow_result: dict) -> Optional[dict]:
        """Extract reusable patterns from completed workflow results."""
        workflow_id = workflow_result.get("id")
        steps = workflow_result.get("steps", [])
        if not steps:
            return None

        disciplines = list(set(s.get("discipline", "general") for s in steps))
        step_pattern = " -> ".join(s.get("name", s.get("id", "?")) for s in steps)

        successful_steps = [s for s in steps if s.get("state") == "completed"]
        if not successful_steps:
            return None

        template_content = {
            "steps": [
                {
                    "name": s.get("name"),
                    "discipline": s.get("discipline"),
                    "prompt": s.get("prompt"),
                }
                for s in successful_steps
            ],
            "edge_count": len(workflow_result.get("edges", [])),
        }

        pattern_hash = hashlib.md5(step_pattern.encode()).hexdigest()[:8]
        name = f"template_{pattern_hash}"
        template_id = str(uuid.uuid4())
        now = time.time()
        category = disciplines[0] if disciplines else "general"

        self._store.save_template({
            "id": template_id,
            "name": name,
            "description": step_pattern,
            "template": template_content,
            "source_count": len(successful_steps),
            "created_at": now,
        })

        return {
            "id": template_id,
            "name": name,
            "category": category,
            "pattern": step_pattern,
            "workflow_id": workflow_id,
            "step_count": len(steps),
        }

    async def search(self, query: str, limit: int = 10) -> list[dict]:
        """Search evolved templates using FTS5."""
        return self._store.search_templates(query, limit=limit)

    async def get_templates(self, category: str = None, limit: int = 20) -> list[dict]:
        """List templates, optionally filtered by category."""
        conn = self._store.conn
        if category:
            rows = conn.execute(
                "SELECT id, name, description, template_json, source_count, created_at "
                "FROM evolved_templates WHERE description LIKE ? ORDER BY source_count DESC LIMIT ?",
                (f"%{category}%", limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, name, description, template_json, source_count, created_at "
                "FROM evolved_templates ORDER BY source_count DESC LIMIT ?",
                (limit,),
            ).fetchall()

        results = []
        for r in rows:
            try:
                template = json.loads(r[3]) if r[3] else {}
            except (json.JSONDecodeError, TypeError):
                template = {}
            results.append({
                "id": r[0], "name": r[1], "pattern": r[2],
                "template": template, "source_count": r[4], "created_at": r[5],
            })
        return results
