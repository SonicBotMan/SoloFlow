import { describe, it, expect } from "bun:test";
import { canTransition, transition } from "../src/core/fsm";
import { WORKFLOW_TRANSITIONS } from "../src/types";
import type { WorkflowState } from "../src/types";

// ─── canTransition ────────────────────────────────────────────────────────

describe("canTransition", () => {
  it("allows idle → queued", () => {
    expect(canTransition("idle", "queued")).toBe(true);
  });

  it("allows queued → running", () => {
    expect(canTransition("queued", "running")).toBe(true);
  });

  it("allows queued → cancelled", () => {
    expect(canTransition("queued", "cancelled")).toBe(true);
  });

  it("allows running → paused", () => {
    expect(canTransition("running", "paused")).toBe(true);
  });

  it("allows running → completed", () => {
    expect(canTransition("running", "completed")).toBe(true);
  });

  it("allows running → failed", () => {
    expect(canTransition("running", "failed")).toBe(true);
  });

  it("allows running → cancelled", () => {
    expect(canTransition("running", "cancelled")).toBe(true);
  });

  it("allows paused → running", () => {
    expect(canTransition("paused", "running")).toBe(true);
  });

  it("allows paused → cancelled", () => {
    expect(canTransition("paused", "cancelled")).toBe(true);
  });

  it("allows failed → queued", () => {
    expect(canTransition("failed", "queued")).toBe(true);
  });

  it("allows cancelled → queued", () => {
    expect(canTransition("cancelled", "queued")).toBe(true);
  });

  it("rejects idle → running (must go through queued)", () => {
    expect(canTransition("idle", "running")).toBe(false);
  });

  it("rejects completed → anything (terminal state)", () => {
    const terminalTransitions = WORKFLOW_TRANSITIONS["completed"];
    expect(terminalTransitions).toEqual([]);
    expect(canTransition("completed", "queued")).toBe(false);
    expect(canTransition("completed", "running")).toBe(false);
    expect(canTransition("completed", "idle")).toBe(false);
  });

  it("rejects idle → idle (self-transition)", () => {
    expect(canTransition("idle", "idle")).toBe(false);
  });

  it("rejects paused → queued (must go through running)", () => {
    expect(canTransition("paused", "queued")).toBe(false);
  });
});

// ─── transition ───────────────────────────────────────────────────────────

describe("transition", () => {
  it("returns the target state for valid transitions", () => {
    expect(transition("idle", "queued")).toBe("queued");
    expect(transition("queued", "running")).toBe("running");
    expect(transition("running", "paused")).toBe("paused");
    expect(transition("paused", "running")).toBe("running");
    expect(transition("running", "completed")).toBe("completed");
    expect(transition("failed", "queued")).toBe("queued");
  });

  it("throws Error for invalid transitions", () => {
    expect(() => transition("idle", "running")).toThrow(
      "Invalid state transition: idle → running",
    );
  });

  it("throws Error when transitioning from completed", () => {
    expect(() => transition("completed", "queued")).toThrow(
      "Invalid state transition: completed → queued",
    );
  });

  it("throws Error with correct from/to in message", () => {
    try {
      transition("paused", "completed");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe(
        "Invalid state transition: paused → completed",
      );
    }
  });

  it("validates all transitions defined in WORKFLOW_TRANSITIONS", () => {
    for (const [from, targets] of Object.entries(WORKFLOW_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransition(from as WorkflowState, to)).toBe(true);
      }
    }
  });
});
