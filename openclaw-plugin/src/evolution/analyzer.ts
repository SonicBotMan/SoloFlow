/**
 * SoloFlow — Evolution Analyzer
 * LLM-powered pattern extraction from workflow execution history.
 * Uses direct HTTP to configured LLM API (no subagent dependency).
 */

import type { EvolvedTemplate } from "./types.js";
import type { OpenClawPluginApi } from "../../types/openclaw/plugin-sdk/plugin-entry.js";

export interface EvolutionAnalyzerConfig {
  api: OpenClawPluginApi;
  memorySystem: any;
  evolutionStore: any;
  onTemplateFound: (template: EvolvedTemplate) => Promise<void>;
}

export interface EvolutionResult {
  templates: number;
  skills: number;
}

export class EvolutionAnalyzer {
  private api: OpenClawPluginApi;
  private memorySystem: any;
  private evolutionStore: any;
  private onTemplateFound: (template: EvolvedTemplate) => Promise<void>;

  constructor(config: EvolutionAnalyzerConfig) {
    this.api = config.api;
    this.memorySystem = config.memorySystem;
    this.evolutionStore = config.evolutionStore;
    this.onTemplateFound = config.onTemplateFound;
  }

  async analyze(filterType?: string): Promise<EvolutionResult> {
    // 1. Collect episodic memory entries
    const episodicEntries: any[] = [];
    try {
      const all = this.memorySystem.episodic.all();
      for (const e of all) {
        episodicEntries.push({
          workflowId: e.workflowId,
          workflowName: e.workflowName,
          finalState: e.finalState,
          stepSummary: e.stepSummary,
          durationMs: e.durationMs,
          tags: e.tags,
          createdAt: e.createdAt,
        });
      }
    } catch {
      // episodic access may vary
    }

    // 2. Collect existing templates (to avoid duplicates)
    const existingTemplates: any[] = [];
    try {
      const all = this.evolutionStore.getAll();
      for (const t of all) {
        existingTemplates.push({ id: t.id, name: t.name, type: t.type });
      }
    } catch {
      // store may not be ready
    }

    if (episodicEntries.length === 0) {
      return { templates: 0, skills: 0 };
    }

    // 3. Build the analysis prompt
    const prompt = `You are a workflow pattern analyst. Analyze the following data and extract reusable patterns.

## Past Workflow Executions (Episodic Memory)
${JSON.stringify(episodicEntries.slice(0, 50), null, 2)}

## Existing Templates (do NOT duplicate these)
${JSON.stringify(existingTemplates, null, 2)}

## Task
Identify patterns that appear more than once or represent a complete useful workflow:

1. **Workflow Templates**: Multi-step processes that could be reused. For each, provide:
   - name (concise), description (what it does), steps array with: id, name, discipline (deep|quick|visual|ultrabrain), action (the prompt text), dependencies (array of step ids), tags

2. **Skill Patterns**: Single-step reusable operations. For each, provide:
   - name, description, pattern (the reusable prompt/action text), tags

Only extract patterns that are genuinely reusable. Skip one-off workflows unless they represent a common archetype.

Output ONLY valid JSON (no markdown, no explanation):
{"workflows": [...], "skills": [...]}`;

    // 4. Call LLM directly via HTTP (no subagent needed)
    const responseText = await this.callLLM(prompt);
    if (!responseText) {
      return { templates: 0, skills: 0 };
    }

    // 5. Parse response and save templates
    return this.parseAndSave(responseText, filterType);
  }

  /**
   * Direct HTTP call to LLM API.
   * Reads config from openclaw.json to get baseUrl + apiKey.
   * Falls back to GLM-5 free API if no config found.
   */
  private async callLLM(prompt: string): Promise<string | null> {
    // Try to read provider config from the api object
    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();

    if (!baseUrl || !apiKey) {
      return null;
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.getModel(),
          messages: [
            {
              role: "system",
              content: "You are a workflow pattern analyst. Always respond with valid JSON only. No markdown, no explanation.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`LLM API ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = (await response.json()) as any;
      return data.choices?.[0]?.message?.content ?? null;
    } catch (e) {
      // Log but don't throw — evolution is non-critical
      const msg = e instanceof Error ? e.message : String(e);
      this.api.logger.warn(`evolution LLM call failed: ${msg}`);
      return null;
    }
  }

  /** Cached provider config (read once from disk) */
  private static providerConfig: any = null;

  private getProviderConfig(): any {
    if (EvolutionAnalyzer.providerConfig) return EvolutionAnalyzer.providerConfig;
    try {
      const fs = require("node:fs") as typeof import("node:fs");
      const path = require("node:path") as typeof import("node:path");
      const os = require("node:os") as typeof import("node:os");
      const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
      const raw = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      EvolutionAnalyzer.providerConfig = config.models?.providers ?? {};
    } catch {
      EvolutionAnalyzer.providerConfig = {};
    }
    return EvolutionAnalyzer.providerConfig;
  }

  /** Get base URL from openclaw.json providers */
  private getBaseUrl(): string {
    const providers = this.getProviderConfig();
    // Try zai (GLM) first — it's free
    const zai = providers["zai"];
    if (zai?.baseUrl) return zai.baseUrl as string;
    // Try any provider with a baseUrl
    for (const p of Object.values(providers)) {
      if ((p as any).baseUrl) return (p as any).baseUrl as string;
    }
    return "";
  }

  /** Get API key from openclaw.json providers */
  private getApiKey(): string {
    const providers = this.getProviderConfig();
    const zai = providers["zai"];
    if (zai?.apiKey) return zai.apiKey as string;
    for (const p of Object.values(providers)) {
      if ((p as any).apiKey) return (p as any).apiKey as string;
    }
    return "";
  }

  /** Get model ID */
  private getModel(): string {
    const providers = this.getProviderConfig();
    const zai = providers["zai"];
    if (zai?.models?.[0]?.id) return zai.models[0].id as string;
    return "glm-5";
  }

  private parseAndSave(responseText: string, filterType?: string): EvolutionResult {
    let jsonStr = responseText.trim();

    // Strip markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1].trim();
    }

    // Find the JSON object
    const braceStart = jsonStr.indexOf("{");
    const braceEnd = jsonStr.lastIndexOf("}");
    if (braceStart === -1 || braceEnd === -1) {
      return { templates: 0, skills: 0 };
    }
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (_e) {
      return { templates: 0, skills: 0 };
    }

    let wfCount = 0;
    let skCount = 0;
    const now = Date.now();

    // Process workflow templates
    if (parsed.workflows && Array.isArray(parsed.workflows) && filterType !== "skill") {
      for (const wf of parsed.workflows) {
        if (!wf.name) continue;
        const template: EvolvedTemplate = {
          id: `wf_evo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          type: "workflow",
          name: wf.name,
          description: wf.description ?? "",
          steps: wf.steps?.map((s: any, i: number) => ({
            id: s.id ?? `step_${i + 1}`,
            name: s.name ?? `Step ${i + 1}`,
            discipline: s.discipline ?? "quick",
            action: s.action ?? s.name ?? "",
            dependencies: s.dependencies ?? [],
          })),
          sources: wf.sources ?? [],
          useCount: 0,
          successCount: 0,
          failCount: 0,
          lastUsedAt: null,
          lastIteratedAt: null,
          qualityScore: 0.5,
          version: 1,
          tags: wf.tags ?? [],
          createdAt: now,
          updatedAt: now,
        };
        void this.onTemplateFound(template);
        wfCount++;
      }
    }

    // Process skill patterns
    if (parsed.skills && Array.isArray(parsed.skills) && filterType !== "workflow") {
      for (const sk of parsed.skills) {
        if (!sk.name) continue;
        const template: EvolvedTemplate = {
          id: `sk_evo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          type: "skill",
          name: sk.name,
          description: sk.description ?? "",
          pattern: sk.pattern ?? "",
          sources: sk.sources ?? [],
          useCount: 0,
          successCount: 0,
          failCount: 0,
          lastUsedAt: null,
          lastIteratedAt: null,
          qualityScore: 0.5,
          version: 1,
          tags: sk.tags ?? [],
          createdAt: now,
          updatedAt: now,
        };
        void this.onTemplateFound(template);
        skCount++;
      }
    }

    return { templates: wfCount, skills: skCount };
  }
}
