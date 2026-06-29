// Shared engine-state predicates: cheap boolean queries over `state` used all
// across the codebase ("are we in boss mode / placement / stunned / locked?").
// They live here (not in the boss section) because they're state queries, not
// boss internals — which keeps the boss code from looking like everyone's
// dependency.
import { state } from "./state.js";

export function isBossActive() {
  return Boolean(state.bossMode?.active);
}

export function isPlacementActive() {
  return Boolean(state.placementState?.active);
}

export function isPlacementDrop(drop) {
  return Boolean(isPlacementActive() && drop?.placementRunId === state.placementState.runId);
}

export function isControlLocked() {
  return isBossActive() || isPlacementActive();
}

export function isBossStunned() {
  return Boolean(state.bossMode?.active && state.bossMode.stunMs > 0);
}
