# Feature: Answer-space-aware cannon overload

Status: landed
Owner: shared (Codex design, Claude implementation)
Last Updated: 2026-06-29
Related Commits: dcde149

## User Request
David flagged a "false-fire" exploit: on levels with a tiny answer space, a player
can clear drops by rapidly cycling the few possible answers instead of actually
doing the math. Example: L1 subtraction answers are only `{0, 1, 2}`, so in a Wave 2
a player can brute-force the round by luck.

## Goal
Make brute-force guessing on small-answer-space levels ineffective, without a
hardcoded "subtraction L1" special-case, without penalizing genuine learning, and
without changing the protections for partial typing / edits / fractions / SI / factor
entry.

## Design
Tie the cost of a false fire (an impossible submission — one that matches no visible
target) to *how guessable the board is*, then heat the cannon by that weight.

- A false fire is harsher when a random guess is likely to clear a visible target
  (small answer space, several distinct answers on screen).
- It stays forgiving when the answer space is large.
- Pure helpers in `game-core.js`:
  - `getAnswerUniverse(opKey, level)` / `getDistinctAnswerCount` — arithmetic is
    enumerated from `getDifficultyRange` (matching `generateProblem` exactly:
    subtraction = `|a-b|`, division's answer = quotient); shapes/pow from their
    universes; SI from its distinct conversions. f10 (instance-varying numeric) and
    factor (non-guessable strings) intentionally yield an empty set → cost 1.
  - `falseFireCost({ distinctAnswerCount, visibleDistinctAnswers })` →
    `effectiveChoices = distinctAnswerCount / visibleDistinctAnswers`, bucketed by
    the tunable `FALSE_FIRE_COST_TIERS` (`≤2→4, ≤4→3, ≤8→2, else→1`).
- `script.js` keeps the existing windowed overload but sums weighted heat instead of
  counting; `getActiveAnswerSpace()` supplies the universe (boss/placement lock to
  their op+level; else the enabled practice ops) and the on-screen distinct answers.

Deliberately unchanged: no shield drain for typos, no mastery-stat impact.

## Open Questions
- **Calibration vs. genuine beginners (for playtest):** cost-4 + threshold-5 means
  the *2nd* quick miss overloads on a 3-answer level — a 5-year-old who truly doesn't
  know `2-1` looks the same as a brute-forcer. The cooldown is brief and stat-clean,
  so likely fine, but it's a feel call. Tunable via `FALSE_FIRE_COST_TIERS`.
- **f10 cost-1 (for playtest):** f10's real answer space is large/instance-varying so
  it's treated as forgiving; revisit if x10 feels brute-forceable.

## Implementation Notes
- Overload path: `registerWrongSubmission` / `getActiveAnswerSpace` in `script.js`;
  state on `state.wrongSubmissionTimes` is now `{ time, cost }[]`.
- Known limit: the penalty only fires on *misses*, but a tiny space is cleared via
  *hits*. So it reliably curbs *sustained* guessing (over a Wave, misses accumulate →
  overload) but won't stop an isolated lucky round. If single-round luck ever needs
  killing, that's a different lever (don't show two targets whose answers are both in
  a tiny set, or require the typed value to match the *targeted* drop).

## Acceptance Criteria
- L1 subtraction overloads in ~2 false fires; large spaces keep the original ~5.
- Correct answers are ignored during the overload cooldown.
- Partial/prefix/fraction/SI/factor inputs are not counted as false fires.
- No change to mastery accuracy or boss/Blitz/Wave shields from typed wrong answers.

## Testing
- Unit (`game-core.test.js`): answer-space sizing (sub L1=3, add L1=5, div L1=3,
  mul L1=6; sub L10>8; f10/factor=0) and the cost tiers.
- E2E (`rain-math.spec.js`): small space overloads in ~2 misses, large space in ~5;
  existing "rapid impossible submissions briefly overload the cannon" still passes.

## Outcome
Landed in `dcde149` (v0.3.111). 71 unit + 168 e2e green, typecheck clean. Two
playtest items above remain David's call; tiers centralized for tuning.
