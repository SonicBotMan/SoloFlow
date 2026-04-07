/**
 * SoloFlow — SQLite Migrations
 * Versioned schema migration system for the workflows database.
 */

export const SCHEMA_VERSION = 2;

export function runMigrations(db: any, logger?: { warn: (msg: string) => void }): void {
  const log = logger ?? { warn: (msg: string) => console.warn(`[migrations] ${msg}`) };

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);
  } catch (e: any) {
    log.warn(`failed to create migrations table: ${e.message}`);
    return;
  }

  const applied = new Set(
    (db.prepare("SELECT version FROM _schema_migrations").all() as any[])
      .map((r: any) => r.version)
  );

  const migrations: Array<{ version: number; up: (db: any) => void }> = [
    {
      version: 1,
      up: (db) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            state TEXT NOT NULL DEFAULT 'idle',
            current_steps TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            metadata TEXT NOT NULL DEFAULT '{}'
          );

          CREATE TABLE IF NOT EXISTS workflow_steps (
            workflow_id TEXT NOT NULL,
            step_id TEXT NOT NULL,
            name TEXT NOT NULL,
            discipline TEXT NOT NULL,
            dependencies TEXT NOT NULL DEFAULT '[]',
            config TEXT NOT NULL DEFAULT '{}',
            state TEXT NOT NULL DEFAULT 'pending',
            result TEXT,
            error TEXT,
            started_at INTEGER,
            completed_at INTEGER,
            PRIMARY KEY (workflow_id, step_id),
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS dag_edges (
            workflow_id TEXT NOT NULL,
            edge_from TEXT NOT NULL,
            edge_to TEXT NOT NULL,
            PRIMARY KEY (workflow_id, edge_from, edge_to),
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS dag_layers (
            workflow_id TEXT NOT NULL,
            layer_index INTEGER NOT NULL,
            step_id TEXT NOT NULL,
            PRIMARY KEY (workflow_id, layer_index, step_id),
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS episodic_memory (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            workflow_id TEXT NOT NULL,
            workflow_name TEXT NOT NULL,
            final_state TEXT NOT NULL,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            step_summary TEXT NOT NULL DEFAULT '[]',
            compressed INTEGER NOT NULL DEFAULT 0,
            raw_data TEXT,
            source TEXT NOT NULL DEFAULT 'workflow_execution',
            tags TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS evolved_templates (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('workflow', 'skill')),
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            steps TEXT,
            pattern TEXT,
            sources TEXT NOT NULL DEFAULT '[]',
            use_count INTEGER NOT NULL DEFAULT 0,
            success_count INTEGER NOT NULL DEFAULT 0,
            fail_count INTEGER NOT NULL DEFAULT 0,
            last_used_at INTEGER,
            last_iterated_at INTEGER,
            quality_score REAL NOT NULL DEFAULT 0.5,
            version INTEGER NOT NULL DEFAULT 1,
            tags TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_evolved_type ON evolved_templates(type);
          CREATE INDEX IF NOT EXISTS idx_evolved_quality ON evolved_templates(quality_score);
        `);
        db.prepare("INSERT OR IGNORE INTO _schema_migrations (version, applied_at) VALUES (?, ?)").run(1, Date.now());
      }
    },
    {
      version: 2,
      up: (db) => {
        const columns: Array<[string, string]> = [
          ["triggers", "TEXT NOT NULL DEFAULT '[]'"],
          ["scope", "TEXT NOT NULL DEFAULT 'general'"],
          ["prerequisites", "TEXT NOT NULL DEFAULT '[]'"],
          ["tools_required", "TEXT NOT NULL DEFAULT '[]'"],
          ["tools_optional", "TEXT NOT NULL DEFAULT '[]'"],
          ["disciplines_used", "TEXT NOT NULL DEFAULT '[]'"],
          ["estimated_steps", "INTEGER NOT NULL DEFAULT 0"],
          ["estimated_duration", "TEXT NOT NULL DEFAULT ''"],
          ["examples", "TEXT NOT NULL DEFAULT '[]'"],
        ];
        for (const [col, def] of columns) {
          try {
            db.exec(`ALTER TABLE evolved_templates ADD COLUMN ${col} ${def}`);
          } catch (e: any) {
            if (!e.message?.includes("duplicate column name")) {
              log.warn(`migration v2: failed to add column ${col}: ${e.message}`);
            }
          }
        }
        db.prepare("INSERT OR IGNORE INTO _schema_migrations (version, applied_at) VALUES (?, ?)").run(2, Date.now());
      }
    }
  ];

  for (const m of migrations) {
    if (!applied.has(m.version)) {
      try {
        m.up(db);
      } catch (e: any) {
        log.warn(`migration v${m.version} failed: ${e.message}`);
      }
    }
  }
}
