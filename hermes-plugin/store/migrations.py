"""SQLite schema migrations for SoloFlow."""

import sqlite3

CURRENT_SCHEMA_VERSION = 8


def migrate(conn: sqlite3.Connection) -> None:
    """Run incremental migrations from current version to target version."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _soloflow_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    cursor = conn.execute("SELECT value FROM _soloflow_meta WHERE key = 'schema_version'")
    row = cursor.fetchone()
    current_version = int(row[0]) if row else 0

    if current_version == CURRENT_SCHEMA_VERSION:
        return

    for version in range(current_version + 1, CURRENT_SCHEMA_VERSION + 1):
        _run_migration(conn, version)

    conn.execute(
        "INSERT OR REPLACE INTO _soloflow_meta (key, value) VALUES ('schema_version', ?)",
        (str(CURRENT_SCHEMA_VERSION),)
    )
    conn.commit()


def _run_migration(conn: sqlite3.Connection, version: int) -> None:
    """Execute a single migration version within a transaction."""
    cursor = conn.cursor()

    if version == 1:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                state TEXT DEFAULT 'draft',
                config_json TEXT DEFAULT '{}',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS workflow_steps (
                id TEXT NOT NULL,
                workflow_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                discipline TEXT DEFAULT '',
                prompt TEXT DEFAULT '',
                state TEXT DEFAULT 'pending',
                result TEXT DEFAULT '',
                error TEXT DEFAULT '',
                retry_count INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 2,
                timeout_seconds INTEGER DEFAULT 300,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                PRIMARY KEY (workflow_id, id),
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dag_edges (
                workflow_id TEXT NOT NULL,
                from_step TEXT NOT NULL,
                to_step TEXT NOT NULL,
                PRIMARY KEY (workflow_id, from_step, to_step),
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dag_layers (
                workflow_id TEXT NOT NULL,
                layer_index INTEGER NOT NULL,
                step_ids_json TEXT NOT NULL,
                PRIMARY KEY (workflow_id, layer_index),
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            )
        """)

    elif version == 2:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS episodic_memory (
                id TEXT PRIMARY KEY,
                workflow_id TEXT DEFAULT '',
                execution_id TEXT DEFAULT '',
                event_type TEXT DEFAULT '',
                data_json TEXT DEFAULT '{}',
                timestamp REAL NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS episodic_fts (
                id TEXT PRIMARY KEY,
                workflow_id TEXT DEFAULT '',
                execution_id TEXT DEFAULT '',
                event_type TEXT DEFAULT '',
                data_json TEXT DEFAULT '{}'
            )
        """)
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts_idx
            USING fts5(id UNINDEXED, data_json, content=episodic_memory, content_rowid=rowid)
        """)

    elif version == 3:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS evolved_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                template_json TEXT DEFAULT '{}',
                source_count INTEGER DEFAULT 0,
                created_at REAL NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS semantic_memory (
                id TEXT PRIMARY KEY,
                pattern TEXT NOT NULL,
                content TEXT DEFAULT '',
                metadata_json TEXT DEFAULT '{}',
                created_at REAL NOT NULL
            )
        """)

    elif version == 4:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_workflow ON episodic_memory(workflow_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_timestamp ON episodic_memory(timestamp DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_execution ON episodic_memory(execution_id)")

    elif version == 5:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_workflow_state ON workflows(state)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_workflow_updated ON workflows(updated_at DESC)")

    elif version == 6:
        # Migrate episodic_fts from regular table to FTS5 virtual table
        cursor.execute("DROP TABLE IF EXISTS episodic_fts_idx")
        cursor.execute("DROP TABLE IF EXISTS episodic_fts")  # drop old regular table
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(
                id UNINDEXED,
                workflow_id,
                execution_id,
                event_type,
                data_json,
                content=episodic_memory,
                content_rowid=rowid
            )
        """)
        # Back-populate FTS from existing data
        cursor.execute("""
            INSERT INTO episodic_fts(rowid, id, workflow_id, execution_id, event_type, data_json)
            SELECT rowid, id, workflow_id, execution_id, event_type, data_json FROM episodic_memory
        """)

    elif version == 7:
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS episodic_ai AFTER INSERT ON episodic_memory BEGIN
                INSERT INTO episodic_fts(rowid, id, workflow_id, execution_id, event_type, data_json)
                VALUES (new.rowid, new.id, new.workflow_id, new.execution_id, new.event_type, new.data_json);
            END
        """)
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS episodic_ad AFTER DELETE ON episodic_memory BEGIN
                INSERT INTO episodic_fts(episodic_fts, rowid, id, workflow_id, execution_id, event_type, data_json)
                VALUES ('delete', old.rowid, old.id, old.workflow_id, old.execution_id, old.event_type, old.data_json);
            END
        """)
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS episodic_au AFTER UPDATE ON episodic_memory BEGIN
                INSERT INTO episodic_fts(episodic_fts, rowid, id, workflow_id, execution_id, event_type, data_json)
                VALUES ('delete', old.rowid, old.id, old.workflow_id, old.execution_id, old.event_type, old.data_json);
                INSERT INTO episodic_fts(rowid, id, workflow_id, execution_id, event_type, data_json)
                VALUES (new.rowid, new.id, new.workflow_id, new.execution_id, new.event_type, new.data_json);
            END
        """)

    elif version == 8:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_templates_source ON evolved_templates(source_count DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_semantic_created ON semantic_memory(created_at DESC)")

    conn.commit()
