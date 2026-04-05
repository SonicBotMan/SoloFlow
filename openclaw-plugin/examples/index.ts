/**
 * SoloFlow Example Workflow Templates
 *
 * Re-exports all example workflows for convenient importing:
 *   import { researchWorkflow, contentWorkflow, codeReviewWorkflow } from "./examples";
 */

export { researchWorkflow } from "./research-workflow";
export { contentWorkflow } from "./content-workflow";
export { codeReviewWorkflow } from "./code-review-workflow";

import type { WorkflowTemplate } from "../src/types";
import { researchWorkflow } from "./research-workflow";
import { contentWorkflow } from "./content-workflow";
import { codeReviewWorkflow } from "./code-review-workflow";

export const allTemplates: ReadonlyArray<WorkflowTemplate> = [
  researchWorkflow,
  contentWorkflow,
  codeReviewWorkflow,
] as const;

export const templateMap: ReadonlyMap<string, WorkflowTemplate> = new Map([
  ["research", researchWorkflow],
  ["content", contentWorkflow],
  ["code-review", codeReviewWorkflow],
]);
