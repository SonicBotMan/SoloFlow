/**
 * SoloFlow — Evolution Analyzer
 * LLM-powered pattern extraction from workflow execution history.
 * Uses OpenClaw subagent API for analysis.
 */

import type { EvolvedTemplate } from "./types.js";
import type { OpenClawPluginApi } from "../../types/openclaw/plugin-sdk/plugin-entry.js";

export interface EvolutionAnalyzerConfig {
  api: OpenClawPluginApi;
  memorySystem: any;
  evolutionStore: any;
  onTemplateFound: (template: EvolvedTemplate) => Promise<void>;
}

// Result type — named to avoid }> parser confusion with isolatedModules
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

    // 4. Spawn sub-agent to analyze
    const sessionKey = `evolution-${Date.now()}`;
    try {
      const { runId } = await this.api.runtime.subagent.run({
        sessionKey,
        message: prompt,
        timeoutMs: 120_000,
      });

      const result = await this.api.runtime.subagent.waitForRun({
        runId,
        timeoutMs: 130_000,
      });

      // Cleanup
      await this.api.runtime.subagent.deleteSession({ sessionKey }).catch(() => {});

      if (result.error) {
        throw new Error(result.error);
      }

      // 5. Parse response — extract JSON
      return this.parseAndSave(result.result ?? "", filterType);
    } catch (e) {
      // Cleanup on error
      await this.api.runtime.subagent.deleteSession({ sessionKey }).catch(() => {});
      throw e;
    }
  }

  private parseAndSave(responseText: string, filterType?: string): EvolutionResult {
    // Try to extract JSON from the response
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
