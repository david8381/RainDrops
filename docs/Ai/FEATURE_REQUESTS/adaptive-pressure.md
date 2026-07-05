# Feature: Adaptive Speed/Drops

Status: landed
Owner: Codex
Last Updated: 2026-07-05
Related Commits: pending

## User Request
Add an optional adaptive Speed/Drops mode where the game estimates the pressure a
player can comfortably keep up with. When enabled, the Speed and Drops controls
should be locked but still visibly move as the game adjusts them; when disabled,
the player can move them manually again. Adaptive mode should start from the
currently visible Speed/Drops values.

## Goal
Give players a low-fuss way to keep ordinary practice challenging without
forcing them to tune two pressure controls by hand.

## Design
- Adaptive mode is an explicit persisted setting.
- It applies only to ordinary practice. Boss, Blitz, Wave, Worksheet, Test Me,
  Breather, and paused states do not feed or adjust it.
- Turning adaptive on seeds each active operation from the current visible
  Speed/Drops, not from saved history. Turning it off leaves the current
  Speed/Drops values in place.
- Each operation keeps a saved adaptive estimate for continuity and diagnostics,
  but the active run uses a conservative shared target: with multiple operations
  enabled, the lowest current per-op target controls the visible Speed/Drops.
- The decision rule is intentionally conservative: reduce quickly on misses,
  wrong answers, overload, slow responses, or a full board; increase slowly only
  after a clean window of correct, quick, low-load answers.

## Open Questions
- Whether future versions should expose a visible confidence/readiness meter for
  adaptive pressure.
- Whether saved per-op estimates should be offered as an optional starting point
  after the first adaptive session.

## Implementation Notes
- Pure decision logic lives in `src/game-core.js` as
  `deriveAdaptivePressureAdjustment`.
- Persistence lives in `src/player-progress.js` as profile settings plus
  per-skill `adaptivePressure`.
- Runtime orchestration stays in `script.js` with the other tightly coupled
  practice controls and drop-event recording.
- Desktop uses an Adaptive checkbox near Speed/Drops; touch uses an Auto button
  in the compact control row.

## Acceptance Criteria
- Adaptive can be toggled on/off on desktop and touch.
- While adaptive is on, Speed/Drops cannot be manually edited but their displayed
  values update as adaptive decisions change them.
- Text size remains editable whenever normal practice controls are not locked.
- Boss/challenge/Test Me activity does not adjust adaptive Speed/Drops.
- The setting and per-op estimates persist in the local profile.

## Testing
- Unit tests cover the adaptive pressure decision helper and persistence shape.
- E2E tests cover desktop lock/move/unlock behavior and touch Auto button
  locking.

## Outcome
Implemented as an optional adaptive ordinary-practice pressure mode with
conservative windowed adjustments and persisted per-operation estimates.
