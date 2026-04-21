"""SQLite persistence layer for SoloFlow."""

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional

from store.migrations import migrate


class SQLiteStore:
    """Thread-safe SQLite store for SoloFlow workflows, steps, DAG, episodic memory, and templates."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None
        self._lock = threading.Lock()

    # -------------------------------------------------------------------------
    # Lifecycle
    # -------------------------------------------------------------------------

    def initialize(self) -> None:
        """Open connection, set WAL + busy_timeout, run migrations."""
        with self._lock:
            self._conn = sqlite3.connect(
                str(self._db_path),
                check_same_thread=False,
                timeout=30.0,
            )
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA busy_timeout=5000")
            self._conn.execute("PRAGMA foreign_keys=ON")
            migrate(self._conn)

    @property
    def conn(self) -> sqlite3.Connection:
        """Get active connection, raise if not initialized."""
        if self._conn is None:
            raise RuntimeError("SQLiteStore not initialized. Call initialize() first.")
        return self._conn

    def close(self) -> None:
        """Close connection."""
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    # -------------------------------------------------------------------------
    # Workflow CRUD
    # -------------------------------------------------------------------------

    def save_workflow(self, wf_dict: dict) -> None:
        """Insert or update a workflow (uses UPSERT to avoid CASCADE side-effects)."""
        now = time.time()
        self.conn.execute(
            """
            INSERT INTO workflows
                (id, name, description, state, config_json, created_at, updated_at)
            VALUES
                (:id, :name, :description, :state, :config_json,
                 :created_at, :now)
            ON CONFLICT(id) DO UPDATE SET
                name = :name,
                description = :description,
                state = :state,
                config_json = :config_json,
                updated_at = :now
            """,
            {
                "id": wf_dict["id"],
                "name": wf_dict.get("name", ""),
                "description": wf_dict.get("description", ""),
                "state": wf_dict.get("state", "draft"),
                "config_json": json.dumps(wf_dict.get("config", {})),
                "created_at": wf_dict.get("created_at", now),
                "now": now,
            },
        )
        self.conn.commit()

    def get_workflow(self, workflow_id: str, full: bool = False) -> Optional[dict]:
        """Fetch a single workflow by id, or None if not found.

        Args:
            workflow_id: UUID of workflow
            full: If True, include steps, edges, and layers in the result.
        """
        cursor = self.conn.execute(
            "SELECT id, name, description, state, config_json, created_at, updated_at "
            "FROM workflows WHERE id = ?",
            (workflow_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        wf = self._row_to_workflow(row)
        if full:
            wf["steps"] = self.get_steps(workflow_id)
            wf["edges"] = [
                {"from": e[0], "to": e[1]}
                for e in self.get_edges(workflow_id)
            ]
            wf["layers"] = self.get_layers(workflow_id)
        return wf

    def list_workflows(
        self, limit: int = 50, state_filter: Optional[str] = None
    ) -> list[dict]:
        """List workflows, newest first, optionally filtered by state."""
        if state_filter:
            cursor = self.conn.execute(
                "SELECT id, name, description, state, config_json, created_at, updated_at "
                "FROM workflows WHERE state = ? ORDER BY updated_at DESC LIMIT ?",
                (state_filter, limit),
            )
        else:
            cursor = self.conn.execute(
                "SELECT id, name, description, state, config_json, created_at, updated_at "
                "FROM workflows ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            )
        return [self._row_to_workflow(row) for row in cursor.fetchall()]

    def update_workflow_state(self, workflow_id: str, state: str) -> None:
        """Update only the state and updated_at of a workflow."""
        self.conn.execute(
            "UPDATE workflows SET state = ?, updated_at = ? WHERE id = ?",
            (state, time.time(), workflow_id),
        )
        self.conn.commit()

    def delete_workflow(self, workflow_id: str) -> None:
        """Delete a workflow and cascade to steps/edges/layers via FK."""
        self.conn.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
        self.conn.commit()

    # -------------------------------------------------------------------------
    # Step CRUD
    # -------------------------------------------------------------------------

    def save_step(self, step_dict: dict) -> None:
        """Insert or update a workflow step (uses UPSERT to avoid side-effects)."""
        now = time.time()
        self.conn.execute(
            """
            INSERT INTO workflow_steps
                (id, workflow_id, name, description, discipline, prompt,
                 state, result, error, retry_count, max_retries, timeout_seconds,
                 created_at, updated_at)
            VALUES
                (:id, :workflow_id, :name, :description, :discipline, :prompt,
                 :state, :result, :error,
                 :retry_count, :max_retries, :timeout_seconds,
                 :created_at, :now)
            ON CONFLICT(id) DO UPDATE SET
                name = :name,
                description = :description,
                discipline = :discipline,
                prompt = :prompt,
                state = :state,
                result = :result,
                error = :error,
                retry_count = :retry_count,
                max_retries = :max_retries,
                timeout_seconds = :timeout_seconds,
                updated_at = :now
            """,
            {
                "id": step_dict["id"],
                "workflow_id": step_dict["workflow_id"],
                "name": step_dict.get("name", ""),
                "description": step_dict.get("description", ""),
                "discipline": step_dict.get("discipline", ""),
                "prompt": step_dict.get("prompt", ""),
                "state": step_dict.get("state", "pending"),
                "result": step_dict.get("result", ""),
                "error": step_dict.get("error", ""),
                "retry_count": step_dict.get("retry_count", 0),
                "max_retries": step_dict.get("max_retries", 2),
                "timeout_seconds": step_dict.get("timeout_seconds", 300),
                "created_at": step_dict.get("created_at", now),
                "now": now,
            },
        )
        self.conn.commit()

    def get_steps(self, workflow_id: str) -> list[dict]:
        """Fetch all steps for a workflow."""
        cursor = self.conn.execute(
            """
            SELECT id, workflow_id, name, description, discipline, prompt,
                   state, result, error, retry_count, max_retries, timeout_seconds,
                   created_at, updated_at
            FROM workflow_steps
            WHERE workflow_id = ?
            ORDER BY created_at ASC
            """,
            (workflow_id,),
        )
        return [self._row_to_step(row) for row in cursor.fetchall()]

    def update_step(self, step_id: str, **fields: Any) -> None:
        """Update arbitrary fields on a step; updated_at is always refreshed."""
        allowed = {
            "name", "description", "discipline", "prompt",
            "state", "result", "error",
            "retry_count", "max_retries", "timeout_seconds",
        }
        setters = {k: v for k, v in fields.items() if k in allowed}
        if not setters:
            return
        setters["updated_at"] = time.time()
        setters["id"] = step_id
        sql = "UPDATE workflow_steps SET " + ", ".join(
            f"{k} = :{k}" for k in setters
        ) + " WHERE id = :id"
        self.conn.execute(sql, setters)
        self.conn.commit()

    # -------------------------------------------------------------------------
    # DAG Edges
    # -------------------------------------------------------------------------

    def save_edges(self, workflow_id: str, edges: list[tuple[str, str]]) -> None:
        """Replace all edges for a workflow."""
        self.conn.execute(
            "DELETE FROM dag_edges WHERE workflow_id = ?",
            (workflow_id,),
        )
        for from_step, to_step in edges:
            self.conn.execute(
                """
                INSERT INTO dag_edges (workflow_id, from_step, to_step)
                VALUES (?, ?, ?)
                """,
                (workflow_id, from_step, to_step),
            )
        self.conn.commit()

    def get_edges(self, workflow_id: str) -> list[tuple[str, str]]:
        """Fetch all edges for a workflow."""
        cursor = self.conn.execute(
            "SELECT from_step, to_step FROM dag_edges WHERE workflow_id = ?",
            (workflow_id,),
        )
        return [(row[0], row[1]) for row in cursor.fetchall()]

    # -------------------------------------------------------------------------
    # DAG Layers
    # -------------------------------------------------------------------------

    def save_layers(self, workflow_id: str, layers: list[dict]) -> None:
        """Replace all layers for a workflow."""
        self.conn.execute(
            "DELETE FROM dag_layers WHERE workflow_id = ?",
            (workflow_id,),
        )
        for layer in layers:
            self.conn.execute(
                """
                INSERT INTO dag_layers (workflow_id, layer_index, step_ids_json)
                VALUES (?, ?, ?)
                """,
                (workflow_id, layer["layer_index"], json.dumps(layer["step_ids"])),
            )
        self.conn.commit()

    def get_layers(self, workflow_id: str) -> list[dict]:
        """Fetch all layers for a workflow, ordered by layer_index."""
        cursor = self.conn.execute(
            "SELECT layer_index, step_ids_json FROM dag_layers "
            "WHERE workflow_id = ? ORDER BY layer_index ASC",
            (workflow_id,),
        )
        return [
            {"layer_index": row[0], "step_ids": json.loads(row[1])}
            for row in cursor.fetchall()
        ]

    # -------------------------------------------------------------------------
    # Episodic Memory
    # -------------------------------------------------------------------------

    def save_episodic(self, entry: dict) -> None:
        """Insert an episodic memory entry (FTS sync handled by triggers)."""
        self.conn.execute(
            """
            INSERT INTO episodic_memory
                (id, workflow_id, execution_id, event_type, data_json, timestamp)
            VALUES
                (:id, :workflow_id, :execution_id, :event_type, :data_json, :timestamp)
            """,
            {
                "id": entry["id"],
                "workflow_id": entry["workflow_id"],
                "execution_id": entry.get("execution_id", ""),
                "event_type": entry.get("event_type", ""),
                "data_json": json.dumps(entry.get("data", {})),
                "timestamp": entry.get("timestamp", time.time()),
            },
        )
        self.conn.commit()

    def search_episodic(self, query: str, limit: int = 10) -> list[dict]:
        """Full-text search over episodic memory via FTS5."""
        escaped = self._escape_fts(query)
        sql = f"""
            SELECT e.id, e.workflow_id, e.execution_id, e.event_type, e.data_json, e.timestamp
            FROM episodic_memory e
            JOIN episodic_fts f ON e.id = f.id
            WHERE episodic_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        """
        cursor = self.conn.execute(sql, (escaped, limit))
        return [self._row_to_episodic(row) for row in cursor.fetchall()]

    def get_episodic_by_workflow(
        self, workflow_id: str, limit: int = 50
    ) -> list[dict]:
        """Fetch episodic entries for a workflow, newest first."""
        cursor = self.conn.execute(
            """
            SELECT id, workflow_id, execution_id, event_type, data_json, timestamp
            FROM episodic_memory
            WHERE workflow_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (workflow_id, limit),
        )
        return [self._row_to_episodic(row) for row in cursor.fetchall()]

    # -------------------------------------------------------------------------
    # Templates
    # -------------------------------------------------------------------------

    def save_template(self, template: dict) -> None:
        """Insert or replace an evolved template."""
        self.conn.execute(
            """
            INSERT OR REPLACE INTO evolved_templates
                (id, name, description, template_json, source_count, created_at)
            VALUES
                (:id, :name, :description, :template_json, :source_count, :created_at)
            """,
            {
                "id": template["id"],
                "name": template.get("name", ""),
                "description": template.get("description", ""),
                "template_json": json.dumps(template.get("template", {})),
                "source_count": template.get("source_count", 0),
                "created_at": template.get("created_at", time.time()),
            },
        )
        self.conn.commit()

    def search_templates(self, query: str, limit: int = 10) -> list[dict]:
        """Simple LIKE search over template name/description."""
        pattern = f"%{query}%"
        cursor = self.conn.execute(
            """
            SELECT id, name, description, template_json, source_count, created_at
            FROM evolved_templates
            WHERE name LIKE ? OR description LIKE ?
            ORDER BY source_count DESC, created_at DESC
            LIMIT ?
            """,
            (pattern, pattern, limit),
        )
        return [self._row_to_template(row) for row in cursor.fetchall()]

    # -------------------------------------------------------------------------
    # FTS5 Safety
    # -------------------------------------------------------------------------

    @staticmethod
    def _escape_fts(query: str) -> str:
        """Escape FTS5 special characters: " * ( ) : ^

        Handles:
        - Quoted phrases ("exact match") → preserved as-is
        - FTS5 boolean operators (AND OR NOT) → passed through
        - Prefix wildcards (term*) → term* (quotes added around base)
        - Content tokens → special chars stripped, wrapped in double-quotes
        """
        FTS5_OPS = frozenset({"AND", "OR", "NOT"})
        safe_tokens: list[str] = []

        # Parse quoted strings as atomic tokens first
        chars = list(query)
        i = 0
        while i < len(chars):
            c = chars[i]
            if c == '"':
                # Collect everything up to the next unescaped quote
                phrase_chars = ['"']
                i += 1
                while i < len(chars):
                    nc = chars[i]
                    if nc == '"':
                        phrase_chars.append('"')
                        i += 1
                        break
                    phrase_chars.append(nc)
                    i += 1
                safe_tokens.append("".join(phrase_chars))
            else:
                # Collect a whitespace-delimited word
                word_chars = []
                while i < len(chars) and chars[i] not in (" ", "\t", "\n"):
                    word_chars.append(chars[i])
                    i += 1
                if word_chars:
                    word = "".join(word_chars)
                    upper = word.upper()
                    # Preserve FTS5 operators and bare wildcard
                    if upper in FTS5_OPS or word == "*":
                        safe_tokens.append(word)
                    else:
                        # Strip FTS5 special chars from content tokens
                        cleaned = "".join(
                            ch for ch in word if ch not in '"*():^'
                        )
                        safe_tokens.append(f'"{cleaned}"')
                i += 1

        return " AND ".join(safe_tokens)

    # -------------------------------------------------------------------------
    # Row helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def _row_to_workflow(row: tuple) -> dict:
        id_, name, description, state, config_json, created_at, updated_at = row
        return {
            "id": id_,
            "name": name,
            "description": description,
            "state": state,
            "config": json.loads(config_json) if config_json else {},
            "created_at": created_at,
            "updated_at": updated_at,
        }

    @staticmethod
    def _row_to_step(row: tuple) -> dict:
        (id_, workflow_id, name, description, discipline, prompt,
         state, result, error, retry_count, max_retries, timeout_seconds,
         created_at, updated_at) = row
        return {
            "id": id_,
            "workflow_id": workflow_id,
            "name": name,
            "description": description,
            "discipline": discipline,
            "prompt": prompt,
            "state": state,
            "result": result,
            "error": error,
            "retry_count": retry_count,
            "max_retries": max_retries,
            "timeout_seconds": timeout_seconds,
            "created_at": created_at,
            "updated_at": updated_at,
        }

    @staticmethod
    def _row_to_episodic(row: tuple) -> dict:
        id_, workflow_id, execution_id, event_type, data_json, timestamp = row
        return {
            "id": id_,
            "workflow_id": workflow_id,
            "execution_id": execution_id,
            "event_type": event_type,
            "data": json.loads(data_json) if data_json else {},
            "timestamp": timestamp,
        }

    @staticmethod
    def _row_to_template(row: tuple) -> dict:
        id_, name, description, template_json, source_count, created_at = row
        return {
            "id": id_,
            "name": name,
            "description": description,
            "template": json.loads(template_json) if template_json else {},
            "source_count": source_count,
            "created_at": created_at,
        }
