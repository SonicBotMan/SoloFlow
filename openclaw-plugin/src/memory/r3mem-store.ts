/**
 * R³Mem Store — persists decomposed documents, paragraphs, and entities in SQLite.
 */

import type { Entity, EntityType, Paragraph, DocumentLayer } from "./entity-extractor.js";

export interface R3MemStats {
  documentCount: number;
  paragraphCount: number;
  entityCount: number;
  entityTypes: Record<EntityType, number>;
}

export class R3MemStore {
  private db: any; // better-sqlite3 Database

  constructor(db: any) {
    this.db = db;
  }

  /** Initialize tables (called from migrations) */
  static createTables(db: any): void {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS r3mem_documents (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          compressed INTEGER DEFAULT 0
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS r3mem_paragraphs (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES r3mem_documents(id),
          para_index INTEGER NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(document_id, para_index)
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS r3mem_entities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          type TEXT NOT NULL,
          confidence REAL NOT NULL,
          source_paragraph_id TEXT,
          source_document_id TEXT,
          first_seen_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          occurrence_count INTEGER DEFAULT 1,
          UNIQUE(text, type)
        )
      `);

      // Indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_r3mem_para_doc ON r3mem_paragraphs(document_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_r3mem_entity_type ON r3mem_entities(type)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_r3mem_entity_text ON r3mem_entities(text)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_r3mem_entity_doc ON r3mem_entities(source_document_id)`);
    } catch (e: any) {
      // Tables may already exist
    }
  }

  /** Store a decomposed document with its paragraphs and entities */
  storeDecomposition(
    document: DocumentLayer,
    paragraphs: Paragraph[],
    entities: Entity[],
  ): void {
    try {
      // Store document
      this.db.prepare(`
        INSERT OR REPLACE INTO r3mem_documents (id, source_type, content, created_at)
        VALUES (?, ?, ?, ?)
      `).run(document.id, document.sourceType, document.content, document.createdAt);

      // Store paragraphs
      const insertPara = this.db.prepare(`
        INSERT OR REPLACE INTO r3mem_paragraphs (id, document_id, para_index, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const para of paragraphs) {
        insertPara.run(para.id, para.sourceDocumentId, para.index, para.content, para.createdAt);
      }

      // Store entities (upsert — increment occurrence count on conflict)
      const upsertEntity = this.db.prepare(`
        INSERT INTO r3mem_entities (text, type, confidence, source_paragraph_id, source_document_id, first_seen_at, last_seen_at, occurrence_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(text, type) DO UPDATE SET
          confidence = MAX(confidence, excluded.confidence),
          last_seen_at = MAX(last_seen_at, excluded.last_seen_at),
          occurrence_count = occurrence_count + 1
      `);
      const now = Date.now();
      for (const entity of entities) {
        upsertEntity.run(
          entity.text,
          entity.type,
          entity.confidence,
          entity.sourceId,
          entity.sourceId.startsWith("para_") ? entity.sourceId.slice(5).split("_")[0] : document.id,
          now,
          now,
        );
      }
    } catch (e: any) {
      // Non-critical
    }
  }

  /** Query entities with optional filters */
  queryEntities(filter?: {
    types?: EntityType[];
    text?: string;
    minConfidence?: number;
    minOccurrences?: number;
    limit?: number;
  }): Entity[] {
    try {
      let sql = "SELECT * FROM r3mem_entities WHERE 1=1";
      const params: any[] = [];

      if (filter?.types?.length) {
        const placeholders = filter.types.map(() => "?").join(",");
        sql += ` AND type IN (${placeholders})`;
        params.push(...filter.types);
      }
      if (filter?.text) {
        sql += " AND text LIKE ?";
        params.push(`%${filter.text}%`);
      }
      if (filter?.minConfidence) {
        sql += " AND confidence >= ?";
        params.push(filter.minConfidence);
      }
      if (filter?.minOccurrences) {
        sql += " AND occurrence_count >= ?";
        params.push(filter.minOccurrences);
      }

      sql += " ORDER BY occurrence_count DESC, confidence DESC";
      if (filter?.limit) {
        sql += " LIMIT ?";
        params.push(filter.limit);
      }

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map((row: any) => ({
        text: row.text,
        type: row.type as EntityType,
        confidence: row.confidence,
        sourceId: row.source_paragraph_id || row.source_document_id,
      }));
    } catch (e) { console.warn(`error: ${e}`);
      return [];
    }
  }

  /** Get paragraphs for a specific document */
  getParagraphs(documentId: string): Paragraph[] {
    try {
      const rows = this.db.prepare(
        "SELECT * FROM r3mem_paragraphs WHERE document_id = ? ORDER BY para_index"
      ).all(documentId) as any[];
      return rows.map((row: any) => ({
        id: row.id,
        sourceDocumentId: row.document_id,
        index: row.para_index,
        content: row.content,
        createdAt: row.created_at,
      }));
    } catch (e) { console.warn(`error: ${e}`);
      return [];
    }
  }

  /** Get stats */
  getStats(): R3MemStats {
    try {
      const docCount = (this.db.prepare("SELECT COUNT(*) as c FROM r3mem_documents").get() as any).c;
      const paraCount = (this.db.prepare("SELECT COUNT(*) as c FROM r3mem_paragraphs").get() as any).c;
      const entityCount = (this.db.prepare("SELECT COUNT(*) as c FROM r3mem_entities").get() as any).c;
      const typeRows = this.db.prepare(
        "SELECT type, COUNT(*) as c FROM r3mem_entities GROUP BY type"
      ).all() as any[];

      const entityTypes = {} as Record<EntityType, number>;
      for (const row of typeRows) {
        entityTypes[row.type as EntityType] = row.c;
      }

      return { documentCount: docCount, paragraphCount: paraCount, entityCount, entityTypes };
    } catch (e) { console.warn(`error: ${e}`);
      return { documentCount: 0, paragraphCount: 0, entityCount: 0, entityTypes: {} as Record<EntityType, number> };
    }
  }

  /** Delete a document and its paragraphs (entities are kept — they've been learned) */
  deleteDocument(documentId: string): boolean {
    try {
      this.db.prepare("DELETE FROM r3mem_paragraphs WHERE document_id = ?").run(documentId);
      const result = this.db.prepare("DELETE FROM r3mem_documents WHERE id = ?").run(documentId);
      return result.changes > 0;
    } catch (e) { console.warn(`error: ${e}`);
      return false;
    }
  }

  /** Mark document as compressed */
  markCompressed(documentId: string): void {
    try {
      this.db.prepare("UPDATE r3mem_documents SET compressed = 1 WHERE id = ?").run(documentId);
    } catch (e) { console.warn(`non-critical: ${e}`); }
  }
}
