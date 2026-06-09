# Architecture

## Overview
Rain Math is a static browser game. Production still has no bundler and no runtime dependencies: `index.html` loads `styles.css`, then `src/game-core.js`, then `script.js` as ordinary browser scripts. This keeps the app usable when `index.html` is opened directly from disk.

Dev-only tooling exists for tests: Node's built-in test runner covers core logic, and Playwright covers real browser flows.

## Runtime Files
- `index.html`: Game markup, operation chits, controls, canvas, input bar, touch keypad, feedback form, and overlays.
- `styles.css`: Dark theme, desktop layout, responsive behavior, stats popup styling, and touch-device layout.
- `script.js`: Browser state, animation loop, canvas drawing, audio, DOM updates, event listeners, touch keypad wiring, and gated `?test=1` hooks.
- `src/game-core.js`: DOM-free game rules exposed as `globalThis.RainMathCore`: operation defaults, difficulty ranges, problem generation, mastery weighting, numeric normalization, SI helpers, and factorization helpers.

## Test Files
- `tests/unit/game-core.test.js`: Deterministic tests for math, problem generation, weighting, and factorization.
- `tests/e2e/rain-math.spec.js`: Playwright desktop/mobile browser coverage.
- `tests/support/static-server.mjs`: Tiny local static server used by Playwright.
- `playwright.config.mjs`: Browser projects, local server, and reporter settings.
- `.github/workflows/tests.yml`: CI test workflow.

## Runtime Flow
1. The browser loads `index.html`, then `src/game-core.js`, then `script.js`.
2. `src/game-core.js` publishes pure rules to `globalThis.RainMathCore`; `script.js` consumes that object and creates mutable browser state.
3. `init()` sizes the canvas, syncs controls, sets up touch UI when needed, optionally installs test hooks for `?test=1`, focuses the hidden answer input, and starts `requestAnimationFrame(tick)`.
4. `tick()` spawns drops according to Rate, updates motion according to Speed/Pace, handles misses, updates effects, and redraws the canvas.
5. Input handlers clear immediate-answer drops as soon as they match. SI and full factorization answers wait for Enter. Targeted factor drops accept one divisor at a time.

## Core Data Model
- `opConfig`: per-operation `{ enabled, difficulty, symbol, label }`, initialized from `createDefaultOpConfig()`.
- `drops[]`: active drops with common fields `{ id, x, y, baseSpeed, text, answer, answerText, opKey, statsKey }`; factor drops add `factorOriginal`, `factorRemaining`, `factorCollected`, and `factorComplete`.
- `problemStats`: per-operation in-memory accuracy maps `{ asked, correct }`, initialized from `createProblemStats()`.
- `gameSpeed`: 0-100 fall-speed multiplier.
- `spawnRate`: 0-10 spawn interval control; 0 stops spawning.
- `pace`: 1-10 fall-time control.
- `score`: correct-answer counter.
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
