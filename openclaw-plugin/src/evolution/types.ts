/**
 * SoloFlow — Evolution Types
 * Types for auto-evolved workflow templates and skill patterns.
 */

export type TemplateType = "workflow" | "skill";

export interface EvolvedTemplate {
  id: string;
  type: TemplateType;
  name: string;
  description: string;
  /** For workflow templates: the step definitions */
  steps?: Array<{
    id: string;
    name: string;
    discipline: string;
    action: string;
    dependencies?: string[];
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
