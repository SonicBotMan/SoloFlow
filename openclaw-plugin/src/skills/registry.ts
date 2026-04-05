import { Database } from "bun:sqlite";
import type { Skill } from "./types";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    steps TEXT NOT NULL,
    discipline TEXT NOT NULL,
    success_rate REAL NOT NULL DEFAULT 0,
    usage_count INTEGER NOT NULL DEFAULT 0,
    installed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    source_workflow_ids TEXT NOT NULL
  );
`;

const INSERT_SQL = `
  INSERT OR REPLACE INTO skills
    (id, name, description, steps, discipline, success_rate, usage_count, installed, created_at, updated_at, source_workflow_ids)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const SELECT_BY_ID_SQL = "SELECT * FROM skills WHERE id = ?;";
const SELECT_ALL_SQL = "SELECT * FROM skills ORDER BY updated_at DESC;";
const SEARCH_SQL =
  "SELECT * FROM skills WHERE name LIKE ? OR description LIKE ? ORDER BY updated_at DESC;";
const UPDATE_INSTALLED_SQL = "UPDATE skills SET installed = ?, updated_at = ? WHERE id = ?;";
const DELETE_SQL = "DELETE FROM skills WHERE id = ?;";

function serializeSkill(skill: Skill): [
  string, string, string, string, string,
  number, number, number, number, number, string,
] {
  return [
    skill.id,
    skill.name,
    skill.description,
    JSON.stringify(skill.steps),
    skill.discipline,
    skill.successRate,
    skill.usageCount,
    skill.installed ? 1 : 0,
    skill.createdAt,
    skill.updatedAt,
    JSON.stringify(skill.sourceWorkflowIds),
  ];
}

function deserializeSkill(row: Record<string, unknown>): Skill {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: row["description"] as string,
    steps: JSON.parse(row["steps"] as string),
    discipline: row["discipline"] as Skill["discipline"],
    successRate: row["success_rate"] as number,
    usageCount: row["usage_count"] as number,
    installed: (row["installed"] as number) === 1,
    createdAt: row["created_at"] as number,
    updatedAt: row["updated_at"] as number,
    sourceWorkflowIds: JSON.parse(row["source_workflow_ids"] as string),
  };
}

export class SkillRegistry {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.exec(CREATE_TABLE_SQL);
  }

  register(skill: Skill): void {
    const params = serializeSkill(skill);
    this.db.run(INSERT_SQL, params);
  }

  get(skillId: string): Skill | undefined {
    const row = this.db.query(SELECT_BY_ID_SQL).get(skillId) as
      | Record<string, unknown>
      | null;
    return row ? deserializeSkill(row) : undefined;
  }

  list(): Skill[] {
    const rows = this.db.query(SELECT_ALL_SQL).all() as Record<string, unknown>[];
    return rows.map(deserializeSkill);
  }

  search(query: string): Skill[] {
    const pattern = `%${query}%`;
    const rows = this.db.query(SEARCH_SQL).all(pattern, pattern) as Record<
      string,
      unknown
    >[];
    return rows.map(deserializeSkill);
  }

  installSkill(skill: Skill): void {
    skill.installed = true;
    skill.updatedAt = Date.now();
    const params = serializeSkill(skill);
    this.db.run(INSERT_SQL, params);
  }

  uninstallSkill(skillId: string): void {
    this.db.run(UPDATE_INSTALLED_SQL, [0, Date.now(), skillId]);
  }

  delete(skillId: string): void {
    this.db.run(DELETE_SQL, [skillId]);
  }

  close(): void {
    this.db.close();
  }
}
