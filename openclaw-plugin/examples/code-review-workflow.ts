/**
 * Code Review Workflow Example
 *
 * A 3-step pipeline: read → analyze → report.
 * Demonstrates how to build an automated code review system
 * using ultrabrain discipline for deep code analysis.
 *
 * Usage:
 *   /workflow create code-review-workflow
 *   /workflow start <workflow-id> --var repo="owner/repo" --var pr="42"
 *
 * Expected flow:
 *   Step 1 (quick)      → code-reader fetches the diff / changed files
 *   Step 2 (ultrabrain) → analyzer identifies bugs, patterns, anti-patterns
 *   Step 3 (deep)       → reporter generates a structured review report
 */

import type { StepId, WorkflowTemplate } from "../src/types";

function step(id: string): StepId {
  return id as unknown as StepId;
}

export const codeReviewWorkflow: WorkflowTemplate = {
  name: "Code Review Workflow",
  description:
    "Automated code review: reads changed files, analyzes for issues using deep reasoning, and generates a structured review report.",

  steps: [
    // ── Step 1: Code Reader (quick discipline) ──────────────────────────
    // Fast retrieval of the code to review — fetches diff, parses files.
    // No dependencies.
    {
      id: step("review-read"),
      name: "Read Code",
      discipline: "quick",
      dependencies: [],
      config: {
        tool: "code-reader",
        prompt:
          "Read and extract the code changes. Fetch the diff for the specified pull request or file paths. Return the full diff with file names, line numbers, and the changed code blocks.",
        repoVar: "repo",
        prVar: "pr",
        includeContext: true,
        contextLines: 5,
      },
    },

    // ── Step 2: Analyzer (ultrabrain discipline) ────────────────────────
    // Heavy analysis — bug detection, pattern recognition, architecture review.
    // Depends on Step 1 for the code diff.
    {
      id: step("review-analyze"),
      name: "Find Issues",
      discipline: "ultrabrain",
      dependencies: [step("review-read")],
      config: {
        tool: "analyzer",
        prompt:
          "Perform a thorough code review analysis. Check for: bugs and logic errors, security vulnerabilities, performance issues, code style violations, anti-patterns, missing error handling, and potential race conditions. Rate severity as critical/warning/info for each finding.",
        inputFrom: step("review-read"),
        checks: [
          "bug-detection",
          "security-vulnerabilities",
          "performance",
          "code-style",
          "anti-patterns",
          "error-handling",
          "concurrency",
        ],
      },
    },

    // ── Step 3: Reporter (deep discipline) ──────────────────────────────
    // Generates a human-readable, well-structured review report.
    // Depends on Step 2 for the analysis findings.
    {
      id: step("review-report"),
      name: "Generate Review Report",
      discipline: "deep",
      dependencies: [step("review-analyze")],
      config: {
        tool: "reporter",
        prompt:
          "Generate a comprehensive code review report. Organize findings by severity (critical first). For each issue, provide: file location, line range, description, suggested fix with code example, and reasoning. Include an overall assessment and approval recommendation.",
        inputFrom: step("review-analyze"),
        format: "markdown",
        includeCodeSnippets: true,
        includeFixSuggestions: true,
      },
    },
  ],
};

/**
 * Usage:
 *
 * ```typescript
 * import { codeReviewWorkflow } from "./examples/code-review-workflow";
 *
 * // DAG execution layers:
 * //   Layer 0: review-read    (quick — fetch diff)
 * //   Layer 1: review-analyze (ultrabrain — deep analysis)
 * //   Layer 2: review-report  (deep — structured report)
 * ```
 *
 * CLI:
 *   /workflow create code-review-workflow
 *   /workflow start <id> --var repo="SonicBotMan/openclaw-plugin" --var pr="7"
 */
