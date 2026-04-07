import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface ScannedSkill {
  id: string;
  name: string;
  description: string;
  location: string;
  triggers: string[];
  tools: string[];
  examples: string[];
  tags: string[];
  version: string;
  installedAt: number;
}

export class SkillInventory {
  private db: any;
  private skillDirs: string[];

  constructor(db: any) {
    this.db = db;
    this.skillDirs = [
      path.join(os.homedir(), ".openclaw", "workspace", "skills"),
      path.join(os.homedir(), ".npm-global", "lib", "node_modules", "openclaw", "skills"),
    ];
  }

  /** Scan all installed skills and update inventory */
  scan(): { added: number; updated: number; removed: number } {
    const scanned = this.scanFilesystem();
    const existing = new Map(
      (this.db.prepare("SELECT id, name, location FROM skills_inventory").all() as any[])
        .map((r: any) => [r.id, r])
    );

    let added = 0, updated = 0;
    const now = Date.now();

    for (const skill of scanned) {
      const existingSkill = existing.get(skill.id);
      if (!existingSkill) {
        this.db.prepare(`
          INSERT INTO skills_inventory (id, name, description, location, triggers, tools, examples, tags, last_scanned_at, version, installed_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          skill.id, skill.name, skill.description, skill.location,
          JSON.stringify(skill.triggers), JSON.stringify(skill.tools),
          JSON.stringify(skill.examples), JSON.stringify(skill.tags),
          now, skill.version, skill.installedAt, now
        );
        added++;
      } else if (existingSkill.location !== skill.location || existingSkill.name !== skill.name) {
        this.db.prepare(`
          UPDATE skills_inventory SET name=?, description=?, location=?, triggers=?, tools=?, examples=?, tags=?, last_scanned_at=?, version=?, updated_at=? WHERE id=?
        `).run(
          skill.name, skill.description, skill.location,
          JSON.stringify(skill.triggers), JSON.stringify(skill.tools),
          JSON.stringify(skill.examples), JSON.stringify(skill.tags),
          now, skill.version, now, skill.id
        );
        updated++;
      } else {
        this.db.prepare("UPDATE skills_inventory SET last_scanned_at=? WHERE id=?").run(now, skill.id);
      }
    }

    // Remove skills no longer on filesystem
    const scannedIds = new Set(scanned.map(s => s.id));
    const removed = (this.db.prepare("SELECT id FROM skills_inventory").all() as any[])
      .filter((r: any) => !scannedIds.has(r.id)).length;
    if (scanned.length > 0) {
      this.db.prepare(`DELETE FROM skills_inventory WHERE id NOT IN (${scanned.map(() => "?").join(",")})`).run(...scanned.map((s: any) => s.id));
    }

    return { added, updated, removed };
  }

  private scanFilesystem(): ScannedSkill[] {
    const skills: ScannedSkill[] = [];
    for (const dir of this.skillDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillPath = path.join(dir, entry.name);
          const skill = this.parseSkillDir(skillPath, entry.name);
          if (skill) skills.push(skill);
        }
      } catch (e) { console.warn(`skip inaccessible dirs: ${e}`); }
    }
    return skills;
  }

  private parseSkillDir(dir: string, fallbackName: string): ScannedSkill | null {
    const skillFile = path.join(dir, "SKILL.md");
    if (!fs.existsSync(skillFile)) return null;

    try {
      const content = fs.readFileSync(skillFile, "utf-8");
      const name = this.extractFrontmatter(content, "name") ?? fallbackName;
      const description = this.extractFrontmatter(content, "description") ?? "";
      const triggers = this.parseListField(this.extractFrontmatter(content, "triggers") ?? "");
      const tools = this.parseListField(this.extractFrontmatter(content, "tools") ?? "");
      const tags = this.parseListField(this.extractFrontmatter(content, "tags") ?? "");
      const examples = this.parseExamples(content);
      const version = this.extractFrontmatter(content, "version") ?? "1.0.0";

      const stat = fs.statSync(dir);
      return {
        id: this.normalizeId(name),
        name,
        description,
        location: dir,
        triggers,
        tools,
        examples,
        tags,
        version,
        installedAt: Math.floor(stat.birthtimeMs),
      };
    } catch (e) { console.warn(`error: ${e}`);
      return null;
    }
  }

  private extractFrontmatter(content: string, key: string): string | null {
    const match = content.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "m"));
    return match?.[1]?.trim() ?? null;
  }

  private parseListField(value: string): string[] {
    if (!value) return [];
    return value.split(",").map(s => s.trim()).filter(Boolean);
  }

  private parseExamples(content: string): string[] {
    const examples: string[] = [];
    const usageMatch = content.match(/##? [Uu]sage[\n\r]([\s\S]*?)(?=\n##|\n#|$)/);
    if (usageMatch) {
      const lines = usageMatch[1]!.split("\n").filter(l => l.trim());
      examples.push(...lines.slice(0, 3));
    }
    return examples;
  }

  private normalizeId(name: string): string {
    return `sk_inv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)}`;
  }

  /** Record a skill/tool usage event */
  recordUsage(skillId: string, toolName: string, success: boolean, durationMs?: number): void {
    try {
      this.db.prepare(`
        INSERT INTO skill_usage (skill_id, tool_name, success, duration_ms, called_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(skillId, toolName, success ? 1 : 0, durationMs ?? null, Date.now());
    } catch (e) { console.warn(`non-critical: ${e}`); }
  }

  /** Get usage stats for a skill */
  getUsageStats(skillId: string, days: number = 30): any {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.db.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failures,
        AVG(duration_ms) as avg_duration
      FROM skill_usage
      WHERE skill_id = ? AND called_at > ?
    `).get(skillId, since);
  }

  /** Get recently used skills */
  getRecentlyUsed(limit: number = 20): any[] {
    return this.db.prepare(`
      SELECT DISTINCT skill_id, MAX(called_at) as last_used, COUNT(*) as call_count
      FROM skill_usage
      GROUP BY skill_id
      ORDER BY last_used DESC
      LIMIT ?
    `).all(limit);
  }

  /** Get skill combination patterns (skills used in same time window) */
  getCombinationPatterns(windowMs: number = 300000): any[] {
    const rows = this.db.prepare(`
      SELECT skill_id, called_at FROM skill_usage ORDER BY called_at
    `).all() as any[];

    const combinations: Map<string, number> = new Map();
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length && rows[j].called_at - rows[i].called_at <= windowMs; j++) {
        const pair = [rows[i].skill_id, rows[j].skill_id].sort().join("+");
        combinations.set(pair, (combinations.get(pair) ?? 0) + 1);
      }
    }

    return Array.from(combinations.entries())
      .filter(([, count]) => count >= 2)
      .map(([pair, count]) => ({ skills: pair.split("+"), count }))
      .sort((a, b) => b.count - a.count);
  }

  getAll(): any[] {
    return (this.db.prepare("SELECT * FROM skills_inventory ORDER BY name").all() as any[])
      .map((r: any) => ({
        ...r,
        triggers: JSON.parse(r.triggers || "[]"),
        tools: JSON.parse(r.tools || "[]"),
        examples: JSON.parse(r.examples || "[]"),
        tags: JSON.parse(r.tags || "[]"),
      }));
  }
}
