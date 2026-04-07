/**
 * SoloFlow — Evolution Types
 * Types for auto-evolved workflow templates and skill patterns.
 */

export type TemplateType = "workflow" | "skill";

export interface TemplateExample {
  input: string;           // user input that triggers this template
  expected_output: string; // expected result
}

export interface EvolvedTemplate {
  id: string;
  type: TemplateType;
  name: string;
  description: string;

  // Usage context — when to use this template
  triggers: string[];          // scenarios that trigger this (e.g. ["user wants weather", "needs data analysis"])
  scope: string;               // applicability scope (e.g. "general", "code review", "content creation")
  prerequisites: string[];     // preconditions (e.g. ["needs OpenClaw environment"])

  // Capability description
  tools_required: string[];    // tools used internally (e.g. ["weather", "web_search"])
  tools_optional: string[];    // optional tools
  disciplines_used: string[];  // disciplines involved (e.g. ["quick", "deep"])
  estimated_steps: number;     // for workflows
  estimated_duration: string;  // e.g. "<1min", "1-5min", "5-15min"

  // Examples
  examples: TemplateExample[];

  // For workflow templates: the step definitions
  steps?: Array<{
    id: string;
    name: string;
    discipline: string;
    action: string;
    dependencies: string[];
  }>;
  /** For skill patterns: the reusable prompt/tool pattern */
  pattern?: string;
  /** Source conversations/workflows this was extracted from */
  sources: string[];
  /** Usage tracking */
  useCount: number;
  successCount: number;
  failCount: number;
  lastUsedAt: number | null;
  lastIteratedAt: number | null;
  /** Quality score 0-1 (based on success rate + usage) */
  qualityScore: number;
  /** Iteration version */
  version: number;
  /** Tags for search */
  tags: string[];
  createdAt: number;
  updatedAt: number;
}
