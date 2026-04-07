import type { EmbeddingProviderConfig } from "./types.js";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

/**
 * Auto-detect embedding configuration from openclaw.json model providers.
 * Priority: GLM (free) > MiniMax > any OpenAI-compatible > local (hash-based fallback)
 */
export function detectEmbeddingConfig(): EmbeddingProviderConfig {
  try {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const providers = config.models?.providers as Record<string, any> | undefined;

    if (!providers) return { type: "local" };

    // Try GLM first (free tier)
    const zai = providers["zai"];
    if (zai?.apiKey) {
      return {
        type: "glm",
        apiBase: zai.baseUrl || "https://open.bigmodel.cn/api/paas/v4",
        apiKey: zai.apiKey,
        model: "embedding-3",
        dimensions: 2048,
      };
    }

    // Try MiniMax
    const minimax = providers["minimax"];
    if (minimax?.apiKey) {
      return {
        type: "minimax",
        apiBase: minimax.baseUrl || "https://api.minimax.chat/v1",
        apiKey: minimax.apiKey,
        model: "text-embedding-01",
        dimensions: 1536,
      };
    }

    // Try any OpenAI-compatible provider
    for (const [name, provider] of Object.entries(providers)) {
      if (name === "zai" || name === "minimax") continue;
      if (provider?.apiKey && provider?.baseUrl) {
        return {
          type: "openai",
          apiBase: provider.baseUrl,
          apiKey: provider.apiKey,
          dimensions: 1536,
        };
      }
    }
  } catch {
    // Config not readable
  }

  return { type: "local" };
}

/**
 * Validate an embedding config by making a test call.
 * Returns true if the provider responds with a valid embedding.
 */
export async function validateEmbeddingConfig(config: EmbeddingProviderConfig): Promise<boolean> {
  try {
    const { createEmbedder } = await import("./embedder.js");
    const embedder = createEmbedder(config);
    const result = await embedder.embed("test");
    return result.length === embedder.dimensions && result.some((v) => v !== 0);
  } catch {
    return false;
  }
}
