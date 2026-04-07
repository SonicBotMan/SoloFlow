import type { Embedding, EmbeddingProviderConfig, EmbeddingProviderType } from "./types.js";

const PROVIDER_DEFAULTS: Record<EmbeddingProviderType, { model: string; dimensions: number }> = {
  openai: { model: "text-embedding-3-small", dimensions: 1536 },
  local: { model: "bge-m3", dimensions: 1024 },
  mock: { model: "mock", dimensions: 128 },
  glm: { model: "embedding-3", dimensions: 2048 },
  minimax: { model: "text-embedding-01", dimensions: 1536 },
};

export interface Embedder {
  embed(text: string): Promise<Embedding>;
  embedBatch(texts: string[]): Promise<Embedding[]>;
  readonly dimensions: number;
  readonly providerType: EmbeddingProviderType;
}

export function createEmbedder(config: EmbeddingProviderConfig): Embedder {
  const defaults = PROVIDER_DEFAULTS[config.type];
  const model = config.model ?? defaults.model;
  const dimensions = config.dimensions ?? defaults.dimensions;

  switch (config.type) {
    case "openai":
      return new OpenAIEmbedder(config.apiBase ?? "https://api.openai.com/v1", config.apiKey ?? "", model, dimensions, config.batchSize ?? 32);
    case "glm":
      return new GLMEmbedder(config.apiBase ?? "https://open.bigmodel.cn/api/paas/v4", config.apiKey ?? "", model, dimensions);
    case "minimax":
      return new OpenAIEmbedder(config.apiBase ?? "https://api.minimax.chat/v1", config.apiKey ?? "", model, dimensions, config.batchSize ?? 32);
    case "local":
      return new LocalEmbedder(model, dimensions);
    case "mock":
      return new MockEmbedder(dimensions);
  }
}

class OpenAIEmbedder implements Embedder {
  readonly dimensions: number;
  readonly providerType: EmbeddingProviderType = "openai";

  private readonly apiBase: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly batchSize: number;

  constructor(apiBase: string, apiKey: string, model: string, dimensions: number, batchSize: number) {
    this.apiBase = apiBase;
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
    this.batchSize = batchSize;
  }

  async embed(text: string): Promise<Embedding> {
    const results = await this.embedBatch([text]);
    return results[0]!;
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    const allEmbeddings: Embedding[] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const response = await fetch(`${this.apiBase}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
          dimensions: this.dimensions,
        }),
      });

      if (!response.ok) {
        throw new EmbeddingError(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as OpenAIEmbeddingResponse;
      const sorted = json.data.sort((a, b) => a.index - b.index);

      for (const item of sorted) {
        allEmbeddings.push(new Float32Array(item.embedding));
      }
    }

    return allEmbeddings;
  }
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

class GLMEmbedder implements Embedder {
  readonly dimensions: number;
  readonly providerType: EmbeddingProviderType = "glm";

  private readonly apiBase: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiBase: string, apiKey: string, model: string, dimensions: number) {
    this.apiBase = apiBase;
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<Embedding> {
    const results = await this.embedBatch([text]);
    return results[0]!;
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    const response = await fetch(`${this.apiBase}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      throw new EmbeddingError(`GLM API error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as any;
    const sorted = (json.data || json.embeddings || []).sort((a: any, b: any) => a.index - b.index);
    return sorted.map((item: any) => new Float32Array(item.embedding));
  }
}

class LocalEmbedder implements Embedder {
  readonly dimensions: number;
  readonly providerType: EmbeddingProviderType = "local";

  constructor(_model: string, dimensions: number) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<Embedding> {
    return this.embedBatch([text]).then((r) => r[0]!);
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    return texts.map((text) => this.simpleHashEmbed(text, this.dimensions));
  }

  private simpleHashEmbed(text: string, dims: number): Float32Array {
    const vec = new Float32Array(dims);
    const normalized = text.toLowerCase().trim();
    if (normalized.length === 0) return vec;

    for (let i = 0; i < dims; i++) {
      let hash = i;
      for (let j = 0; j < normalized.length; j++) {
        const ch = normalized.charCodeAt(j);
        hash = ((hash << 5) - hash + ch + i * 31) | 0;
      }
      vec[i] = hash;
    }

    normalizeInPlace(vec);
    return vec;
  }
}

class MockEmbedder implements Embedder {
  readonly dimensions: number;
  readonly providerType: EmbeddingProviderType = "mock";

  constructor(dimensions: number) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<Embedding> {
    const vec = new Float32Array(this.dimensions);
    for (let i = 0; i < this.dimensions; i++) {
      vec[i] = Math.sin(text.charCodeAt(i % text.length) * (i + 1) * 0.1);
    }
    normalizeInPlace(vec);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export function normalizeInPlace(vec: Float32Array): void {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i]! * vec[i]!;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] = vec[i]! / norm;
    }
  }
}

export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

export function serializeEmbedding(vec: Embedding): string {
  const buffer = new ArrayBuffer(vec.byteLength);
  new Float32Array(buffer).set(vec);
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function deserializeEmbedding(data: string, dimensions: number): Embedding {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer, 0, dimensions);
}
