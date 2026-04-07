/**
 * R³Mem Entity Extractor — extracts named entities from text
 * using regex rules + optional GLM-5 LLM assistance.
 *
 * Entity types: person, project, tool, concept, location, organization, date
 */

export interface Entity {
  /** Extracted entity text */
  text: string;
  /** Entity type */
  type: EntityType;
  /** Confidence 0-1 */
  confidence: number;
  /** Source paragraph ID */
  sourceId: string;
}

export type EntityType = "person" | "project" | "tool" | "concept" | "location" | "organization" | "date" | "other";

export interface EntityExtractionResult {
  entities: Entity[];
  method: "regex" | "llm" | "combined";
  durationMs: number;
}

export interface Paragraph {
  id: string;
  sourceDocumentId: string;
  /** 1-based paragraph index */
  index: number;
  content: string;
  /** Timestamp when this paragraph was created */
  createdAt: number;
  /** Extracted entities (lazy populated) */
  entities?: Entity[];
}

export interface DocumentLayer {
  id: string;
  /** Raw text content */
  content: string;
  /** Source type */
  sourceType: "workflow_result" | "conversation" | "note" | "compressed";
  createdAt: number;
}

export class EntityExtractor {
  // Regex patterns for common entity types
  private readonly patterns: Map<EntityType, RegExp[]> = new Map();
  private llmExtractor: ((text: string) => Promise<Entity[]>) | null = null;

  constructor() {
    this.initPatterns();
  }

  /** Set an optional LLM-based entity extractor */
  setLLMExtractor(fn: (text: string) => Promise<Entity[]>): void {
    this.llmExtractor = fn;
  }

  /**
   * Decompose a document into paragraphs + entities (R³Mem pipeline).
   * Returns paragraphs with their extracted entities.
   */
  async decompose(document: DocumentLayer): Promise<{
    paragraphs: Paragraph[];
    entities: Entity[];
    stats: { paragraphCount: number; entityCount: number; method: string; durationMs: number };
  }> {
    const start = Date.now();

    // Step 1: Split document into paragraphs
    const paragraphs = this.splitIntoParagraphs(document);

    // Step 2: Extract entities from each paragraph
    let allEntities: Entity[] = [];
    let method = "regex";

    for (const para of paragraphs) {
      // Always run regex extraction
      const regexEntities = this.extractByRegex(para.content, para.id);

      // Optionally enhance with LLM
      let llmEntities: Entity[] = [];
      if (this.llmExtractor && para.content.length > 50) {
        try {
          llmEntities = await this.llmExtractor(para.content);
          method = "combined";
        } catch (e) { console.warn(`error: ${e}`);
          // LLM not available, regex only
        }
      }

      // Deduplicate: prefer regex for known types, add LLM-only entities
      const regexTexts = new Set(regexEntities.map(e => e.text.toLowerCase()));
      for (const re of regexEntities) {
        allEntities.push(re);
      }
      for (const le of llmEntities) {
        if (!regexTexts.has(le.text.toLowerCase())) {
          allEntities.push({ ...le, confidence: le.confidence * 0.8 }); // Slightly lower confidence for LLM-only
        }
      }

      para.entities = [...regexEntities, ...llmEntities.filter(
        le => !regexTexts.has(le.text.toLowerCase())
      )];
    }

    // Deduplicate entities across paragraphs (same text + type)
    const seen = new Map<string, Entity>();
    for (const entity of allEntities) {
      const key = `${entity.type}:${entity.text.toLowerCase()}`;
      const existing = seen.get(key);
      if (!existing || entity.confidence > existing.confidence) {
        seen.set(key, entity);
      }
    }

    const dedupedEntities = Array.from(seen.values());

    return {
      paragraphs,
      entities: dedupedEntities,
      stats: {
        paragraphCount: paragraphs.length,
        entityCount: dedupedEntities.length,
        method,
        durationMs: Date.now() - start,
      },
    };
  }

  /** Extract entities using regex patterns only */
  extractByRegex(text: string, sourceId: string): Entity[] {
    const entities: Entity[] = [];

    for (const [type, patterns] of this.patterns) {
      for (const pattern of patterns) {
        try {
          for (const match of text.matchAll(pattern)) {
            const matched = match[1] || match[0] || "";
            if (matched.length >= 2 && matched.length <= 100) {
              entities.push({
                text: matched,
                type,
                confidence: 0.7,
                sourceId,
              });
            }
          }
        } catch (e) { console.warn(`error: ${e}`);
          // Pattern error, skip
        }
      }
    }

    return entities;
  }

  /** Query entities by type and/or text */
  queryEntities(entities: Entity[], filter?: {
    types?: EntityType[];
    text?: string;
    minConfidence?: number;
  }): Entity[] {
    let results = entities;

    if (filter?.types?.length) {
      results = results.filter(e => filter.types!.includes(e.type));
    }
    if (filter?.text) {
      const query = filter.text.toLowerCase();
      results = results.filter(e =>
        e.text.toLowerCase().includes(query) ||
        query.includes(e.text.toLowerCase())
      );
    }
    if (filter?.minConfidence) {
      results = results.filter(e => e.confidence >= filter.minConfidence!);
    }

    // Deduplicate by text
    const seen = new Set<string>();
    return results.filter(e => {
      const key = e.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private splitIntoParagraphs(document: DocumentLayer): Paragraph[] {
    const content = document.content;
    const separators = content.includes("\n\n") ? "\n\n" : "\n";
    const chunks = content.split(separators).filter(c => c.trim().length > 10);

    return chunks.map((chunk, idx) => ({
      id: `para_${document.id}_${idx}`,
      sourceDocumentId: document.id,
      index: idx + 1,
      content: chunk.trim(),
      createdAt: document.createdAt,
    }));
  }

  private initPatterns(): void {
    // Tools: common patterns like tool names, CLI commands, API endpoints
    this.patterns.set("tool", [
      /(?:use|using|called|tool|command|run)\s+`([^`]+)`/gi,
      /(?:called|named)\s+["']([^"']+)["']/gi,
      /\b(?:npm|npx|pip|cargo|go|docker|kubectl|git|gh|openclaw|mcporter|skillhub)\s+(\S+)/gi,
      /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g, // PascalCase tool names
    ]);

    // Projects: git repos, file paths, module names
    this.patterns.set("project", [
      /\b([A-Z][a-z]+(?:Press|Flow|Hub|Bot|Kit|Lib|Engine|CLI|API|SDK))\b/g,
      /(?:repo|project|module)\s+["']?([\w\-./]+)["']?/gi,
      /([\w\-]+)\/([\w\-]+)(?:\.git)?/g, // owner/repo pattern
    ]);

    // People: common name patterns
    this.patterns.set("person", [
      /(?:user|author|created by|maintained by|said|says)\s+["']?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)["']?/gi,
    ]);

    // Organizations
    this.patterns.set("organization", [
      /\b(?:OpenAI|Anthropic|Google|Meta|Microsoft|Apple|Amazon|GitHub|Cloudflare|Vercel|Netlify|OpenClaw)\b/gi,
    ]);

    // Dates
    this.patterns.set("date", [
      /\b(\d{4}[-/]\d{2}[-/]\d{2})\b/g,
      /\b(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\b/gi,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4}\b/gi,
    ]);

    // Concepts (generic fallback — capitalized multi-word phrases)
    this.patterns.set("concept", [
      /\b(?:DAG|FSM|RRF|MMR|FTS5|NER|LLM|MCP|API|SDK|RBAC|SQLite|FTS|JSON|YAML|TypeScript|JavaScript|Python)\b/gi,
    ]);

    // Locations
    this.patterns.set("location", [
      /\b(?:Beijing|Shanghai|Tokyo|London|New York|San Francisco|Berlin|Paris)\b/gi,
    ]);
  }
}
