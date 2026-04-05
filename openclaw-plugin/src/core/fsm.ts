import type { WorkflowState } from "../types";
import { WORKFLOW_TRANSITIONS } from "../types";

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return WORKFLOW_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transition(
  current: WorkflowState,
  target: WorkflowState,
): WorkflowState {
  if (!canTransition(current, target)) {
    throw new Error(`Invalid state transition: ${current} → ${target}`);
  }
  return target;
}
