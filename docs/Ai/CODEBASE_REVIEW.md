# Codebase Review

## Snapshot
Rain Math is a small static browser game with a focused production surface: HTML, CSS, browser JavaScript, and one extracted pure-core module. The game is easy to host on GitHub Pages and now has a repeatable dev-only test harness.

## Strengths
- The runtime is simple: no production dependencies, no bundler, and no backend.
- The gameplay loop is responsive and direct: immediate clear for simple answers, Enter only for symbolic/multi-step answers.
- The current operation set is broad for the app size: arithmetic, decimal shifting, SI conversions, geometry, and prime factorization.
- Core math behavior is now separated into `src/game-core.js`, making regressions much easier to catch.
- Playwright tests exercise real desktop and mobile browser behavior instead of relying only on DOM shims.

## Changes Made During Review
- Extracted DOM-free game rules from `script.js` into `src/game-core.js`.
- Kept browser loading as classic scripts so opening `index.html` directly from disk still works.
- Added deterministic unit tests for core math/problem behavior.
- Added Playwright browser tests for desktop input flows and mobile keypad flows.
- Added a gated `?test=1` API for deterministic browser tests.
- Added a CI test workflow separate from the Pages deploy workflow.

## Scoped Bugs Fixed
- Factor targeting had a `fromTargeting` option but did not pass it from the targeted input path, so a final prime could still auto-complete instead of requiring explicit entry.
- A targeted factor drop could become complete but not clear on Enter because the input was already empty. Enter now clears the completed targeted drop and increments score.

## Remaining Risks And Follow-Ups
- `scripts/stamp-version.sh` looks for `const VERSION = "..."` in `script.js`, but the current app displays the version directly in `index.html`. The pre-commit hook may not update the visible version/cache busters as intended.
- Cache-buster query strings in `index.html` are still manual (`?v=036`).
- External services are not end-to-end tested: FormSubmit submission and GoatCounter analytics are intentionally not exercised by Playwright.
- Canvas tests are smoke-level only. They verify that the canvas paints, not exact rendering.
- `problemStats` is in-memory only; stats reset on page reload.
- The game has no lint/formatter policy. The current preference remains simple readable JavaScript over more tooling.

## Current Test Posture
The suite now covers the highest-risk behavior: pure math rules and real browser workflows. Future operation additions should start with unit tests in `tests/unit/game-core.test.js`, then add one focused browser path if the operation changes input behavior or UI.
