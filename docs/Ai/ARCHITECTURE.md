# Architecture

## Overview
Rain Math is a static browser game. Production still has no bundler and no runtime dependencies: `index.html` loads `styles.css`, then `src/game-core.js`, `src/player-progress.js`, and `script.js` as ordinary browser scripts. This keeps the app usable when `index.html` is opened directly from disk.

Dev-only tooling exists for tests: Node's built-in test runner covers core logic, and Playwright covers real browser flows.

## Runtime Files
- `index.html`: Game markup, operation chits, controls, canvas, input bar, touch keypad, login/results/feedback links, feedback form, and overlays.
- `styles.css`: Dark theme, desktop layout, responsive behavior, stats popup styling, and touch-device layout.
- `script.js`: Browser state, animation loop, canvas drawing, boss-mode state machine, audio, DOM updates, login/results/stats popups, event listeners, touch keypad wiring, and gated `?test=1` hooks.
- `src/game-core.js`: DOM-free game rules exposed as `globalThis.RainMathCore`: operation defaults, difficulty ranges, problem generation, mastery weighting, numeric normalization, SI helpers, and factorization helpers.
- `src/player-progress.js`: Local profile/readiness logic exposed as `globalThis.RainMathProgress`: profile schema, multi-profile localStorage persistence, single-profile migration, per-problem outcomes, saved Speed/Drops settings, derived pressure-tier practice stats, saved current levels, boss-completion records, Blitz/Wave/Boss challenge attempts and bests, level-universe sizing, readiness scoring, practice suggestions, and boss recommendation flags.

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
5. `tick()` spawns drops and updates motion according to the Speed and Drops controls. Speed controls fall velocity and spawn interval; Drops controls the active-drop cap. Weighted problem generation favors unmastered, low-accuracy, and under-attempted current-level problems. Space-triggered Breather mode pauses normal spawning and drop motion until all currently visible unrevealed drops are cleared.
6. Input handlers clear immediate-answer drops as soon as they match. SI and full factorization answers wait for Enter. Targeted factor drops accept one divisor at a time.
7. Correct, wrong, missed, and helped outcomes update both in-memory stats and the local profile during ordinary practice. Boss, Blitz, and Wave problem outcomes are excluded from ordinary mastery stats; their attempts are recorded separately as challenge records.
8. The Login popup creates or switches local profiles. Switching saves the outgoing profile, loads the selected profile's settings/progress, and clears only transient run state such as active drops and the Cleared counter.
9. Boss mode unlocks when Mastered reaches 80%. Mastered is the percentage of current-level problems with at least 3 attempts and at least 90% current accuracy, where current accuracy blends recent weighted performance with lifetime accuracy. Once started, boss mode pauses normal spawning, locks the current Speed/Drops snapshot, runs Wave 1 shield endurance as a speed ramp with fixed load, then Wave 2 as a clear-gated load ladder (a round of N problems at fixed speed that only steps up after the whole round clears), then the final mothership. The mothership is a fact sheet built from the entire current-level universe (sampled, capped at 50) split across the four parts; nodes reveal in capped, answer-unique batches and empty trailing parts auto-collapse. Active challenge bombs, ship problem nodes, and boss missiles use the same input path as drops. Destroying the final core records the boss attempt and advances that operation one level.
10. Replay challenges unlock after a level boss clear. Blitz starts a shield-endurance score run for the cleared level; Wave starts a simultaneous-load score run for the cleared level; Boss replay starts directly at the mothership and records best time without advancing content level. Higher-level challenge attempts can satisfy lower-level best lookups when they are better.

## Core Data Model
- `opConfig`: per-operation `{ enabled, difficulty, symbol, label }`, initialized from `createDefaultOpConfig()` at level 1, then overlaid with saved profile levels at startup.
- `drops[]`: active drops with common fields `{ id, x, y, baseSpeed, text, answer, answerText, opKey, statsKey }`; factor drops add `factorOriginal`, `factorRemaining`, `factorCollected`, and `factorComplete`.
- `problemStats`: per-operation in-memory accuracy maps `{ asked, correct }`, initialized from `createProblemStats()`. The stats popup, stats hover tooltips, and falling-drop shading read from the same accuracy/evidence palette. Untested problems are black, hue runs from red through yellow to green by current accuracy, and opacity/brightness increases with attempts, capping at 5 attempts.
- `progressProfile`: durable active local profile with per-operation current level, readiness, per-problem outcome history, derived pressure-tier outcome buckets, boss-completion records, legacy Blitz attempts, and generalized challenge attempts for Blitz/Wave/Boss. The active profile is stored inside the multi-profile store `rainMath.profiles.v1`; the legacy active-profile key `rainMath.profile.v1` is still written for compatibility. Untouched legacy `Local Player` data migrates into a profile named `david`. Boss readiness treats unseen or under-practiced current-level problems as unmastered: each problem needs at least 3 attempts and at least 90% current accuracy, and boss unlocks at 80% of that universe. Practice suggestions mix weak seen problems with unseen level problems where the operation has an enumerable universe. Pressure tiers are still derived from speed for compatibility/reporting metadata, but visible practice control is Speed plus Drops rather than a preset tier selector. Challenge bests are selected by highest score for Blitz/Wave and shortest duration for Boss; higher-level attempts can override lower-level displayed bests when they are better.
- `bossMode`: transient active boss, Blitz, Wave, or Boss replay state with the selected operation, target level, mode, locked Speed/Drops snapshot, phase, challenge type, shield/load counters, the Wave 2 round-spawn counter, boss parts (each holding a universe slice of revealable problem nodes), falling debris, bomb timer, stun/timer state, transition burst state, and victory timer. It is not persisted; ordinary mastery is not updated during boss/challenge play, while completed challenge attempts update the local profile.
- `gameSpeed`: current Speed control value from 0-100.
- `dropLimit`: current Drops control value from 0-10. Some profile/test event fields still use the historical names `rate` or `spawnRate`; those names now mean drop-load/concurrency rather than a timed spawn-rate slider.
- `isBreatherMode`: transient practice-only Spacebar state. While true, normal spawning and drop motion pause; answer processing remains live and the mode exits automatically when no visible unrevealed drops remain.
- `score`: session-only count of correct drops cleared, displayed as Cleared.
- `splashes`, `laser`, `groundFlash`: visual effects state.

## Operation Types
- Basic arithmetic: `add`, `sub`, `mul`, `div`.
- Decimal shifting: `f10`. Difficulty is structural — a problem "type" is `(significant digits, power of 10, ×/÷)` with `difficulty = digits + power − 1`; the concrete number is random, so mastery accrues per type. A level holds every type with `digits + power − 1 ≤ level` (cumulative).
- SI metric conversions: `si`.
- Geometry: `shapes`, one level-gated operation (cumulative) — L1 square, L2 rectangle, L3 triangle, L4 circle, L5 cube, L6 rectangular prism, L7 cylinder, L8 sphere. 2D shapes use perimeter/area, 3D shapes use surface area/volume, and round shapes (circle, cylinder, sphere) answer as the π coefficient. Dimension combinations that would give a non-clean answer (e.g. most sphere volumes) are filtered out so every answer is an integer or a half. Levels 9–10 reuse the full L8 set.
- Prime factorization: `factor`, with full-answer and Tab-targeted stepwise modes (auto-targeted when factoring is the only operation in play). Difficulty is structural: `difficulty(n) = primeIndex(largest prime) + max exponent + (# primes with exponent > 1) + Ω(n) − 4`, and a level holds every composite with difficulty ≤ level (cumulative; L1 = {6}).

## Extensibility Notes
- Add new operation defaults in `src/game-core.js`, a generator/range branch there, display labels in `script.js`, and an operation chit in `index.html`.
- Keep pure rules in `src/game-core.js`; keep DOM, drawing, audio, and browser event behavior in `script.js`.
- Update `docs/Ai/CHANGELOG.md` for player-facing or architectural changes.
- Use `?test=1` hooks only in tests; do not make gameplay depend on them.
- Keep `src/player-progress.js` backend-shaped so future backend sync can replace localStorage without changing gameplay event semantics.
- Boss-readiness recommendations should remain representative-assessment estimates: count current-level problems mastered by the 3-attempt/90%-current-accuracy rule, using recent weighting as a correction for old history rather than a short streak bonus.
- Boss mode should remain an opt-in mastery test. Normal practice should stay focused on retrieval fluency rather than combat survival.
- Practice Speed and Drops should remain player-controlled and separate from content-level advancement. Do not require higher practice pressure to advance content level unless the product direction changes deliberately.
- Derived pressure-tier clears remain compatibility metadata for existing profile data. The player-facing post-boss challenges are Blitz score, Wave score, and Boss time for a specific cleared level.
