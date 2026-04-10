/**
 * SoloFlow — Prometheus-style Planning Module
 *
 * Interview-mode planner inspired by oh-my-openagent's Prometheus agent.
 * Guides users through clarifying questions, classifies the discipline,
 * and generates structured workflow templates with dependency-aware steps.
 */

import type {
  AgentDiscipline,
  StepId,
  WorkflowStep,
  WorkflowTemplate,
} from "../types.js";
import { randomUUID } from "node:crypto";
import { routeToDiscipline, DISCIPLINE_CONFIGS } from "../agents/discipline.js";

// ─── Configuration ────────────────────────────────────────────────────

export interface PlannerConfig {
  /** Max clarifying questions before forcing a decision (default: 3). */
  maxQuestions: number;
  /** Confidence score at which the planner skips remaining questions (default: 0.8). */
  confidenceThreshold: number;
  /** LLM model identifier used for planning prompts. */
  model: string;
  /** Sampling temperature for planning. */
  temperature: number;
}

const DEFAULT_CONFIG: Readonly<PlannerConfig> = {
  maxQuestions: 3,
  confidenceThreshold: 0.8,
  model: "claude-3-sonnet",
  temperature: 0.4,
};

// ─── Planning Phase ───────────────────────────────────────────────────

export enum PlanningPhase {
  INITIAL = "initial",
  CLARIFYING = "clarifying",
  PLANNING = "planning",
  CONFIRMING = "confirming",
  DONE = "done",
}

// ─── Context QA Pair ──────────────────────────────────────────────────

interface ContextQA {
  question: string;
  answer: string;
}

// ─── Ambiguity Area ───────────────────────────────────────────────────

type AmbiguityArea =
  | "scope"
  | "constraints"
  | "priorities"
  | "examples"
  | "success-criteria";

const AMBIGUITY_QUESTIONS: Readonly<Record<AmbiguityArea, string>> = {
  scope:
    "Could you clarify the scope of this task? What exactly should be included or excluded?",
  constraints:
    "Are there any specific constraints I should be aware of (technology, time, budget, etc.)?",
  priorities:
    "What matters most here — speed, quality, thoroughness, or something else?",
  examples:
    "Do you have an example or reference output that shows what you're looking for?",
  "success-criteria":
    "How will you know this is done well? What does success look like?",
};

const AMBIGUITY_KEYWORDS: ReadonlyArray<{
  area: AmbiguityArea;
  patterns: readonly string[];
}> = [
  {
    area: "scope",
    patterns: [
      "everything",
      "all",
      "stuff",
      "things",
      "something",
      "anything",
    ],
  },
  {
    area: "constraints",
    patterns: [
      "whatever",
      "doesn't matter",
      "any",
      "no preference",
      "unsure",
    ],
  },
  {
    area: "priorities",
    patterns: [
      "best",
      "good",
      "nice",
      "proper",
      "right",
      "correct",
      "better",
    ],
  },
  {
    area: "examples",
    patterns: [
      "like",
      "similar to",
      "kind of",
      "sort of",
      "style of",
    ],
  },
  {
    area: "success-criteria",
    patterns: [
      "done",
      "finished",
      "complete",
      "ready",
      "working",
      "good enough",
    ],
  },
];

// ─── Planning Session ─────────────────────────────────────────────────

export class PlanningSession {
  id: string;
  phase: PlanningPhase;
  originalRequest: string;
  context: string[];
  private qaHistory: ContextQA[];
  inferredDiscipline?: AgentDiscipline;
  suggestedSteps: WorkflowStep[];
  confidence: number;
  createdAt: number;
  expiresAt: number;
  private readonly config: PlannerConfig;
  private readonly askedAreas: Set<AmbiguityArea>;

  constructor(
    id: string,
    request: string,
    config: PlannerConfig,
  ) {
    this.id = id;
    this.phase = PlanningPhase.INITIAL;
    this.originalRequest = request;
    this.context = [];
    this.qaHistory = [];
    this.suggestedSteps = [];
    this.confidence = 0;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + 30 * 60 * 1000; // 30 min timeout
    this.config = config;
    this.askedAreas = new Set();
  }

  /** Read-only accessor for Q&A history. */
  get qa(): readonly ContextQA[] {
    return this.qaHistory;
  }

  /** Number of questions asked so far. */
  get questionsAsked(): number {
    return this.qaHistory.length;
  }

  /** Whether the session has expired. */
  get isExpired(): boolean {
    return Date.now() > this.expiresAt;
  }

  /** Record a Q&A pair and update context. */
  recordQA(question: string, answer: string): void {
    this.qaHistory.push({ question, answer });
    this.context.push(`Q: ${question}`);
    this.context.push(`A: ${answer}`);
  }

  /** Mark an ambiguity area as already asked. */
  markAsked(area: AmbiguityArea): void {
    this.askedAreas.add(area);
  }

  /** Check if an area has been asked already. */
  hasAsked(area: AmbiguityArea): boolean {
    return this.askedAreas.has(area);
  }

  /** Whether the planner has exhausted its question budget. */
  get maxQuestionsReached(): boolean {
    return this.questionsAsked >= this.config.maxQuestions;
  }

  /** Whether confidence is high enough to skip further questions. */
  get confidenceSufficient(): boolean {
    return this.confidence >= this.config.confidenceThreshold;
  }
}

// ─── Plan Result ──────────────────────────────────────────────────────

export interface PlanResult {
  template: WorkflowTemplate;
  discipline: AgentDiscipline;
  confidence: number;
  reasoning: string;
}

// ─── Planner ──────────────────────────────────────────────────────────

export class Planner {
  private readonly config: PlannerConfig;
  private readonly sessions = new Map<string, PlanningSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private stepCounter = 0;

  constructor(config?: Partial<PlannerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupLoop();
  }

  // ── Session Lifecycle ────────────────────────────────────────────────

  /**
   * Start a new planning session for the given request.
   * Analyses the request, sets initial confidence and phase.
   */
  startSession(request: string): PlanningSession {
    const id = generateId();
    const session = new PlanningSession(id, request, this.config);

    const ambiguity = detectAmbiguity(request);
    const discipline = routeToDiscipline(request);

    session.inferredDiscipline = discipline;
    session.confidence = calculateInitialConfidence(request, ambiguity);
    session.context.push(`Original request: ${request}`);

    if (ambiguity.length > 0 && session.confidence < this.config.confidenceThreshold) {
      session.phase = PlanningPhase.CLARIFYING;
    } else {
      session.phase = PlanningPhase.PLANNING;
    }

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Retrieve an active session by ID.
   * Returns `undefined` if not found or expired.
   */
  getSession(id: string): PlanningSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (session.isExpired) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  /**
   * Destroy the cleanup timer. Call when shutting down the plugin.
   */
  dispose(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }

  // ── Clarifying Questions ─────────────────────────────────────────────

  /**
   * Get the next clarifying question for a session, or `null` if none needed.
   * Returns `null` when:
   *   - confidence is above threshold
   *   - max questions reached
   *   - no remaining ambiguity areas
   *   - session is not in CLARIFYING phase
   */
  getNextQuestion(session: PlanningSession): string | null {
    if (session.phase !== PlanningPhase.CLARIFYING) return null;
    if (session.maxQuestionsReached) return null;
    if (session.confidenceSufficient) return null;
    if (session.isExpired) return null;

    const ambiguity = detectAmbiguity(session.originalRequest);

    const allText = [session.originalRequest, ...session.context].join(" ");
    const answerAmbiguity = detectAmbiguity(allText);

    const combined = new Set([...ambiguity, ...answerAmbiguity]);

    for (const area of combined) {
      if (!session.hasAsked(area)) {
        session.markAsked(area);
        return AMBIGUITY_QUESTIONS[area];
      }
    }

    return null;
  }

  /**
   * Process a user's answer to the current question.
   * Updates the session context, re-evaluates confidence and discipline.
   */
  processAnswer(session: PlanningSession, answer: string): void {
    if (session.isExpired) return;

    const lastQA = session.qa[session.qa.length - 1];
    const question = lastQA?.question ?? "(initial analysis)";

    session.recordQA(question, answer);

    const combinedText = [
      session.originalRequest,
      ...session.context,
    ].join(" ");

    const newDiscipline = routeToDiscipline(combinedText);
    if (newDiscipline !== session.inferredDiscipline) {
      session.inferredDiscipline = newDiscipline;
    }

    const ambiguity = detectAmbiguity(answer);
    const answerBoost = ambiguity.length === 0 ? 0.2 : 0.05;
    session.confidence = Math.min(1, session.confidence + answerBoost);

    if (session.confidenceSufficient || session.maxQuestionsReached) {
      session.phase = PlanningPhase.PLANNING;
    }
  }

  // ── Plan Generation ──────────────────────────────────────────────────

  /**
   * Generate a workflow template from the session's accumulated context.
   * Transitions the session to CONFIRMING phase.
   * Returns the plan result including template, discipline, and reasoning.
   *
   * @throws {Error} if the session is not in PLANNING phase or is expired.
   */
  generatePlan(session: PlanningSession): PlanResult {
    if (session.isExpired) {
      throw new Error(`Planning session ${session.id} has expired.`);
    }

    if (session.phase !== PlanningPhase.PLANNING) {
      throw new Error(
        `Cannot generate plan: session is in ${session.phase} phase, expected PLANNING.`,
      );
    }

    const discipline = session.inferredDiscipline ?? "quick";
    const steps = this.buildStepsFromContext(session, discipline);

    session.suggestedSteps = steps;
    session.phase = PlanningPhase.CONFIRMING;

    const template: WorkflowTemplate = {
      name: deriveTemplateName(session.originalRequest),
      description: buildTemplateDescription(session),
      steps: steps.map((s) => ({
        id: s.id,
        name: s.name,
        discipline: s.discipline,
        dependencies: s.dependencies,
        config: s.config,
      })),
    };

    return {
      template,
      discipline,
      confidence: session.confidence,
      reasoning: buildReasoning(session, discipline),
    };
  }

  /**
   * Confirm the generated plan. Transitions the session to DONE.
   *
   * @throws {Error} if the session is not in CONFIRMING phase.
   */
  confirmPlan(session: PlanningSession): void {
    if (session.phase !== PlanningPhase.CONFIRMING) {
      throw new Error(
        `Cannot confirm plan: session is in ${session.phase} phase, expected CONFIRMING.`,
      );
    }

    session.phase = PlanningPhase.DONE;
  }

  /**
   * Reject the plan and return to clarifying phase for more context.
   * Optionally accepts feedback to incorporate.
   */
  rejectPlan(session: PlanningSession, feedback?: string): void {
    if (session.phase !== PlanningPhase.CONFIRMING) {
      throw new Error(
        `Cannot reject plan: session is in ${session.phase} phase, expected CONFIRMING.`,
      );
    }

    if (feedback) {
      session.context.push(`User feedback on plan: ${feedback}`);
    }

    session.confidence = Math.max(0.1, session.confidence - 0.3);
    session.suggestedSteps = [];
    session.phase = PlanningPhase.CLARIFYING;
  }

  // ── Session Management ───────────────────────────────────────────────

  /** Remove a specific session. */
  deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  /** List all active (non-expired) sessions. */
  listSessions(): PlanningSession[] {
    this.purgeExpired();
    return Array.from(this.sessions.values());
  }

  /** Number of active sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  // ── Private: Cleanup ─────────────────────────────────────────────────

  private startCleanupLoop(): void {
    this.cleanupTimer = setInterval(() => this.purgeExpired(), 5 * 60 * 1000);
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(id);
      }
    }
  }

  // ── Private: Step Generation ─────────────────────────────────────────

  /**
   * Build WorkflowSteps from the accumulated session context.
   * Uses a keyword-driven heuristic to decompose the task into ordered steps.
   */
  private buildStepsFromContext(
    session: PlanningSession,
    discipline: AgentDiscipline,
  ): WorkflowStep[] {
    const fullText = [session.originalRequest, ...session.context].join(" ");
    const steps: WorkflowStep[] = [];

    const subTasks = extractSubTasks(fullText);

    if (subTasks.length === 0) {
      steps.push(this.makeStep(session.originalRequest, discipline, []));
      return steps;
    }

    const primaryDiscipline = discipline;

    for (let i = 0; i < subTasks.length; i++) {
      const subTask = subTasks[i]!;
      const taskDiscipline = routeToDiscipline(subTask);
      const prevStep = i > 0 ? steps[i - 1] : undefined;
      const deps: StepId[] = prevStep ? [prevStep.id] : [];
      steps.push(this.makeStep(subTask, taskDiscipline, deps));
    }

    if (steps.length >= 3) {
      const lastStep = steps[steps.length - 1]!;
      steps.push(
        this.makeStep(
          `Verify and validate: ${session.originalRequest}`,
          primaryDiscipline === "ultrabrain" ? "ultrabrain" : "deep",
          [lastStep.id],
        ),
      );
    }

    return steps;
  }

  private makeStep(
    description: string,
    discipline: AgentDiscipline,
    dependencies: StepId[],
  ): WorkflowStep {
    this.stepCounter++;
    const id = `step_${this.stepCounter}` as unknown as StepId;

    return {
      id,
      name: truncate(description, 80),
      discipline,
      dependencies,
      config: {
        prompt: description,
        discipline,
        ...(DISCIPLINE_CONFIGS[discipline]
          ? { model: DISCIPLINE_CONFIGS[discipline].defaultModel }
          : {}),
      },
      state: "pending",
    };
  }
}

// ─── Internal: Ambiguity Detection ────────────────────────────────────

/**
 * Detect ambiguity areas in a text string.
 * Returns the set of ambiguity areas found.
 */
function detectAmbiguity(text: string): AmbiguityArea[] {
  const lower = text.toLowerCase();
  const found: AmbiguityArea[] = [];

  for (const entry of AMBIGUITY_KEYWORDS) {
    for (const pattern of entry.patterns) {
      if (lower.includes(pattern)) {
        if (!found.includes(entry.area)) {
          found.push(entry.area);
        }
        break;
      }
    }
  }

  if (text.split(/\s+/).length < 5 && !found.includes("scope")) {
    found.push("scope");
  }

  return found;
}

// ─── Internal: Confidence ─────────────────────────────────────────────

/**
 * Calculate an initial confidence score (0–1) for a request.
 * Higher when the request is specific, low ambiguity, clear discipline.
 */
function calculateInitialConfidence(
  request: string,
  ambiguity: AmbiguityArea[],
): number {
  let confidence = 0.5;

  const wordCount = request.split(/\s+/).length;
  if (wordCount > 20) confidence += 0.15;
  else if (wordCount > 10) confidence += 0.08;

  const techTerms = [
    "api",
    "database",
    "function",
    "class",
    "component",
    "endpoint",
    "model",
    "test",
    "deploy",
    "refactor",
    "debug",
    "build",
    "config",
    "service",
    "module",
  ];
  const lower = request.toLowerCase();
  const techCount = techTerms.filter((t) => lower.includes(t)).length;
  confidence += Math.min(0.15, techCount * 0.05);

  confidence -= ambiguity.length * 0.1;

  if (wordCount < 5) confidence -= 0.15;

  return clamp01(confidence);
}

// ─── Internal: Helpers ────────────────────────────────────────────────

function extractSubTasks(text: string): string[] {
  const tasks: string[] = [];

  const separators = [
    /\band\b/gi,
    /\bthen\b/gi,
    /\bafter that\b/gi,
    /\bnext\b/gi,
    /\bfinally\b/gi,
    /\n/g,
    /;\s*/g,
    /(?:^|\s)[-•]\s*/gm,
  ];

  let parts: string[] = [text];

  for (const sep of separators) {
    const candidate = text.split(sep).map((s) => s.trim()).filter(Boolean);
    if (candidate.length > parts.length) {
      parts = candidate;
    }
  }

  for (const part of parts) {
    const words = part.split(/\s+/).length;
    if (words > 3) {
      tasks.push(part);
    }
  }

  if (tasks.length <= 1) {
    const actionPatterns = [
      /(?:please\s+)?(create|build|write|design|implement|add|fix|update|remove|refactor|test|deploy|analyze|research|review|optimize)\b[^.]*\./gi,
    ];

    for (const pattern of actionPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[0] && match[0].trim().split(/\s+/).length > 3) {
          tasks.push(match[0].trim());
        }
      }
    }
  }

  const seen = new Set<string>();
  return tasks.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generateId(): string {
  return `plan_${Date.now().toString(36)}_${randomUUID()}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

function deriveTemplateName(request: string): string {
  const first = request.split(/[.!?\n]/)[0] ?? request;
  const words = first.trim().split(/\s+/).slice(0, 8);
  const name = words.join(" ");
  return name.length > 60 ? truncate(name, 60) : name;
}

function buildTemplateDescription(session: PlanningSession): string {
  const parts = [session.originalRequest];
  if (session.qa.length > 0) {
    parts.push("Context gathered through planning interview.");
  }
  return parts.join(" — ");
}

function buildReasoning(
  session: PlanningSession,
  discipline: AgentDiscipline,
): string {
  const lines: string[] = [];

  lines.push(
    `Classified as "${discipline}" discipline based on request analysis.`,
  );
  lines.push(
    `Confidence: ${(session.confidence * 100).toFixed(0)}% (${session.questionsAsked} clarifying question${session.questionsAsked !== 1 ? "s" : ""} asked).`,
  );

  if (session.confidenceSufficient) {
    lines.push("High confidence — sufficient context to generate plan.");
  } else if (session.maxQuestionsReached) {
    lines.push("Max questions reached — generating plan with available context.");
  }

  return lines.join(" ");
}
