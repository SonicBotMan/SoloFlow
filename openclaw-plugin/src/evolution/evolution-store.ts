/**
 * SoloFlow — Evolution Store
 * SQLite persistence for evolved templates and skill patterns.
 * Shares the same database connection as SqliteStore.
 */

import type { EvolvedTemplate, TemplateType } from "./types.js";

export class EvolutionStore {
  private db: any; // better-sqlite3 Database

  constructor(db: any) {
    this.db = db;
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
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
  }

  private rowToTemplate(row: any): EvolvedTemplate {
    return {
      id: row.id,
      type: row.type as TemplateType,
      name: row.name,
      description: row.description,
      steps: row.steps ? JSON.parse(row.steps) : undefined,
      pattern: row.pattern ?? undefined,
      sources: JSON.parse(row.sources),
      useCount: row.use_count,
      successCount: row.success_count,
      failCount: row.fail_count,
      lastUsedAt: row.last_used_at,
      lastIteratedAt: row.last_iterated_at,
      qualityScore: row.quality_score,
      version: row.version,
      tags: JSON.parse(row.tags),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  save(template: EvolvedTemplate): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO evolved_templates
      (id, type, name, description, steps, pattern, sources,
       use_count, success_count, fail_count, last_used_at, last_iterated_at,
       quality_score, version, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      template.id,
      template.type,
      template.name,
      template.description,
      template.steps ? JSON.stringify(template.steps) : null,
      template.pattern ?? null,
      JSON.stringify(template.sources),
      template.useCount,
      template.successCount,
      template.failCount,
      template.lastUsedAt,
      template.lastIteratedAt,
      template.qualityScore,
      template.version,
      JSON.stringify(template.tags),
      template.createdAt,
      now,
    );
  }

  getById(id: string): EvolvedTemplate | null {
    const row = this.db.prepare("SELECT * FROM evolved_templates WHERE id = ?").get(id);
    return row ? this.rowToTemplate(row) : null;
  }

  getAll(type?: TemplateType): EvolvedTemplate[] {
    const rows = type
      ? this.db.prepare("SELECT * FROM evolved_templates WHERE type = ? ORDER BY quality_score DESC, created_at DESC").all(type)
      : this.db.prepare("SELECT * FROM evolved_templates ORDER BY quality_score DESC, created_at DESC").all();
    return (rows as any[]).map(r => this.rowToTemplate(r));
  }

  search(query: string, type?: TemplateType, limit: number = 20): EvolvedTemplate[] {
    const pattern = `%${query}%`;
    let sql = "SELECT * FROM evolved_templates WHERE (name LIKE ? OR description LIKE ? OR tags LIKE ?)";
    const params: any[] = [pattern, pattern, pattern];
    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }
    sql += " ORDER BY quality_score DESC, created_at DESC LIMIT ?";
    params.push(limit);
    return (this.db.prepare(sql).all(...params) as any[]).map(r => this.rowToTemplate(r));
  }

  recordUsage(id: string, success: boolean): void {
    const t = this.getById(id);
    if (!t) return;
    const now = Date.now();
    const useCount = t.useCount + 1;
    const successCount = t.successCount + (success ? 1 : 0);
    const failCount = t.failCount + (success ? 0 : 1);
    const qualityScore = useCount > 0 ? successCount / useCount : 0.5;
    this.db.prepare(`
      UPDATE evolved_templates SET
        use_count = ?, success_count = ?, fail_count = ?,
        last_used_at = ?, quality_score = ?, updated_at = ?
      WHERE id = ?
    `).run(useCount, successCount, failCount, now, qualityScore, now, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM evolved_templates WHERE id = ?").run(id);
  }

  count(type?: TemplateType): number {
    const row = type
      ? this.db.prepare("SELECT COUNT(*) as cnt FROM evolved_templates WHERE type = ?").get(type)
      : this.db.prepare("SELECT COUNT(*) as cnt FROM evolved_templates").get();
    return (row as any).cnt;
  }
}
