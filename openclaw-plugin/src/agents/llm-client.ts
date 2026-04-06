/**
 * LLM HTTP Client — Direct OpenAI-compatible API calls
 *
 * Reads provider config from OpenClaw's api.config.models.providers,
 * picks the best completion provider, and calls /chat/completions
 * via native fetch. No dependency on api.runtime.subagent.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface HostModelDefinition {
  id: string;
  name: string;
  api?: string;
  [key: string]: unknown;
}

export interface HostModelProvider {
  baseUrl: string;
  apiKey?: string | { source: string; provider: string; id: string };
  api?: string;
  headers?: Record<string, string>;
  models: HostModelDefinition[];
}

export interface HostModelsConfig {
  providers?: Record<string, HostModelProvider>;
}

export interface LlmCompleteOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  timeoutMs?: number;
}

export interface LlmCompleteResult {
  text: string;
  model: string;
  provider: string;
}

// ── Internal ─────────────────────────────────────────────────────────

interface ResolvedProvider {
  name: string;
  baseUrl: string;
  apiKey?: string;
  api?: string;
  headers?: Record<string, string>;
  model: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function resolveApiKey(
  input: string | { source: string; provider: string; id: string } | undefined,
): string | undefined {
  if (!input) return undefined;
  if (typeof input === "string") return input;
  if (input.source === "env") return process.env[input.id];
  return undefined;
}

function buildHeaders(provider: ResolvedProvider): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...provider.headers,
  };
  if (provider.apiKey) {
    headers["Authorization"] = `Bearer ${provider.apiKey}`;
  }
  return headers;
}

function normalizeEndpoint(baseUrl: string, suffix: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith(suffix)) return base;
  return `${base}${suffix}`;
}

function pickCompletionProvider(
  providers: Record<string, HostModelProvider>,
): ResolvedProvider | undefined {
  const entries = Object.entries(providers).filter(([, p]) => p.models?.length > 0);
  if (entries.length === 0) return undefined;

  entries.sort(([, a], [, b]) => {
    const aScore = (a.api === "openai-completions" ? 2 : 0) + (resolveApiKey(a.apiKey) ? 1 : 0);
    const bScore = (b.api === "openai-completions" ? 2 : 0) + (resolveApiKey(b.apiKey) ? 1 : 0);
    return bScore - aScore;
  });

  const first = entries[0];
  if (!first) return undefined;
  const [name, provider] = first;
  return {
    name,
    baseUrl: provider.baseUrl,
    apiKey: resolveApiKey(provider.apiKey),
    api: provider.api,
    headers: provider.headers,
    model: provider.models[0]?.id ?? provider.models[0]?.name ?? "unknown",
  };
}

/**
 * Try to find a specific model across all providers.
 * Falls back to the default completion provider if not found.
 */
function findModelProvider(
  providers: Record<string, HostModelProvider>,
  modelId: string,
): ResolvedProvider | undefined {
  // Try exact match first
  for (const entry of Object.entries(providers)) {
    const name = entry[0];
    const provider = entry[1];
    const found = provider.models.find((m: HostModelDefinition) => m.id === modelId);
    if (found) {
      return {
        name,
        baseUrl: provider.baseUrl,
        apiKey: resolveApiKey(provider.apiKey),
        api: provider.api,
        headers: provider.headers,
        model: found.id,
      };
    }
  }
  // Try partial match (e.g. "glm-5" matches "zai/glm-5")
  const allEntries = Object.entries(providers);
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    if (!entry) continue;
    const name = entry[0];
    const provider = entry[1];
    const found = provider.models.find((m: HostModelDefinition) => m.id.endsWith(modelId) || m.name === modelId);
    if (found) {
      return {
        name,
        baseUrl: provider.baseUrl,
        apiKey: resolveApiKey(provider.apiKey),
        api: provider.api,
        headers: provider.headers,
        model: found.id,
      };
    }
  }
  return undefined;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Send a chat completion request to the best available provider.
 *
 * @param prompt User prompt text
 * @param hostModels The providers config from api.config
 * @param options Model, tokens, temperature overrides
 */
export async function completeLLM(
  prompt: string,
  hostModels: HostModelsConfig | undefined,
  options: LlmCompleteOptions = {},
): Promise<LlmCompleteResult> {
  if (!hostModels?.providers) {
    throw new Error(
      "No LLM providers configured. Set up model providers in OpenClaw config.",
    );
  }

  const providers = hostModels.providers;

  // Resolve provider: specific model requested → find it; otherwise pick best
  let provider: ResolvedProvider | undefined;
  if (options.model) {
    provider = findModelProvider(providers, options.model);
  }
  if (!provider) {
    provider = pickCompletionProvider(providers);
  }
  if (!provider) {
    throw new Error(
      "No suitable completion provider found. Ensure at least one provider has models configured.",
    );
  }

  const model = options.model
    ? provider.model // already resolved via findModelProvider
    : provider.model;

  const endpoint = normalizeEndpoint(provider.baseUrl, "/chat/completions");

  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.5,
  };
  if (options.maxTokens) {
    body["max_tokens"] = options.maxTokens;
  }

  const timeoutMs = options.timeoutMs ?? 60_000;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders(provider),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const respBody = await resp.text();
    throw new Error(
      `LLM request failed (${provider.name} ${resp.status}): ${respBody.slice(0, 500)}`,
    );
  }

  const json = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = json.choices?.[0]?.message?.content ?? "";

  return { text, model, provider: provider.name };
}
