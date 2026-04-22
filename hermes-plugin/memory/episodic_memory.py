"""Episodic memory backed by SQLite with FTS5 full-text search."""

import json
import time
import uuid
from typing import Optional


class EpisodicMemory:
    """Episodic memory system for recording and retrieving conversation history."""

    def __init__(self, store):
        self._store = store

    async def record(
        self,
        workflow_id: str = None,
        execution_id: str = None,
        event_type: str = "turn",
        data: dict = None,
    ) -> dict:
        """Record an event to episodic memory."""
        entry = {
            "id": str(uuid.uuid4()),
            "workflow_id": workflow_id or "",
            "execution_id": execution_id or "",
            "event_type": event_type,
            "data": data if data else {},
            "timestamp": time.time(),
        }
        self._store.save_episodic(entry)
        return entry

    async def search(self, query: str, limit: int = 10) -> list[dict]:
        """Search episodic memory using FTS5 full-text search."""
        return self._store.search_episodic(query, limit=limit)

    async def get_by_workflow(self, workflow_id: str, limit: int = 50) -> list[dict]:
        """Get all episodes for a specific workflow."""
        return self._store.get_episodic_by_workflow(workflow_id, limit=limit)

    async def get_recent(self, limit: int = 20) -> list[dict]:
        """Get the most recent episodes."""
        conn = self._store.conn
        rows = conn.execute(
            "SELECT id, workflow_id, execution_id, event_type, data_json, timestamp "
            "FROM episodic_memory ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        ).fetchall()
        results = []
        for r in rows:
            try:
                data = json.loads(r[4]) if r[4] else {}
            except (json.JSONDecodeError, TypeError):
                data = {"raw": r[4]}
            results.append({
                "id": r[0], "workflow_id": r[1], "execution_id": r[2],
                "event_type": r[3], "data": data, "timestamp": r[5],
            })
        return results
