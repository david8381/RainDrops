# Codebase Review

## Snapshot
Rain Math is a small static browser game with a focused production surface: HTML, CSS, browser JavaScript, extracted pure-core rules, and a local progress module. The game is easy to host on GitHub Pages and now has a repeatable dev-only test harness.

## Strengths
- The runtime is simple: no production dependencies, no bundler, and no backend.
- The gameplay loop is responsive and direct: immediate clear for simple answers, Enter only for symbolic/multi-step answers.
- The current operation set is broad for the app size: arithmetic, decimal shifting, SI conversions, geometry, and prime factorization.
- Core math behavior is now separated into `src/game-core.js`, making regressions much easier to catch.
- Learning progress is stored in a backend-shaped local profile, including Speed/Drops settings, derived pressure metadata, boss clears, and Blitz/Wave/Boss challenge attempts and bests, so future backend sync can reuse the same event semantics.
- Playwright tests exercise real desktop and mobile browser behavior instead of relying only on DOM shims.

## Changes Made During Review
- Extracted DOM-free game rules from `script.js` into `src/game-core.js`.
- Kept browser loading as classic scripts so opening `index.html` directly from disk still works.
- Added deterministic unit tests for core math/problem behavior.
- Added a local player progress module for per-problem outcomes, 3-attempt/90%-current-accuracy boss readiness scoring, and boss-readiness recommendations.
- Added a local Login popup for creating and switching named localStorage profiles.
- Added a Results popup for current readiness and weak-practice suggestions.
- Added opt-in boss mode as the current level-advancement test, with Wave 1 shield endurance, Wave 2 load ladder, multi-node mothership parts, answerable bombs, falling part debris, and short stun behavior.
- Added Spacebar Breather mode as a practice-only way to clear the current board without new spawns or drop motion.
- Added player-controlled Speed/Drops practice pressure and optional Blitz fluency tracking without making higher pressure block content-level advancement.
- Added deterministic unit tests for the player progress profile.
- Added Playwright browser tests for desktop input flows and mobile keypad flows.
- Added a gated `?test=1` API for deterministic browser tests.
- Added a CI test workflow separate from the Pages deploy workflow.

## Scoped Bugs Fixed
- Factor targeting had a `fromTargeting` option but did not pass it from the targeted input path, so a final prime could still auto-complete instead of requiring explicit entry.
- A targeted factor drop could become complete but not clear on Enter because the input was already empty. Enter now clears the completed targeted drop and increments score.

## Remaining Risks And Follow-Ups
- Versioning is stamped automatically by the `.githooks/pre-commit` hook (`core.hooksPath = .githooks`), which runs `scripts/stamp-version.sh` and stages `index.html` + `package.json`, so each commit bumps the patch and cache-busters. `npm run stamp 0.4.0` sets an explicit version. Note the patch climbs on every commit, including docs-only ones.
- External services are not end-to-end tested: FormSubmit submission and GoatCounter analytics are intentionally not exercised by Playwright.
- Canvas tests are smoke-level only. They verify that the canvas paints, not exact rendering.
- Progress persists locally only. There is no backend sync, authentication, or player-facing export flow yet.
- The game has no lint/formatter policy. The current preference remains simple readable JavaScript over more tooling.

## Current Test Posture
The suite now covers the highest-risk behavior: pure math rules, local progress/readiness logic, and real browser workflows. Future operation additions should start with unit tests in `tests/unit/game-core.test.js` and `tests/unit/player-progress.test.js`, including the operation's level-universe size, then add one focused browser path if the operation changes input behavior, progress events, or UI.
