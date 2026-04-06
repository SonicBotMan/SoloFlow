import type { Workflow, WorkflowStep, WorkflowId, StepId } from "../types";
import type {
  IndexedDocument,
  FTSResult,
  VectorSearchResult,
  IndexStats,
} from "./types";
import type { Embedding } from "./types";
import type { Embedder } from "./embedder";
import { serializeEmbedding, deserializeEmbedding, cosineSimilarity } from "./embedder";
import type { RetrievalStore } from "./retriever";

interface StoredRow {
  id: string;
  workflow_id: string;
  step_id: string | null;
  doc_type: string;
  title: string;
  content: string;
  embedding_data: string;
  embedding_dims: number;
  created_at: number;
  updated_at: number;
  metadata: string;
}

export class VectorIndexer implements RetrievalStore {
  private db: Database | null = null;
  private readonly dbPath: string;

  constructor(
    private readonly embedder: Embedder,
    dbPath = ":memory:",
  ) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    if (this.db) return;

    this.db = await this.openDatabase();

    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA synchronous=NORMAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_documents (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        step_id TEXT,
        doc_type TEXT NOT NULL CHECK(doc_type IN ('workflow', 'step')),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding_data TEXT NOT NULL,
        embedding_dims INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vec_workflow ON vector_documents(workflow_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vec_step ON vector_documents(step_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vec_type ON vector_documents(doc_type)
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vector_fts USING fts5(
        id UNINDEXED,
        title,
        content,
        doc_type,
        content='vector_documents',
        content_rowid='rowid'
      )
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS vector_fts_insert AFTER INSERT ON vector_documents BEGIN
        INSERT INTO vector_fts(rowid, id, title, content, doc_type)
        VALUES (new.rowid, new.id, new.title, new.content, new.doc_type);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS vector_fts_delete AFTER DELETE ON vector_documents BEGIN
        INSERT INTO vector_fts(vector_fts, rowid, id, title, content, doc_type)
        VALUES ('delete', old.rowid, old.id, old.title, old.content, old.doc_type);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS vector_fts_update AFTER UPDATE ON vector_documents BEGIN
        INSERT INTO vector_fts(vector_fts, rowid, id, title, content, doc_type)
        VALUES ('delete', old.rowid, old.id, old.title, old.content, old.doc_type);
        INSERT INTO vector_fts(rowid, id, title, content, doc_type)
        VALUES (new.rowid, new.id, new.title, new.content, new.doc_type);
      END
    `);
  }

  async indexWorkflow(workflow: Workflow): Promise<string> {
    this.ensureReady();

    const content = this.workflowToContent(workflow);
    const embedding = await this.embedder.embed(content);
    const id = `wf_${workflow.id}`;

    const now = Date.now();
    const doc: IndexedDocument = {
      id,
      workflowId: workflow.id,
      stepId: undefined,
      docType: "workflow",
      content,
      title: workflow.name,
      embedding: { data: serializeEmbedding(embedding), dimensions: embedding.length },
      createdAt: workflow.createdAt,
      updatedAt: now,
      metadata: { description: workflow.description, state: workflow.state, stepCount: workflow.steps.size },
    };

    this.upsertDocument(doc);
    return id;
  }

  async indexStep(step: WorkflowStep, workflowId: WorkflowId): Promise<string> {
    this.ensureReady();

    const content = this.stepToContent(step);
    const embedding = await this.embedder.embed(content);
    const id = `step_${workflowId}_${step.id}`;

    const now = Date.now();
    const doc: IndexedDocument = {
      id,
      workflowId,
      stepId: step.id,
      docType: "step",
      content,
      title: step.name,
      embedding: { data: serializeEmbedding(embedding), dimensions: embedding.length },
      createdAt: step.startedAt ?? now,
      updatedAt: step.completedAt ?? now,
      metadata: { discipline: step.discipline, state: step.state, config: step.config },
    };

    this.upsertDocument(doc);
    return id;
  }

  async indexWorkflowWithSteps(workflow: Workflow): Promise<string[]> {
    const ids: string[] = [];

    const wfId = await this.indexWorkflow(workflow);
    ids.push(wfId);

    for (const step of workflow.steps.values()) {
      const stepId = await this.indexStep(step, workflow.id);
      ids.push(stepId);
    }

    return ids;
  }

  async deleteByWorkflow(workflowId: WorkflowId): Promise<number> {
    this.ensureReady();
    const result = this.db!.prepare("DELETE FROM vector_documents WHERE workflow_id = ?").run(workflowId);
    return result.changes;
  }

  async deleteByStep(workflowId: WorkflowId, stepId: StepId): Promise<boolean> {
    this.ensureReady();
    const id = `step_${workflowId}_${stepId}`;
    const result = this.db!.prepare("DELETE FROM vector_documents WHERE id = ?").run(id);
    return result.changes > 0;
  }

  getStats(): IndexStats {
    this.ensureReady();
    const total = (this.db!.prepare("SELECT COUNT(*) as count FROM vector_documents").get() as { count: number }).count;
    const workflows = (this.db!.prepare("SELECT COUNT(*) as count FROM vector_documents WHERE doc_type = 'workflow'").get() as { count: number }).count;
    const dims = this.embedder.dimensions;

    return {
      totalDocuments: total,
      workflowDocuments: workflows,
      stepDocuments: total - workflows,
      dimensions: dims,
      provider: this.embedder.providerType,
      estimatedSizeBytes: total * dims * 4,
    };
  }

  async ftsSearch(query: string, limit: number): Promise<FTSResult[]> {
    this.ensureReady();

    const escaped = query.replace(/"/g, '""');
    const ftsQuery = `"${escaped}"`;

    const rows = this.db!.prepare(`
      SELECT vd.id, fts.rank
      FROM vector_fts fts
      JOIN vector_documents vd ON fts.id = vd.id
      WHERE vector_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `).all(ftsQuery, limit) as Array<{ id: string; rank: number }>;

    return rows.map((row, idx) => ({
      id: row.id,
      rank: idx,
      score: 1 / (1 + Math.abs(row.rank)),
    }));
  }

  async vectorSearch(embedding: Embedding, limit: number): Promise<VectorSearchResult[]> {
    this.ensureReady();

    const rows = this.db!.prepare(
      "SELECT id, embedding_data, embedding_dims FROM vector_documents"
    ).all() as Array<{ id: string; embedding_data: string; embedding_dims: number }>;

    const scored: VectorSearchResult[] = [];
    for (const row of rows) {
      const stored = deserializeEmbedding(row.embedding_data, row.embedding_dims);
      const sim = cosineSimilarity(embedding, stored);
      scored.push({ id: row.id, similarity: sim, rank: 0 });
    }

    scored.sort((a, b) => b.similarity - a.similarity);

    for (let i = 0; i < scored.length; i++) {
      scored[i]!.rank = i;
    }

    return scored.slice(0, limit);
  }

  async getDocuments(ids: string[]): Promise<Map<string, IndexedDocument>> {
    this.ensureReady();

    const result = new Map<string, IndexedDocument>();
    if (ids.length === 0) return result;

    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db!.prepare(
      `SELECT * FROM vector_documents WHERE id IN (${placeholders})`
    ).all(...ids) as StoredRow[];

    for (const row of rows) {
      result.set(row.id, this.rowToDoc(row));
    }

    return result;
  }

  async getAllEmbeddings(ids: string[]): Promise<Map<string, Embedding>> {
    this.ensureReady();

    const result = new Map<string, Embedding>();
    if (ids.length === 0) return result;

    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db!.prepare(
      `SELECT id, embedding_data, embedding_dims FROM vector_documents WHERE id IN (${placeholders})`
    ).all(...ids) as Array<{ id: string; embedding_data: string; embedding_dims: number }>;

    for (const row of rows) {
      result.set(row.id, deserializeEmbedding(row.embedding_data, row.embedding_dims));
    }

    return result;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private upsertDocument(doc: IndexedDocument): void {
    this.db!.prepare(`
      INSERT INTO vector_documents (id, workflow_id, step_id, doc_type, title, content, embedding_data, embedding_dims, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        content = excluded.content,
        embedding_data = excluded.embedding_data,
        embedding_dims = excluded.embedding_dims,
        updated_at = excluded.updated_at,
        metadata = excluded.metadata
    `).run(
      doc.id,
      doc.workflowId,
      doc.stepId ?? null,
      doc.docType,
      doc.title,
      doc.content,
      doc.embedding.data,
      doc.embedding.dimensions,
      doc.createdAt,
      doc.updatedAt,
      JSON.stringify(doc.metadata),
    );
  }

  private rowToDoc(row: StoredRow): IndexedDocument {
    return {
      id: row.id,
      workflowId: row.workflow_id as WorkflowId,
      stepId: (row.step_id ?? undefined) as StepId | undefined,
      docType: row.doc_type as "workflow" | "step",
      title: row.title,
      content: row.content,
      embedding: { data: row.embedding_data, dimensions: row.embedding_dims },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: JSON.parse(row.metadata),
    };
  }

  private workflowToContent(workflow: Workflow): string {
    const stepDescriptions = Array.from(workflow.steps.values())
      .map((s) => `${s.name} (${s.discipline}): ${this.configToText(s.config)}`)
      .join("; ");

    return [
      `Workflow: ${workflow.name}`,
      workflow.description,
      `State: ${workflow.state}`,
      `Steps: ${stepDescriptions}`,
    ].filter(Boolean).join("\n");
  }

  private stepToContent(step: WorkflowStep): string {
    return [
      `Step: ${step.name}`,
      `Discipline: ${step.discipline}`,
      `State: ${step.state}`,
      this.configToText(step.config),
      step.error ? `Error: ${step.error}` : "",
      step.result ? `Result: ${JSON.stringify(step.result)}` : "",
    ].filter(Boolean).join("\n");
  }

  private configToText(config: Record<string, unknown>): string {
    try {
      return JSON.stringify(config);
    } catch {
      return String(config);
    }
  }

  private ensureReady(): void {
    if (!this.db) throw new Error("VectorIndexer not initialized. Call init() first.");
  }

  private async openDatabase(): Promise<Database> {
    const { default: Database } = await import("better-sqlite3");
    return new Database(this.dbPath);
  }
}

type Database = ReturnType<typeof import("better-sqlite3")>;
