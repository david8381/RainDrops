# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project

Rain Math is a browser-based math game where falling raindrops are cleared by typing correct answers. Production is a static site: vanilla HTML, CSS, and browser JavaScript with no bundler and no runtime package dependencies.

## Running

- `npm start` serves the site at `http://127.0.0.1:4173/` (the same static host Playwright uses). Open that URL to play locally — this matches production (GitHub Pages serves over HTTP).
- `npm run dev` serves with live-reload: edit a file and the open browser tab auto-refreshes. (Live-reload is injected only in this mode — `npm start` and the test server are unaffected.)
- The app is built from native ES modules (`script.js` imports `src/game-core.js`, `src/player-progress.js`, `src/text/english.js`), so it must be served over HTTP. Opening `index.html` directly via `file://` does **not** work (ES modules don't load on `file://`) — always use `npm start` / `npm run dev`.

## Testing

First-time setup:
1. `npm install`
2. `npx playwright install chromium firefox webkit`

Common commands:
- `npm run test:unit`
- `npm run test:e2e`
- `npm test`
- `npm run test:ci`
- `npm run test:e2e:ui`

See `docs/Ai/TESTING.md` for details.

## Deployment

GitHub Pages deploys via `.github/workflows/pages.yml` on pushes to `main`. Test CI lives in `.github/workflows/tests.yml` but is manual-only (`workflow_dispatch`) to avoid push-email noise; run the local test commands before pushing.

Versioning is stamped automatically: `core.hooksPath` is `.githooks`, and `.githooks/pre-commit` runs `scripts/stamp-version.sh` and stages `index.html` + `package.json`, so every commit bumps the patch and refreshes the `?v=` cache-busters. To set an explicit version, run `npm run stamp 0.4.0` (or `npm run stamp` to bump the patch manually). Do not hand-edit the version strings — let the hook own them.

## Documentation

Read these before making changes:
1. `docs/Ai/PURPOSE.md` — goals and current user intent
2. `docs/Ai/ARCHITECTURE.md` — structure, runtime flow, and data model
3. `docs/Ai/CHANGELOG.md` — recent changes and reasons
4. `docs/Ai/TESTING.md` — test setup and commands
5. `docs/Ai/CODEBASE_REVIEW.md` — current review findings and residual risks

## Architecture

- `index.html` — markup for header, operation chits, practice controls (Speed/Drops/Adaptive/Text), canvas, input bar, touch keypad, login/log/feedback links, feedback form, and overlays.
- `styles.css` — desktop/mobile layout, dark theme, adaptive-control states, touch UI, boss/breather HUDs, and login/stats/session-report popup styling.
- `src/game-core.js` — DOM-free game rules imported as an ES module: operation defaults, problem generation, difficulty ranges, input normalization, SI helpers, factorization, weighting, run-control derivation, and adaptive Speed/Drops pressure adjustment.
- `src/player-progress.js` — local player profiles imported as an ES module: multi-profile localStorage persistence, legacy single-profile migration, per-problem outcomes, saved Speed/Drops/Adaptive/Text settings, per-operation adaptive pressure estimates, pressure-tier compatibility stats, saved current levels, boss-completion records, Blitz attempts/bests, level-universe sizing, readiness scoring, practice suggestions, and boss-readiness recommendations. The profile's `activeTrack` selects a curriculum track.
- `src/curriculum.js` — data-only curriculum "tracks" (`TRACKS` + `getActiveTrack`): per-op level descriptors read by game-core/player-progress via an optional trailing `track = TRACKS.standard` param. `standard` reproduces today's levels; `timesTables` is a multiply-only path (level N = the N times table).
- `script.js` — browser state, animation loop, canvas drawing, Speed/Drops/Adaptive practice controls, boss/Blitz/Breather-mode state, audio, DOM updates, login/stats/session-report popups, event listeners, touch keypad wiring, and `?test=1` hooks for Playwright. In test mode it re-exposes core/progress APIs on `window` for browser instrumentation.
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
- For any non-trivial feature, create/update a tracked design doc in `docs/Ai/FEATURE_REQUESTS/` (see its README); keep `docs/Ai/DIALOGUE.md` (gitignored, Codex↔Claude) to terse turn-coordination only.
- If adding new operations, update `src/game-core.js`, operation display labels, `index.html` chits, docs, and tests.
- GitHub SSH user: `david8381`; repo: `RainDrops`; default branch: `main`.
