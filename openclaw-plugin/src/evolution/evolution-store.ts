/**
 * SoloFlow — Evolution Store
 * SQLite persistence for evolved templates and skill patterns.
 * Shares the same database connection as SqliteStore.
 * Schema is managed by migrations.ts — this store only reads/writes.
 */

import type { EvolvedTemplate, TemplateType } from "./types.js";

export class EvolutionStore {
  private db: any; // better-sqlite3 Database

  constructor(db: any) {
    this.db = db;
    // No migrate() here — schema is managed by runMigrations() in migrations.ts
  }

  private rowToTemplate(row: any): EvolvedTemplate {
    return {
      id: row.id,
      type: row.type as TemplateType,
      name: row.name,
      description: row.description,
      triggers: row.triggers ? JSON.parse(row.triggers) : [],
      scope: row.scope ?? "general",
      prerequisites: row.prerequisites ? JSON.parse(row.prerequisites) : [],
      tools_required: row.tools_required ? JSON.parse(row.tools_required) : [],
      tools_optional: row.tools_optional ? JSON.parse(row.tools_optional) : [],
      disciplines_used: row.disciplines_used ? JSON.parse(row.disciplines_used) : [],
      estimated_steps: row.estimated_steps ?? 0,
      estimated_duration: row.estimated_duration ?? "",
      examples: row.examples ? JSON.parse(row.examples) : [],
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
       quality_score, version, tags, created_at, updated_at,
       triggers, scope, prerequisites, tools_required, tools_optional,
       disciplines_used, estimated_steps, estimated_duration, examples)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      JSON.stringify(template.triggers),
      template.scope,
      JSON.stringify(template.prerequisites),
      JSON.stringify(template.tools_required),
      JSON.stringify(template.tools_optional),
      JSON.stringify(template.disciplines_used),
      template.estimated_steps,
      template.estimated_duration,
      JSON.stringify(template.examples),
    );
  }

  getById(id: string): EvolvedTemplate | null {
    try {
      const row = this.db.prepare("SELECT * FROM evolved_templates WHERE id = ?").get(id);
      return row ? this.rowToTemplate(row) : null;
    } catch (e) { console.warn(`error: ${e}`);
      return null;
    }
  }

  getAll(type?: TemplateType): EvolvedTemplate[] {
    try {
      const rows = type
        ? this.db.prepare("SELECT * FROM evolved_templates WHERE type = ? ORDER BY quality_score DESC, created_at DESC").all(type)
        : this.db.prepare("SELECT * FROM evolved_templates ORDER BY quality_score DESC, created_at DESC").all();
      return (rows as any[]).map(r => this.rowToTemplate(r));
    } catch (e) { console.warn(`error: ${e}`);
      return [];
    }
  }

  search(query: string, type?: TemplateType, limit: number = 20): EvolvedTemplate[] {
    try {
      const pattern = `%${query}%`;
      let sql = "SELECT * FROM evolved_templates WHERE (name LIKE ? OR description LIKE ? OR tags LIKE ? OR triggers LIKE ? OR scope LIKE ?)";
      const params: any[] = [pattern, pattern, pattern, pattern, pattern];
      if (type) {
        sql += " AND type = ?";
        params.push(type);
      }
      sql += " ORDER BY quality_score DESC, created_at DESC LIMIT ?";
      params.push(limit);
      return (this.db.prepare(sql).all(...params) as any[]).map(r => this.rowToTemplate(r));
    } catch (e) { console.warn(`error: ${e}`);
      return [];
    }
  }

  recordUsage(id: string, success: boolean): void {
    try {
      const t = this.getById(id);
      if (!t) return;
      const now = Date.now();
      const useCount = t.useCount + 1;
      const successCount = t.successCount + (success ? 1 : 0);
      const failCount = t.failCount + (success ? 0 : 1);
      // Weighted quality: 30% initial + 50% success rate + 20% usage frequency
      const initialQuality = t.qualityScore ?? 0.5;
      const successRate = useCount > 0 ? successCount / useCount : 0;
      const usageFactor = Math.log(1 + useCount) / Math.log(1 + 10);
      const qualityScore = 0.3 * initialQuality + 0.5 * successRate + 0.2 * usageFactor;
      this.db.prepare(`
        UPDATE evolved_templates SET
          use_count = ?, success_count = ?, fail_count = ?,
          last_used_at = ?, quality_score = ?, updated_at = ?
        WHERE id = ?
      `).run(useCount, successCount, failCount, now, qualityScore, now, id);
    } catch (e) { console.warn(`error: ${e}`);
      // non-critical
    }
  }

  delete(id: string): void {
    try {
      this.db.prepare("DELETE FROM evolved_templates WHERE id = ?").run(id);
    } catch (e) { console.warn(`error: ${e}`);
      // non-critical
    }
  }

  bumpVersion(id: string, updated: Partial<EvolvedTemplate>): void {
    try {
      const t = this.getById(id);
      if (!t) return;
      const now = Date.now();
      const newVersion = (t.version ?? 1) + 1;

      // Merge triggers: union dedup
      const mergedTriggers = [...new Set([...t.triggers, ...(updated.triggers ?? [])])];
      // Merge examples: union dedup by input
      const existingInputs = new Set(t.examples.map(e => e.input));
      const mergedExamples = [...t.examples];
      for (const ex of (updated.examples ?? [])) {
        if (!existingInputs.has(ex.input)) {
          mergedExamples.push(ex);
          existingInputs.add(ex.input);
        }
      }

      this.db.prepare(`
        UPDATE evolved_templates SET
          version = ?, description = ?, pattern = ?, quality_score = ?,
          steps = ?, tags = ?, updated_at = ?,
          triggers = ?, scope = ?, prerequisites = ?,
          tools_required = ?, tools_optional = ?, disciplines_used = ?,
          estimated_steps = ?, estimated_duration = ?, examples = ?
        WHERE id = ?
      `).run(
        newVersion,
        updated.description ?? t.description,
        updated.pattern ?? t.pattern ?? null,
        Math.max(t.qualityScore ?? 0.5, updated.qualityScore ?? 0.5),
        updated.steps ? JSON.stringify(updated.steps) : (t.steps ? JSON.stringify(t.steps) : null),
        updated.tags ? JSON.stringify(updated.tags) : (t.tags ? JSON.stringify(t.tags) : null),
        now,
        JSON.stringify(mergedTriggers),
        updated.scope ?? t.scope,
        JSON.stringify([...new Set([...t.prerequisites, ...(updated.prerequisites ?? [])])]),
        JSON.stringify([...new Set([...t.tools_required, ...(updated.tools_required ?? [])])]),
        JSON.stringify([...new Set([...t.tools_optional, ...(updated.tools_optional ?? [])])]),
        JSON.stringify([...new Set([...t.disciplines_used, ...(updated.disciplines_used ?? [])])]),
        updated.estimated_steps ?? t.estimated_steps,
        updated.estimated_duration ?? t.estimated_duration,
        JSON.stringify(mergedExamples),
        id
      );
    } catch (e) { console.warn(`error: ${e}`);
      // non-critical
    }
  }

  count(type?: TemplateType): number {
    try {
      const row = type
        ? this.db.prepare("SELECT COUNT(*) as cnt FROM evolved_templates WHERE type = ?").get(type)
        : this.db.prepare("SELECT COUNT(*) as cnt FROM evolved_templates").get();
      return (row as any).cnt;
    } catch (e) { console.warn(`error: ${e}`);
      return 0;
    }
  }
}
