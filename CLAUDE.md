# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project

Rain Math is a browser-based math game where falling raindrops are cleared by typing correct answers. Production is a static site: vanilla HTML, CSS, and browser JavaScript with no bundler and no runtime package dependencies.

## Running

- Open `index.html` in a browser for a direct static-file run.
- To match the Playwright HTTP path, serve the repo with `node tests/support/static-server.mjs 4173`, then open `http://127.0.0.1:4173/`.

## Testing

First-time setup:
1. `npm install`
2. `npx playwright install chromium`

Common commands:
- `npm run test:unit`
- `npm run test:e2e`
- `npm test`
- `npm run test:ci`
- `npm run test:e2e:ui`

See `docs/Ai/TESTING.md` for details.

## Deployment

GitHub Pages deploys via `.github/workflows/pages.yml` on pushes to `main`. Test CI runs separately via `.github/workflows/tests.yml`.

## Documentation

Read these before making changes:
1. `docs/Ai/PURPOSE.md` — goals and current user intent
2. `docs/Ai/ARCHITECTURE.md` — structure, runtime flow, and data model
3. `docs/Ai/CHANGELOG.md` — recent changes and reasons
4. `docs/Ai/TESTING.md` — test setup and commands
5. `docs/Ai/CODEBASE_REVIEW.md` — current review findings and residual risks

## Architecture

- `index.html` — markup for header, controls, canvas, input bar, touch keypad, login/results/feedback links, feedback form, and overlays.
- `styles.css` — desktop/mobile layout, dark theme, touch UI, and login/stats/results popup styling.
- `src/game-core.js` — DOM-free game rules exposed as `globalThis.RainMathCore`: operation defaults, problem generation, difficulty ranges, input normalization, SI helpers, factorization, and weighting.
- `src/player-progress.js` — local player profiles exposed as `globalThis.RainMathProgress`: multi-profile localStorage persistence, legacy single-profile migration, per-problem outcomes, saved current levels, temporary boss-attempt records, level-universe sizing, readiness scoring, practice suggestions, and boss-readiness recommendations.
- `script.js` — browser state, animation loop, canvas drawing, audio, DOM updates, login/results/stats popups, event listeners, touch keypad wiring, and `?test=1` hooks for Playwright.
- `tests/unit/game-core.test.js` — unit coverage for core rules.
- `tests/unit/player-progress.test.js` — unit coverage for local profile persistence and readiness scoring.
- `tests/e2e/rain-math.spec.js` — Playwright desktop/mobile browser coverage.

## Working Rules

- Prefer simple, readable JavaScript over additional tooling.
- Keep production dependency-free unless the user explicitly changes that direction.
- Put pure game rules in `src/game-core.js`; keep local profile/readiness logic in `src/player-progress.js`; keep DOM/canvas/audio behavior in `script.js`.
- Do not rename the `docs/Ai` folder.
- Keep documentation in sync with behavioral changes.
- Add a changelog entry in `docs/Ai/CHANGELOG.md` for any player-facing or architectural change.
- If adding new operations, update `src/game-core.js`, operation display labels, `index.html` chits, docs, and tests.
- GitHub SSH user: `david8381`; repo: `RainDrops`; default branch: `main`.
