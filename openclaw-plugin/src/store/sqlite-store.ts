/**
 * SoloFlow — SQLite Workflow Store
 * Persists workflows to SQLite so they survive gateway restarts.
 */

import Database from "better-sqlite3";
import type { WorkflowId, StepId, Workflow, WorkflowStep, WorkflowState, DAG, DAGEdge, DAGNode } from "../types.js";
import path from "node:path";
import fs from "node:fs";

export class SqliteStore {
  private readonly db: Database.Database;
  private readonly cache = new Map<WorkflowId, Workflow>();

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "workflows.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
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
    `);
  }

  /** Load all workflows from SQLite into memory cache */
  loadAll(): void {
    const rows = this.db.prepare("SELECT * FROM workflows").all() as any[];
    for (const row of rows) {
      const wf = this.rowToWorkflow(row);
      this.cache.set(wf.id, wf);
    }
  }

  private rowToWorkflow(row: any): Workflow {
    const stepRows = this.db.prepare("SELECT * FROM workflow_steps WHERE workflow_id = ?").all(row.id) as any[];
    const steps = new Map<StepId, WorkflowStep>();
    for (const sr of stepRows) {
      steps.set(sr.step_id as StepId, {
        id: sr.step_id as StepId,
        name: sr.name,
        discipline: sr.discipline as any,
        dependencies: JSON.parse(sr.dependencies),
        config: JSON.parse(sr.config),
        state: sr.state as any,
        result: sr.result !== null ? JSON.parse(sr.result) : undefined,
        error: sr.error ?? undefined,
        startedAt: sr.started_at ?? undefined,
        completedAt: sr.completed_at ?? undefined,
      });
    }

    const edgeRows = this.db.prepare("SELECT * FROM dag_edges WHERE workflow_id = ?").all(row.id) as any[];
    const edges: DAGEdge[] = edgeRows.map(er => ({ from: er.edge_from as StepId, to: er.edge_to as StepId }));

    const layerRows = this.db.prepare("SELECT * FROM dag_layers WHERE workflow_id = ? ORDER BY layer_index, step_id").all(row.id) as any[];
    const layers: StepId[][] = [];
    let currentLayer: StepId[] = [];
    let currentLayerIndex = -1;
    for (const lr of layerRows) {
      if (lr.layer_index !== currentLayerIndex) {
        if (currentLayer.length > 0) layers.push(currentLayer);
        currentLayer = [];
        currentLayerIndex = lr.layer_index;
      }
      currentLayer.push(lr.step_id as StepId);
    }
    if (currentLayer.length > 0) layers.push(currentLayer);

    const nodes = new Map<StepId, DAGNode>();
    for (const [id, step] of steps) {
      nodes.set(id, {
        id,
        dependencies: step.dependencies,
        discipline: step.discipline,
        action: (step.config as Record<string, unknown>)["prompt"] as string ?? step.name,
      });
    }

    const dag: DAG = { nodes, edges, layers };

    return {
      id: row.id as WorkflowId,
      name: row.name,
      description: row.description,
      steps,
      dag,
      state: row.state as WorkflowState,
      currentSteps: JSON.parse(row.current_steps),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: JSON.parse(row.metadata),
    };
  }

  get(id: WorkflowId): Workflow | undefined {
    return this.cache.get(id);
  }

  set(id: WorkflowId, workflow: Workflow): void {
    this.cache.set(id, workflow);
    this.persist(workflow);
  }

  delete(id: WorkflowId): boolean {
    this.cache.delete(id);
    this.db.prepare("DELETE FROM workflows WHERE id = ?").run(id);
    return true;
  }

  has(id: WorkflowId): boolean {
    return this.cache.has(id);
  }

  values(): IterableIterator<Workflow> {
    return this.cache.values();
  }

  get size(): number {
    return this.cache.size;
  }

  [Symbol.iterator](): Iterator<[WorkflowId, Workflow]> {
    return this.cache[Symbol.iterator]();
  }

  private persist(wf: Workflow): void {
    const existing = this.db.prepare("SELECT id FROM workflows WHERE id = ?").get(wf.id);

    if (existing) {
      this.db.prepare(`
        UPDATE workflows SET name = ?, description = ?, state = ?, current_steps = ?,
        created_at = ?, updated_at = ?, metadata = ? WHERE id = ?
      `).run(
        wf.name, wf.description, wf.state, JSON.stringify(wf.currentSteps),
        wf.createdAt, wf.updatedAt, JSON.stringify(wf.metadata), wf.id
      );
      this.db.prepare("DELETE FROM workflow_steps WHERE workflow_id = ?").run(wf.id);
      this.db.prepare("DELETE FROM dag_edges WHERE workflow_id = ?").run(wf.id);
      this.db.prepare("DELETE FROM dag_layers WHERE workflow_id = ?").run(wf.id);
    } else {
      this.db.prepare(`
        INSERT INTO workflows (id, name, description, state, current_steps, created_at, updated_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        wf.id, wf.name, wf.description, wf.state, JSON.stringify(wf.currentSteps),
        wf.createdAt, wf.updatedAt, JSON.stringify(wf.metadata)
      );
    }

    const insertStep = this.db.prepare(`
      INSERT INTO workflow_steps (workflow_id, step_id, name, discipline, dependencies, config, state, result, error, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const step of wf.steps.values()) {
      insertStep.run(
        wf.id, step.id, step.name, step.discipline,
        JSON.stringify(step.dependencies), JSON.stringify(step.config),
        step.state,
        step.result !== undefined ? JSON.stringify(step.result) : null,
        step.error ?? null,
        step.startedAt ?? null,
        step.completedAt ?? null,
      );
    }

    const insertEdge = this.db.prepare("INSERT INTO dag_edges (workflow_id, edge_from, edge_to) VALUES (?, ?, ?)");
    for (const edge of wf.dag.edges) {
      insertEdge.run(wf.id, edge.from, edge.to);
    }

    const insertLayer = this.db.prepare("INSERT INTO dag_layers (workflow_id, layer_index, step_id) VALUES (?, ?, ?)");
    wf.dag.layers.forEach((layer, idx) => {
      for (const stepId of layer) {
        insertLayer.run(wf.id, idx, stepId);
      }
    });
  }

  close(): void {
    this.db.close();
  }
}
