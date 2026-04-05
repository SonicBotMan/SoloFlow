/**
 * SoloFlow — Template Registry
 *
 * Manages workflow templates: register, query, and list named templates
 * that can be used to create workflows via `/workflow start --template <name>`.
 */

import type { StepId, WorkflowTemplate } from "../types";

// ─── Helpers ────────────────────────────────────────────────────────────

function step(id: string): StepId {
  return id as unknown as StepId;
}

// ─── Built-in Templates ─────────────────────────────────────────────────

const researchTemplate: WorkflowTemplate = {
  name: "Research Workflow",
  description:
    "Search the web for a topic, analyze the findings with a deep-reasoning agent, and produce a written summary.",
  steps: [
    {
      id: step("research-search"),
      name: "Web Search",
      discipline: "quick",
      dependencies: [],
      config: {
        tool: "web-search",
        prompt:
          "Search the web for the latest information on the given topic. Return the top 5 most relevant results with titles, URLs, and brief summaries.",
        topicVar: "topic",
        maxResults: 5,
      },
    },
    {
      id: step("research-analysis"),
      name: "Analyze Results",
      discipline: "deep",
      dependencies: [step("research-search")],
      config: {
        tool: "data-analysis",
        prompt:
          "Analyze the search results from the previous step. Identify key themes, compare different viewpoints, highlight contradictions, and extract actionable insights.",
        inputFrom: step("research-search"),
      },
    },
    {
      id: step("research-summary"),
      name: "Write Summary",
      discipline: "deep",
      dependencies: [step("research-analysis")],
      config: {
        tool: "writer",
        prompt:
          "Based on the analysis, write a comprehensive research summary in markdown with an executive summary, key findings, and conclusions.",
        inputFrom: step("research-analysis"),
        format: "markdown",
      },
    },
  ],
};

const contentTemplate: WorkflowTemplate = {
  name: "Content Creation Workflow",
  description:
    "Generate ideas, write content, create visuals, and prepare for publishing — end-to-end content production.",
  steps: [
    {
      id: step("content-ideate"),
      name: "Generate Content Ideas",
      discipline: "quick",
      dependencies: [],
      config: {
        tool: "idea",
        prompt:
          "Generate 5 creative content ideas for the given topic. For each idea provide a title, 2-sentence description, target audience, and suggested format.",
        topicVar: "topic",
        count: 5,
      },
    },
    {
      id: step("content-write"),
      name: "Write Content",
      discipline: "deep",
      dependencies: [step("content-ideate")],
      config: {
        tool: "writer",
        prompt:
          "Write full content based on the selected idea with a compelling introduction, well-structured body, and strong conclusion.",
        inputFrom: step("content-ideate"),
        format: "markdown",
        minWords: 800,
        maxWords: 2000,
      },
    },
    {
      id: step("content-visual"),
      name: "Generate Cover Image",
      discipline: "visual",
      dependencies: [step("content-write")],
      config: {
        tool: "visual",
        prompt:
          "Design a cover image or thumbnail for the content. The visual should capture the core theme and be eye-catching.",
        inputFrom: step("content-write"),
        dimensions: { width: 1200, height: 630 },
        style: "modern-clean",
      },
    },
    {
      id: step("content-publish"),
      name: "Format and Prepare",
      discipline: "quick",
      dependencies: [step("content-write"), step("content-visual")],
      config: {
        tool: "publisher",
        prompt:
          "Format the content and visual into a publishable package. Generate metadata, apply final formatting, and produce a ready-to-publish output.",
        contentFrom: step("content-write"),
        visualFrom: step("content-visual"),
        platforms: ["blog", "twitter", "linkedin"],
      },
    },
  ],
};

const codeReviewTemplate: WorkflowTemplate = {
  name: "Code Review Workflow",
  description:
    "Automated code review: reads changed files, analyzes for issues using deep reasoning, and generates a structured review report.",
  steps: [
    {
      id: step("review-read"),
      name: "Read Code",
      discipline: "quick",
      dependencies: [],
      config: {
        tool: "code-reader",
        prompt:
          "Read and extract the code changes. Fetch the diff for the specified pull request or file paths.",
        repoVar: "repo",
        prVar: "pr",
        includeContext: true,
        contextLines: 5,
      },
    },
    {
      id: step("review-analyze"),
      name: "Find Issues",
      discipline: "ultrabrain",
      dependencies: [step("review-read")],
      config: {
        tool: "analyzer",
        prompt:
          "Perform a thorough code review analysis checking for bugs, security vulnerabilities, performance issues, and anti-patterns.",
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
    {
      id: step("review-report"),
      name: "Generate Review Report",
      discipline: "deep",
      dependencies: [step("review-analyze")],
      config: {
        tool: "reporter",
        prompt:
          "Generate a comprehensive code review report organized by severity with file locations, suggested fixes, and an overall assessment.",
        inputFrom: step("review-analyze"),
        format: "markdown",
        includeCodeSnippets: true,
        includeFixSuggestions: true,
      },
    },
  ],
};

// ─── TemplateRegistry ───────────────────────────────────────────────────

export class TemplateRegistry {
  private readonly templates = new Map<string, WorkflowTemplate>();

  constructor() {
    // Pre-register built-in templates
    this.register("research", researchTemplate);
    this.register("content", contentTemplate);
    this.register("code-review", codeReviewTemplate);
  }

  /** Register a template under the given name. Overwrites any existing entry. */
  register(name: string, template: WorkflowTemplate): void {
    this.templates.set(name, template);
  }

  /** Retrieve a template by name, or `undefined` if not registered. */
  get(name: string): WorkflowTemplate | undefined {
    return this.templates.get(name);
  }

  /** Check whether a template with the given name exists. */
  has(name: string): boolean {
    return this.templates.has(name);
  }

  /** List all registered template names. */
  list(): string[] {
    return Array.from(this.templates.keys());
  }

  /** Get all registered templates as an array of `[name, template]` pairs. */
  entries(): Array<[string, WorkflowTemplate]> {
    return Array.from(this.templates.entries());
  }
}
