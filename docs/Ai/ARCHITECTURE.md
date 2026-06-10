# Architecture

## Overview
Rain Math is a static browser game. Production still has no bundler and no runtime dependencies: `index.html` loads `styles.css`, then `src/game-core.js`, `src/player-progress.js`, and `script.js` as ordinary browser scripts. This keeps the app usable when `index.html` is opened directly from disk.

Dev-only tooling exists for tests: Node's built-in test runner covers core logic, and Playwright covers real browser flows.

## Runtime Files
- `index.html`: Game markup, operation chits, controls, canvas, input bar, touch keypad, login/results/feedback links, feedback form, and overlays.
- `styles.css`: Dark theme, desktop layout, responsive behavior, stats popup styling, and touch-device layout.
- `script.js`: Browser state, animation loop, canvas drawing, audio, DOM updates, login/results/stats popups, event listeners, touch keypad wiring, and gated `?test=1` hooks.
- `src/game-core.js`: DOM-free game rules exposed as `globalThis.RainMathCore`: operation defaults, difficulty ranges, problem generation, mastery weighting, numeric normalization, SI helpers, and factorization helpers.
- `src/player-progress.js`: Local profile/readiness logic exposed as `globalThis.RainMathProgress`: profile schema, multi-profile localStorage persistence, single-profile migration, per-problem outcomes, saved current levels, temporary boss-attempt records, level-universe sizing, readiness scoring, practice suggestions, and boss recommendation flags.

## Test Files
- `tests/unit/game-core.test.js`: Deterministic tests for math, problem generation, weighting, and factorization.
- `tests/unit/player-progress.test.js`: Deterministic tests for local profile persistence and readiness scoring.
- `tests/e2e/rain-math.spec.js`: Playwright desktop/mobile browser coverage.
- `tests/support/static-server.mjs`: Tiny local static server used by Playwright.
- `playwright.config.mjs`: Browser projects, local server, and reporter settings.
- `.github/workflows/tests.yml`: CI test workflow.

## Runtime Flow
1. The browser loads `index.html`, then the core/progress helper scripts, then `script.js`.
2. `src/game-core.js` publishes pure rules to `globalThis.RainMathCore`; `src/player-progress.js` publishes local profile helpers to `globalThis.RainMathProgress`.
3. `script.js` creates mutable browser state, reads the active local profile from localStorage, and mirrors durable progress into legacy `problemStats` for weighted generation.
4. `init()` sizes the canvas, syncs controls/settings into the profile, sets up touch UI when needed, optionally installs test hooks for `?test=1`, focuses the hidden answer input, and starts `requestAnimationFrame(tick)`.
5. `tick()` spawns drops according to Rate, updates motion according to Speed/Pace, handles misses, updates effects, and redraws the canvas.
6. Input handlers clear immediate-answer drops as soon as they match. SI and full factorization answers wait for Enter. Targeted factor drops accept one divisor at a time.
7. Correct, wrong, missed, and helped outcomes update both in-memory stats and the local profile.
8. The Login popup creates or switches local profiles. Switching saves the outgoing profile, loads the selected profile's settings/progress, and clears only transient run state such as active drops and the Cleared counter.

## Core Data Model
- `opConfig`: per-operation `{ enabled, difficulty, symbol, label }`, initialized from `createDefaultOpConfig()` at level 1, then overlaid with saved profile levels at startup.
- `drops[]`: active drops with common fields `{ id, x, y, baseSpeed, text, answer, answerText, opKey, statsKey }`; factor drops add `factorOriginal`, `factorRemaining`, `factorCollected`, and `factorComplete`.
- `problemStats`: per-operation in-memory accuracy maps `{ asked, correct }`, initialized from `createProblemStats()`.
- `progressProfile`: durable active local profile with per-operation current level, readiness, per-problem outcome history, and temporary Ready/boss-attempt records. The active profile is stored inside the multi-profile store `rainMath.profiles.v1`; the legacy active-profile key `rainMath.profile.v1` is still written for compatibility. Untouched legacy `Local Player` data migrates into a profile named `david`. Readiness treats unseen problems in the current level as unmastered so small perfect samples do not overstate boss readiness. Practice suggestions mix weak seen problems with unseen level problems where the operation has an enumerable universe.
- `gameSpeed`: 0-100 fall-speed multiplier.
- `spawnRate`: 0-10 spawn interval control; 0 stops spawning.
- `pace`: 1-10 fall-time control.
- `score`: session-only count of correct drops cleared, displayed as Cleared.
- `splashes`, `laser`, `groundFlash`: visual effects state.

## Operation Types
- Basic arithmetic: `add`, `sub`, `mul`, `div`.
- Decimal shifting: `f10`.
- SI metric conversions: `si`.
- Geometry: `rect` for rectangle perimeter/area and `circ` for circle circumference/area coefficient answers.
- Prime factorization: `factor`, with full-answer and Tab-targeted stepwise modes.

## Extensibility Notes
- Add new operation defaults in `src/game-core.js`, a generator/range branch there, display labels in `script.js`, and an operation chit in `index.html`.
- Keep pure rules in `src/game-core.js`; keep DOM, drawing, audio, and browser event behavior in `script.js`.
- Update `docs/Ai/CHANGELOG.md` for player-facing or architectural changes.
- Use `?test=1` hooks only in tests; do not make gameplay depend on them.
- Keep `src/player-progress.js` backend-shaped so future backend sync can replace localStorage without changing gameplay event semantics.
- Boss-readiness recommendations should remain representative-assessment estimates: broad coverage plus repeated mastery, not just recent streaks.
- Until real boss mode exists, clicking Ready records a temporary boss attempt for the current level and unlocks one level increase.
