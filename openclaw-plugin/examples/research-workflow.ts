/**
 * Research Workflow Example
 *
 * A 3-step pipeline: search → analyze → summarize.
 * Demonstrates sequential step dependencies where each step
 * consumes the output of the previous one.
 *
 * Usage:
 *   /workflow create research-workflow
 *   /workflow start <workflow-id>
 *
 * Expected flow:
 *   Step 1 (quick)  → web-search gathers raw results
 *   Step 2 (deep)   → data-analysis synthesizes findings
 *   Step 3 (deep)   → writer produces a structured summary
 *
 * Expected output:
 *   {
 *     "topic": "<user-provided topic>",
 *     "searchResults": { ... },
 *     "analysis": { ... },
 *     "summary": "## Research Summary\n..."
 *   }
 */

import type { StepId, WorkflowTemplate } from "../src/types";

// ─── Step ID helper (branded type cast) ────────────────────────────────

function step(id: string): StepId {
  return id as unknown as StepId;
}

// ─── Workflow Template ─────────────────────────────────────────────────

export const researchWorkflow: WorkflowTemplate = {
  name: "Research Workflow",
  description:
    "Search the web for a topic, analyze the findings with a deep-reasoning agent, and produce a written summary.",

  steps: [
    // ── Step 1: Web Search (quick discipline) ───────────────────────────
    // Uses the quick agent for fast, concise web search results.
    // No dependencies — this is the entry point of the pipeline.
    {
      id: step("research-search"),
      name: "Web Search",
      discipline: "quick",
      dependencies: [],
      config: {
        tool: "web-search",
        prompt:
          "Search the web for the latest information on the given topic. Return the top 5 most relevant results with titles, URLs, and brief summaries.",
        // The user provides the actual topic at runtime via:
        //   /workflow create research-workflow --var topic="AI agents 2025"
        topicVar: "topic",
        maxResults: 5,
      },
    },

    // ── Step 2: Data Analysis (deep discipline) ─────────────────────────
    // Uses the deep agent for thorough multi-step analysis.
    // Depends on Step 1 — receives search results as input.
    {
      id: step("research-analysis"),
      name: "Analyze Results",
      discipline: "deep",
      dependencies: [step("research-search")],
      config: {
        tool: "data-analysis",
        prompt:
          "Analyze the search results from the previous step. Identify key themes, compare different viewpoints, highlight contradictions, and extract actionable insights. Structure your analysis with clear sections.",
        inputFrom: step("research-search"),
      },
    },

    // ── Step 3: Writer (deep discipline) ────────────────────────────────
    // Uses the deep agent again for high-quality long-form writing.
    // Depends on Step 2 — receives the analysis as input.
    {
      id: step("research-summary"),
      name: "Write Summary",
      discipline: "deep",
      dependencies: [step("research-analysis")],
      config: {
        tool: "writer",
        prompt:
          "Based on the analysis, write a comprehensive research summary. Include: an executive summary, key findings, detailed sections for each theme, and a conclusion with recommendations. Use markdown formatting.",
        inputFrom: step("research-analysis"),
        format: "markdown",
      },
    },
  ],
};

// ─── Usage Example ─────────────────────────────────────────────────────

/**
 * How to use this template programmatically:
 *
 * ```typescript
 * import { researchWorkflow } from "./examples/research-workflow";
 * import type { WorkflowService } from "../src/services/workflow-service";
 *
 * async function runResearch(
 *   workflowService: WorkflowService,
 *   topic: string,
 * ) {
 *   // 1. Create a workflow from the template
 *   const workflow = await workflowService.create(researchWorkflow);
 *
 *   // 2. Inject the topic variable into the first step
 *   const searchStep = workflow.steps.get("research-search" as unknown as StepId);
 *   if (searchStep) {
 *     searchStep.config.topic = topic;
 *   }
 *
 *   // 3. Start execution
 *   await workflowService.start(workflow.id);
 *
 *   // 4. The scheduler will execute steps in DAG order:
 *   //    research-search → research-analysis → research-summary
 * }
 * ```
 *
 * CLI usage:
 *   /workflow create research-workflow
 *   /workflow start <id> --var topic="AI agents 2025"
 */
