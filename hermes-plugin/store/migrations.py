"""SQLite schema migrations for SoloFlow."""

import sqlite3

CURRENT_SCHEMA_VERSION = 8


def migrate(conn: sqlite3.Connection) -> None:
    """Run incremental migrations from current version to target version.

    Each migration runs in its own transaction.
    Connection must have WAL mode and busy_timeout already set.
    """
    # Ensure _soloflow_meta exists first
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _soloflow_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # Get current version
    cursor = conn.execute("SELECT value FROM _soloflow_meta WHERE key = 'schema_version'")
    row = cursor.fetchone()
    current_version = int(row[0]) if row else 0

    if current_version == CURRENT_SCHEMA_VERSION:
        return

    # Run migrations incrementally
    for version in range(current_version + 1, CURRENT_SCHEMA_VERSION + 1):
        _run_migration(conn, version)

    # Update version in meta
    conn.execute(
        "INSERT OR REPLACE INTO _soloflow_meta (key, value) VALUES ('schema_version', ?)",
        (str(CURRENT_SCHEMA_VERSION),)
    )
    conn.commit()


def _run_migration(conn: sqlite3.Connection, version: int) -> None:
    """Execute a single migration version within a transaction."""
    cursor = conn.cursor()

    if version == 1:
        # Initial schema: workflows, workflow_steps, dag_edges, dag_layers
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
                PRIMARY KEY (workflow_id, from_step, to_step)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dag_layers (
                workflow_id TEXT NOT NULL,
                layer_index INTEGER NOT NULL,
                step_ids_json TEXT NOT NULL,
                PRIMARY KEY (workflow_id, layer_index)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_steps_workflow ON workflow_steps(workflow_id)")

    elif version == 2:
        # Add episodic_memory table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS episodic_memory (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                execution_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                data_json TEXT NOT NULL,
                timestamp REAL NOT NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_workflow ON episodic_memory(workflow_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_execution ON episodic_memory(execution_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_timestamp ON episodic_memory(timestamp)")

    elif version == 3:
        # Add FTS5 virtual table for episodic_memory search
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(
                id,
                workflow_id,
                event_type,
                data_json,
                content='episodic_memory',
                content_rowid='rowid'
            )
        """)

    elif version == 4:
        # Add evolved_templates table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS evolved_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                template_json TEXT NOT NULL,
                source_count INTEGER DEFAULT 0,
                created_at REAL NOT NULL
            )
        """)

    elif version == 5:
        # Add skills_inventory table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS skills_inventory (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT DEFAULT '',
                metadata_json TEXT DEFAULT '{}'
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_skills_category ON skills_inventory(category)")

    elif version == 6:
        # Ensure indexes exist ( idempotent catch-up )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_steps_workflow ON workflow_steps(workflow_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_workflow ON episodic_memory(workflow_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_execution ON episodic_memory(execution_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_episodic_timestamp ON episodic_memory(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_skills_category ON skills_inventory(category)")

    elif version == 7:
        # Add triggers to keep episodic_fts in sync with episodic_memory
        # These triggers keep the FTS index updated on insert/update/delete
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS episodic_ai AFTER INSERT ON episodic_memory BEGIN
                INSERT INTO episodic_fts(rowid, id, workflow_id, event_type, data_json)
                VALUES (NEW.rowid, NEW.id, NEW.workflow_id, NEW.event_type, NEW.data_json);
            END
        """)
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS episodic_ad AFTER DELETE ON episodic_memory BEGIN
                INSERT INTO episodic_fts(episodic_fts, rowid, id, workflow_id, event_type, data_json)
                VALUES('delete', OLD.rowid, OLD.id, OLD.workflow_id, OLD.event_type, OLD.data_json);
            END
        """)
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS episodic_au AFTER UPDATE ON episodic_memory BEGIN
                INSERT INTO episodic_fts(episodic_fts, rowid, id, workflow_id, event_type, data_json)
                VALUES('delete', OLD.rowid, OLD.id, OLD.workflow_id, OLD.event_type, OLD.data_json);
                INSERT INTO episodic_fts(rowid, id, workflow_id, event_type, data_json)
                VALUES (NEW.rowid, NEW.id, NEW.workflow_id, NEW.event_type, NEW.data_json);
            END
        """)

    elif version == 8:
        # Change workflow_steps primary key from (id) to (workflow_id, id)
        # SQLite doesn't support ALTER TABLE ... ALTER PRIMARY KEY, so we rebuild
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS workflow_steps_new (
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
                layer INTEGER DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                PRIMARY KEY (workflow_id, id),
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            INSERT INTO workflow_steps_new
                (id, workflow_id, name, description, discipline, prompt,
                 state, result, error, retry_count, max_retries, timeout_seconds,
                 layer, created_at, updated_at)
            SELECT id, workflow_id, name, description, discipline, prompt,
                   state, result, error, retry_count, max_retries, timeout_seconds,
                   0, created_at, updated_at
            FROM workflow_steps
        """)
        cursor.execute("DROP TABLE workflow_steps")
        cursor.execute("ALTER TABLE workflow_steps_new RENAME TO workflow_steps")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_steps_workflow ON workflow_steps(workflow_id)")

    conn.commit()


def _migrate(conn):
    """Run all pending migrations."""
    cursor = conn.cursor()

    # Ensure migrations tracking table exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY
        )
    """)
    current = cursor.execute("SELECT MAX(version) FROM _migrations").fetchone()[0] or 0

    version = current + 1
    while True:
        try:
            migrate_version(cursor, version)
            conn.commit()
            current = version
            version += 1
        except Exception:
            break

    return current