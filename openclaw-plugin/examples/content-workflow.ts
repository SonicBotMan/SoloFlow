/**
 * Content Creation Workflow Example
 *
 * A 4-step pipeline: ideate → write → visualize → publish.
 * Demonstrates a linear content production pipeline with a visual
 * step that depends on the written content for context.
 *
 * Usage:
 *   /workflow create content-workflow
 *   /workflow start <workflow-id> --var topic="Rust vs Go"
 *
 * Expected flow:
 *   Step 1 (quick)   → idea agent generates 5 content angles
 *   Step 2 (deep)    → writer produces full article
 *   Step 3 (visual)  → generates cover image / thumbnail
 *   Step 4 (quick)   → formats and prepares for publishing
 */

import type { StepId, WorkflowTemplate } from "../src/types";

function step(id: string): StepId {
  return id as unknown as StepId;
}

export const contentWorkflow: WorkflowTemplate = {
  name: "Content Creation Workflow",
  description:
    "Generate ideas, write content, create visuals, and prepare for publishing — end-to-end content production.",

  steps: [
    // ── Step 1: Ideation (quick discipline) ─────────────────────────────
    // Fast brainstorming — returns multiple angles for the user to pick from.
    // No dependencies.
    {
      id: step("content-ideate"),
      name: "Generate Content Ideas",
      discipline: "quick",
      dependencies: [],
      config: {
        tool: "idea",
        prompt:
          "Generate 5 creative content ideas for the given topic. For each idea, provide a title, a 2-sentence description, the target audience, and the suggested format (blog post, video script, twitter thread, etc).",
        topicVar: "topic",
        count: 5,
      },
    },

    // ── Step 2: Writing (deep discipline) ───────────────────────────────
    // Long-form content generation using the selected idea.
    // Depends on Step 1 for the chosen idea.
    {
      id: step("content-write"),
      name: "Write Content",
      discipline: "deep",
      dependencies: [step("content-ideate")],
      config: {
        tool: "writer",
        prompt:
          "Write the full content based on the selected idea. Include a compelling introduction, well-structured body with clear sections, and a strong conclusion. Optimize for engagement and readability.",
        inputFrom: step("content-ideate"),
        format: "markdown",
        minWords: 800,
        maxWords: 2000,
      },
    },

    // ── Step 3: Visual (visual discipline) ──────────────────────────────
    // Creates a cover image or thumbnail based on the written content.
    // Depends on Step 2 — needs the content context for visual relevance.
    {
      id: step("content-visual"),
      name: "Generate Cover Image",
      discipline: "visual",
      dependencies: [step("content-write")],
      config: {
        tool: "visual",
        prompt:
          "Design a cover image or thumbnail for the content. The visual should capture the core theme and be eye-catching. Use modern, clean design principles.",
        inputFrom: step("content-write"),
        dimensions: { width: 1200, height: 630 },
        style: "modern-clean",
      },
    },

    // ── Step 4: Publish (quick discipline) ──────────────────────────────
    // Formats everything and prepares the final publishable package.
    // Depends on both Step 2 (content) and Step 3 (visual).
    {
      id: step("content-publish"),
      name: "Format and Prepare",
      discipline: "quick",
      dependencies: [step("content-write"), step("content-visual")],
      config: {
        tool: "publisher",
        prompt:
          "Format the content and visual into a publishable package. Generate metadata (title, description, tags, slug), apply final formatting, and produce a ready-to-publish output.",
        contentFrom: step("content-write"),
        visualFrom: step("content-visual"),
        platforms: ["blog", "twitter", "linkedin"],
      },
    },
  ],
};

/**
 * Usage:
 *
 * ```typescript
 * import { contentWorkflow } from "./examples/content-workflow";
 *
 * // The DAG scheduler will execute:
 * //   Layer 0: content-ideate (no deps)
 * //   Layer 1: content-write   (depends on ideate)
 * //   Layer 2: content-visual  (depends on write)
 * //   Layer 3: content-publish (depends on write + visual)
 * ```
 *
 * CLI:
 *   /workflow create content-workflow
 *   /workflow start <id> --var topic="Building AI agents with TypeScript"
 */
