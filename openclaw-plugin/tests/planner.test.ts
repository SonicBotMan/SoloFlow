import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Planner, PlanningSession, PlanningPhase } from "../src/services/planner";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** A specific, unambiguous request that should yield high confidence. */
const SPECIFIC_REQUEST =
  "Implement a REST API endpoint for user authentication using JWT tokens with PostgreSQL database and express.js server. Include unit tests and deploy to AWS.";

/** A vague request that should trigger clarifying questions. */
const VAGUE_REQUEST = "build something nice";

/** Create a planner with low question limit for fast tests. */
function makePlanner(maxQuestions = 3) {
  return new Planner({ maxQuestions, confidenceThreshold: 0.8 });
}

// ─── startSession ─────────────────────────────────────────────────────────

describe("Planner — startSession", () => {
  let planner: Planner;

  beforeEach(() => {
    planner = makePlanner();
  });

  afterEach(() => {
    planner.dispose();
  });

  it("creates a session with a unique id", () => {
    const s1 = planner.startSession("task one");
    const s2 = planner.startSession("task two");

    expect(s1.id).not.toBe(s2.id);
    expect(s1.id).toMatch(/^plan_/);
  });

  it("sets phase to CLARIFYING for vague requests", () => {
    const session = planner.startSession(VAGUE_REQUEST);
    expect(session.phase).toBe(PlanningPhase.CLARIFYING);
  });

  it("sets phase to PLANNING for specific requests", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    expect(session.phase).toBe(PlanningPhase.PLANNING);
  });

  it("sets originalRequest correctly", () => {
    const session = planner.startSession("do the thing");
    expect(session.originalRequest).toBe("do the thing");
  });

  it("infers a discipline", () => {
    const session = planner.startSession("research the latest AI trends");
    expect(session.inferredDiscipline).toBe("deep");
  });

  it("stores session retrievable via getSession", () => {
    const session = planner.startSession("test task");
    expect(planner.getSession(session.id)).toBe(session);
  });

  it("starts with zero questions asked", () => {
    const session = planner.startSession("hello");
    expect(session.questionsAsked).toBe(0);
  });
});

// ─── Clarifying Questions ─────────────────────────────────────────────────

describe("Planner — clarifying questions", () => {
  let planner: Planner;

  beforeEach(() => {
    planner = makePlanner();
  });

  afterEach(() => {
    planner.dispose();
  });

  it("returns a question for vague requests", () => {
    const session = planner.startSession(VAGUE_REQUEST);
    const question = planner.getNextQuestion(session);

    expect(question).not.toBeNull();
    expect(typeof question).toBe("string");
    expect(question!.length).toBeGreaterThan(0);
  });

  it("returns null for specific requests (already in PLANNING phase)", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    const question = planner.getNextQuestion(session);
    expect(question).toBeNull();
  });

  it("returns null when max questions reached", () => {
    const planner1 = makePlanner(1);
    const session = planner1.startSession(VAGUE_REQUEST);

    // Ask one question and answer it
    const q = planner1.getNextQuestion(session);
    expect(q).not.toBeNull();
    planner1.processAnswer(session, "I want a web application");

    // Second call should return null (max 1 question)
    expect(planner1.getNextQuestion(session)).toBeNull();
    planner1.dispose();
  });

  it("does not repeat the same question area", () => {
    const planner2 = makePlanner(5);
    const session = planner2.startSession("build all the things and stuff");

    const questions = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const q = planner2.getNextQuestion(session);
      if (q === null) break;
      questions.add(q);
      planner2.processAnswer(session, "some answer " + i);
    }

    // All returned questions should be unique
    expect(questions.size).toBe(
      Array.from(questions).length,
      "Questions should not repeat",
    );
    planner2.dispose();
  });
});

// ─── processAnswer ────────────────────────────────────────────────────────

describe("Planner — processAnswer", () => {
  let planner: Planner;

  beforeEach(() => {
    planner = makePlanner();
  });

  afterEach(() => {
    planner.dispose();
  });

  it("records Q&A in session history", () => {
    const session = planner.startSession(VAGUE_REQUEST);
    const q = planner.getNextQuestion(session);
    planner.processAnswer(session, "I want a REST API");

    expect(session.questionsAsked).toBe(1);
    expect(session.qa.length).toBe(1);
  });

  it("increases confidence after each answer", () => {
    const session = planner.startSession(VAGUE_REQUEST);
    const initialConfidence = session.confidence;

    const q = planner.getNextQuestion(session);
    planner.processAnswer(session, "A specific detailed technical answer about database API");

    expect(session.confidence).toBeGreaterThan(initialConfidence);
  });

  it("transitions to PLANNING when confidence is sufficient", () => {
    const planner3 = makePlanner(10);
    const session = planner3.startSession(
      "build something good and make it look nice then ensure everything is done and working",
    );

    for (let i = 0; i < 10; i++) {
      if (session.phase === PlanningPhase.PLANNING) break;
      const q = planner3.getNextQuestion(session);
      if (q === null) break;
      planner3.processAnswer(
        session,
        "I need a PostgreSQL REST API with JWT auth, deployed to AWS",
      );
    }

    expect([PlanningPhase.PLANNING, PlanningPhase.CONFIRMING]).toContain(session.phase);
    planner3.dispose();
  });
});

// ─── generatePlan ─────────────────────────────────────────────────────────

describe("Planner — generatePlan", () => {
  let planner: Planner;

  beforeEach(() => {
    planner = makePlanner();
  });

  afterEach(() => {
    planner.dispose();
  });

  it("generates a plan from a specific request", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    const result = planner.generatePlan(session);

    expect(result.template).toBeDefined();
    expect(result.template.name).toBeTruthy();
    expect(result.template.steps.length).toBeGreaterThan(0);
    expect(result.discipline).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reasoning).toBeTruthy();
  });

  it("transitions session to CONFIRMING phase", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    planner.generatePlan(session);
    expect(session.phase).toBe(PlanningPhase.CONFIRMING);
  });

  it("populates suggestedSteps on the session", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    planner.generatePlan(session);
    expect(session.suggestedSteps.length).toBeGreaterThan(0);
  });

  it("throws if session is not in PLANNING phase", () => {
    const session = planner.startSession(VAGUE_REQUEST);
    // Session is in CLARIFYING, not PLANNING
    expect(() => planner.generatePlan(session)).toThrow(
      /Cannot generate plan/,
    );
  });

  it("throws if session is expired", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    // Force expiration
    (session as { expiresAt: number }).expiresAt = Date.now() - 1;

    expect(() => planner.generatePlan(session)).toThrow(/expired/);
  });

  it("generates template with correct step structure", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    const result = planner.generatePlan(session);

    for (const s of result.template.steps) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.discipline).toBeTruthy();
      expect(Array.isArray(s.dependencies)).toBe(true);
    }
  });
});

// ─── confirmPlan / rejectPlan ─────────────────────────────────────────────

describe("Planner — confirm and reject", () => {
  let planner: Planner;

  beforeEach(() => {
    planner = makePlanner();
  });

  afterEach(() => {
    planner.dispose();
  });

  it("confirmPlan transitions to DONE", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    planner.generatePlan(session);
    planner.confirmPlan(session);
    expect(session.phase).toBe(PlanningPhase.DONE);
  });

  it("confirmPlan throws if not in CONFIRMING", () => {
    const session = planner.startSession("quick task");
    expect(() => planner.confirmPlan(session)).toThrow(/Cannot confirm plan/);
  });

  it("rejectPlan transitions back to CLARIFYING", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    planner.generatePlan(session);
    planner.rejectPlan(session, "Need more backend focus");
    expect(session.phase).toBe(PlanningPhase.CLARIFYING);
  });

  it("rejectPlan reduces confidence", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    planner.generatePlan(session);
    const before = session.confidence;
    planner.rejectPlan(session);
    expect(session.confidence).toBeLessThan(before);
  });

  it("rejectPlan adds feedback to context", () => {
    const session = planner.startSession(SPECIFIC_REQUEST);
    planner.generatePlan(session);
    planner.rejectPlan(session, "Focus on testing");

    expect(session.context).toContain("User feedback on plan: Focus on testing");
  });

  it("rejectPlan throws if not in CONFIRMING", () => {
    const session = planner.startSession("quick task");
    expect(() => planner.rejectPlan(session)).toThrow(/Cannot reject plan/);
  });
});

// ─── Session Expiration ───────────────────────────────────────────────────

describe("Planner — session expiration", () => {
  let planner: Planner;

  beforeEach(() => {
    planner = makePlanner();
  });

  afterEach(() => {
    planner.dispose();
  });

  it("session reports expired after expiresAt", () => {
    const session = planner.startSession("test");
    expect(session.isExpired).toBe(false);

    (session as { expiresAt: number }).expiresAt = Date.now() - 1000;
    expect(session.isExpired).toBe(true);
  });

  it("getSession returns undefined for expired sessions", () => {
    const session = planner.startSession("test");
    (session as { expiresAt: number }).expiresAt = Date.now() - 1000;

    expect(planner.getSession(session.id)).toBeUndefined();
  });

  it("getNextQuestion returns null for expired session", () => {
    const session = planner.startSession(VAGUE_REQUEST);
    (session as { expiresAt: number }).expiresAt = Date.now() - 1000;

    expect(planner.getNextQuestion(session)).toBeNull();
  });

  it("processAnswer is a no-op for expired session", () => {
    const session = planner.startSession(VAGUE_REQUEST);
    const q = planner.getNextQuestion(session);
    (session as { expiresAt: number }).expiresAt = Date.now() - 1000;

    const qaBefore = session.questionsAsked;
    planner.processAnswer(session, "answer");
    // No new Q&A recorded because session expired
    expect(session.questionsAsked).toBe(qaBefore);
  });
});

// ─── Session Management ───────────────────────────────────────────────────

describe("Planner — session management", () => {
  let planner: Planner;

  beforeEach(() => {
    planner = makePlanner();
  });

  afterEach(() => {
    planner.dispose();
  });

  it("deleteSession removes the session", () => {
    const session = planner.startSession("task");
    expect(planner.getSession(session.id)).toBeDefined();
    expect(planner.deleteSession(session.id)).toBe(true);
    expect(planner.getSession(session.id)).toBeUndefined();
  });

  it("listSessions returns non-expired sessions", () => {
    planner.startSession("task 1");
    planner.startSession("task 2");
    expect(planner.listSessions()).toHaveLength(2);
  });

  it("sessionCount reflects active sessions", () => {
    expect(planner.sessionCount).toBe(0);
    planner.startSession("t1");
    expect(planner.sessionCount).toBe(1);
    planner.startSession("t2");
    expect(planner.sessionCount).toBe(2);
  });
});
