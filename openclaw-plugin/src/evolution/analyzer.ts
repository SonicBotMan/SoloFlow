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
  /** Brief summary of what was found */
  summary?: string;
  /** Names of new/updated templates */
  templateNames?: string[];
  /** Names of new/updated skills */
  skillNames?: string[];
  /** Total workflow executions analyzed */
  analyzed?: number;
}

/** Jaccard similarity on lowercased word sets */
function calculateOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map(s => s.toLowerCase()));
  const setB = new Set(b.map(s => s.toLowerCase()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Extract a short key phrase from description (first meaningful noun phrase, max 3 words) */
function extractKeyPhrase(description: string): string | null {
  if (!description) return null;
  // Take first sentence, split into words, grab up to 3 content words
  const sentence = description.split(/[.!?\n]/)[0] ?? "";
  const words = sentence.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
  return words.length > 0 ? words.join(" ") : null;
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
    } catch (e) { console.warn(`error: ${e}`);
      // episodic access may vary
    }

    // 1b. Collect conversation history from recent memory files (Hermes-style: agent-curated notes)
    const conversationEntries: any[] = [];
    try {
      const recent = this.readRecentMemoryFiles(30); // last 7 days
      for (const entry of recent) {
        conversationEntries.push({
          date: entry.date,
          content: entry.summary,
          rawSnippets: entry.snippets,
        });
      }
    } catch (e) { console.warn(`error reading conversation history: ${e}`); }

    // 2. Collect existing templates (to avoid duplicates)
    const existingTemplates: any[] = [];
    try {
      const all = this.evolutionStore.getAll();
      for (const t of all) {
        existingTemplates.push({ id: t.id, name: t.name, type: t.type, triggers: t.triggers, tools_required: t.tools_required });
      }
    } catch (e) { console.warn(`error: ${e}`);
      // store may not be ready
    }

    if (episodicEntries.length === 0) {
      return { templates: 0, skills: 0 };
    }

    // 3. Build the analysis prompt
    const prompt = `You are a workflow pattern analyst. Analyze the following data and extract reusable patterns.

## Past Workflow Executions (Episodic Memory)
${JSON.stringify(episodicEntries.slice(0, 50), null, 2)}

## Recent Conversation History (from memory files — last 7 days)
${JSON.stringify(conversationEntries.slice(0, 30), null, 2)}

## Existing Templates (do NOT duplicate these)
${JSON.stringify(existingTemplates, null, 2)}

## Task
Identify patterns that appear more than once or represent a complete useful workflow:

1. **From Conversation History** (recent memory files — look for recurring user requests, repeated tasks, workflows the user asks for repeatedly):
Analyze the conversation entries for patterns like:
- Same user request appearing multiple times
- Complex tasks broken into predictable steps
- Workflows triggered by specific keywords or situations
For each pattern found, note: user_trigger, typical_request_text, implied_steps

2. **Workflow Templates**: Multi-step processes that could be reused. For each, provide:
   - name (concise), description (what it does)
   - triggers (array of natural language scenarios, e.g. ["when user asks for X", "when Y needs analysis"])
   - scope (one of: "general", "code-review", "content-creation", "data-analysis", "research", "automation", "communication")
   - prerequisites (array of preconditions, e.g. ["needs internet access"])
   - tools_required (array of tool names used, e.g. ["web_search", "weather"])
   - tools_optional (array of optional tools)
   - disciplines_used (array from: "deep", "quick", "visual", "ultrabrain")
   - estimated_duration (one of: "<1min", "1-5min", "5-15min", "15-60min", ">1h")
   - examples (array of {input, expected_output} showing typical use cases, 1-3 examples)
   - steps array with: id, name, discipline (deep|quick|visual|ultrabrain), action (the prompt text), dependencies (array of step ids)
   - tags

2. **Skill Patterns**: Single-step reusable operations. For each, provide:
   - name, description, pattern (the reusable prompt/action text)
   - triggers, scope, prerequisites, tools_required, tools_optional, disciplines_used, estimated_duration
   - examples (array of {input, expected_output})
   - tags

Only extract patterns that are genuinely reusable. Skip one-off workflows unless they represent a common archetype.

Output ONLY valid JSON (no markdown, no explanation):
{"workflows": [...], "skills": [...]}`;

    // 4. Call LLM directly via HTTP (no subagent needed)
    const responseText = await this.callLLM(prompt);
    if (!responseText) {
      return { templates: 0, skills: 0 };
    }

    // 5. Parse response and save templates
    const result = await this.parseAndSave(responseText, filterType);

    // 6. Auto-optimize: archive low-quality templates
    this.cleanupLowQualityTemplates();

    return result;
  }

  /**
   * Direct HTTP call to LLM API.
   * Reads config from openclaw.json to get baseUrl + apiKey.
   */
  private async callLLM(prompt: string): Promise<string | null> {
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
    } catch (e) { console.warn(`error: ${e}`);
      EvolutionAnalyzer.providerConfig = {};
    }
    return EvolutionAnalyzer.providerConfig;
  }

  private getBaseUrl(): string {
    const providers = this.getProviderConfig();
    const zai = providers["zai"];
    if (zai?.baseUrl) return zai.baseUrl as string;
    for (const p of Object.values(providers)) {
      if ((p as any).baseUrl) return (p as any).baseUrl as string;
    }
    return "";
  }

  private getApiKey(): string {
    const providers = this.getProviderConfig();
    const zai = providers["zai"];
    if (zai?.apiKey) return zai.apiKey as string;
    for (const p of Object.values(providers)) {
      if ((p as any).apiKey) return (p as any).apiKey as string;
    }
    return "";
  }

  private getModel(): string {
    const providers = this.getProviderConfig();
    const zai = providers["zai"];
    if (zai?.models?.[0]?.id) return zai.models[0].id as string;
    return "glm-5";
  }

  private async parseAndSave(responseText: string, filterType?: string): Promise<EvolutionResult> {
    let jsonStr = responseText.trim();

    // Strip markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1].trim();
    }

    const braceStart = jsonStr.indexOf("{");
    const braceEnd = jsonStr.lastIndexOf("}");
    if (braceStart === -1 || braceEnd === -1) {
      return { templates: 0, skills: 0 };
    }
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) { console.warn(`error: ${e}`);
      return { templates: 0, skills: 0 };
    }

    let wfCount = 0;
    let skCount = 0;
    const wfNames: string[] = [];
    const skNames: string[] = [];
    const now = Date.now();

    // Process workflow templates
    if (parsed.workflows && Array.isArray(parsed.workflows) && filterType !== "skill") {
      for (const wf of parsed.workflows) {
        if (!wf.name) continue;
        const template = this.buildTemplate("workflow", wf, now);
        if (!template) continue;

        const { merged } = this.smartMerge(template);
        if (!merged) {
          try { await this.onTemplateFound(template); } catch (e) { console.warn(`non-critical: ${e}`); }
        }
        wfCount++;
        wfNames.push(wf.name);
      }
    }

    // Process skill patterns
    if (parsed.skills && Array.isArray(parsed.skills) && filterType !== "workflow") {
      for (const sk of parsed.skills) {
        if (!sk.name) continue;
        const template = this.buildTemplate("skill", sk, now);
        if (!template) continue;

        const { merged } = this.smartMerge(template);
        if (!merged) {
          try { await this.onTemplateFound(template); } catch (e) { console.warn(`non-critical: ${e}`); }
        }
        skCount++;
        skNames.push(sk.name);
      }
    }

    return {
      templates: wfCount,
      skills: skCount,
      templateNames: wfNames,
      skillNames: skNames,
      analyzed: this.evolutionStore.count("workflow") + this.evolutionStore.count("skill"),
      summary: `Found ${wfCount} workflow templates (${wfNames.join(", ") || "none"}) and ${skCount} skill patterns (${skNames.join(", ") || "none"}).`,
    };
  }

  /** Build an EvolvedTemplate from LLM output with graceful defaults */
  private buildTemplate(type: "workflow" | "skill", raw: any, now: number): EvolvedTemplate | null {
    const prefix = type === "workflow" ? "wf_evo" : "sk_evo";
    const template: EvolvedTemplate = {
      id: `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      name: raw.name,
      description: raw.description ?? "",
      triggers: Array.isArray(raw.triggers) ? raw.triggers : [],
      scope: typeof raw.scope === "string" ? raw.scope : "general",
      prerequisites: Array.isArray(raw.prerequisites) ? raw.prerequisites : [],
      tools_required: Array.isArray(raw.tools_required) ? raw.tools_required : [],
      tools_optional: Array.isArray(raw.tools_optional) ? raw.tools_optional : [],
      disciplines_used: Array.isArray(raw.disciplines_used) ? raw.disciplines_used : [],
      estimated_steps: type === "workflow" ? (raw.steps?.length ?? 0) : 0,
      estimated_duration: typeof raw.estimated_duration === "string" ? raw.estimated_duration : "",
      examples: Array.isArray(raw.examples) ? raw.examples.filter((e: any) => e.input) : [],
      sources: Array.isArray(raw.sources) ? raw.sources : [],
      useCount: 0,
      successCount: 0,
      failCount: 0,
      lastUsedAt: null,
      lastIteratedAt: null,
      qualityScore: 0.5,
      version: 1,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      createdAt: now,
      updatedAt: now,
    };

    if (type === "workflow" && raw.steps) {
      template.steps = raw.steps.map((s: any, i: number) => ({
        id: s.id ?? `step_${i + 1}`,
        name: s.name ?? `Step ${i + 1}`,
        discipline: s.discipline ?? "quick",
        action: s.action ?? s.name ?? "",
        dependencies: s.dependencies ?? [],
      }));
    }

    if (type === "skill") {
      template.pattern = raw.pattern ?? "";
    }

    return template;
  }

  /** Smart merge: check for semantic overlap with existing templates */
  private smartMerge(template: EvolvedTemplate): { merged: boolean } {
    try {
      const existing = this.evolutionStore.search(template.name, template.type, 20);

      for (const ex of existing) {
        const triggerOverlap = calculateOverlap(template.triggers, ex.triggers);
        const toolsOverlap = calculateOverlap(template.tools_required, ex.tools_required);
        const combinedScore = (triggerOverlap + toolsOverlap) / 2;

        if (combinedScore >= 0.6) {
          // Merge: bump version, union triggers/examples
          this.evolutionStore.bumpVersion(ex.id, template);
          return { merged: true };
        } else if (ex.name === template.name && combinedScore < 0.6) {
          // Same name but different function — add suffix
          const suffix = extractKeyPhrase(template.description) || template.scope;
          template.name = `${template.name} (${suffix})`;
          return { merged: false };
        }
      }
    } catch (e) { console.warn(`error: ${e}`);
      // non-critical
    }

    return { merged: false };
  }

  private cleanupLowQualityTemplates(): void {
    try {
      const all = this.evolutionStore.getAll();
      let cleaned = 0;
      for (const t of all) {
        if ((t.qualityScore ?? 0.5) < 0.3 && t.useCount >= 3) {
          this.evolutionStore.delete(t.id);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        this.api.logger.info(`evolution cleanup: archived ${cleaned} low-quality template(s)`);
      }
    } catch (e) { console.warn(`error: ${e}`);
      // non-critical
    }
  }

  /**
   * Read recent memory/*.md files (last N days) and extract conversation patterns.
   * Reads the daily notes written during sessions, which contain condensed
   * conversation history — the source of truth for what the user actually asks for.
   */
  private readRecentMemoryFiles(days: number): Array<{date: string; summary: string; snippets: string[]}> {
    const results: Array<{date: string; summary: string; snippets: string[]}> = [];
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const os = require('node:os');
      const memoryDir = path.join(os.homedir(), '.openclaw', 'workspace', 'memory');
      // Snapshot mode: read all files first, then process (consistent snapshot, not live)
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let files: string[] = [];
      try { files = fs.readdirSync(memoryDir); } catch { return results; }
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const filePath = path.join(memoryDir, file);
        let stat: any;
        try { stat = fs.statSync(filePath); } catch { continue; }
        if (stat.mtimeMs < cutoff) continue;
        let raw: string;
        try { raw = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
        // Strip raw memory retrieval blocks (noisy for pattern analysis)
        if (raw.includes('[facts]:') && raw.includes('[preferences]:')) {
          const factsStart = raw.indexOf('[facts]:');
          const factsEnd = raw.indexOf('[preferences]:', factsStart);
          if (factsStart >= 0 && factsEnd >= 0) {
            raw = raw.slice(0, factsStart) + raw.slice(factsEnd + '[preferences]:'.length);
          }
        }
        const lines = raw.split('\n');
        const snippets: string[] = [];
        let buffer = '';
        let inCode = false;
        for (const line of lines) {
          if (line.startsWith('```')) { inCode = !inCode; continue; }
          if (inCode) continue;
          if (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('---')) {
            if (buffer.trim().length > 40) snippets.push(buffer.trim().slice(0, 200));
            buffer = line.replace(/^#+\s*/, '').trim() + ' ';
          } else if (line.trim().length > 30) {
            buffer += line.trim() + ' ';
          }
        }
        if (buffer.trim().length > 40) snippets.push(buffer.trim().slice(0, 200));
        const dm = file.match(/(\d{4}-\d{2}-\d{2})/);
        const date = dm?.[1] ?? file.slice(0, 10);
        const summary = snippets.slice(0, 3).join(' | ').slice(0, 250);
        if (summary.length > 20) results.push({ date, summary, snippets: snippets.slice(0, 5) });
      }
    } catch {}
    results.sort((a, b) => b.date.localeCompare(a.date));
    return results;
  }

}
