# Testing

## First-Time Setup
1. Install Node 24 or newer.
2. Run `npm install`.
3. Run `npx playwright install chromium firefox webkit` (the e2e matrix runs on all three engines plus mobile/iPad device profiles).

The app has no production build step. These commands install only developer test tooling.

## Running locally
- `npm start`: serve the site at `http://127.0.0.1:4173/` — the same static host Playwright uses, matching production.
- `npm run dev`: same server with live-reload (edit a file → the open tab auto-refreshes). Live-reload is dev-only and injected solely in this mode, so `npm start` and the Playwright test server stay byte-identical (`tests/support/static-server.mjs`, gated behind `LIVERELOAD=1`).

## Daily Commands
- `npm run test:unit`: Run deterministic Node unit tests for `src/game-core.js` and `src/player-progress.js`.
- `npm run test:e2e`: Run Playwright browser tests against a local static server.
- `npm test`: Run unit tests, then browser tests.
- `npm run test:ci`: Same test sequence intended for CI.
- `npm run test:e2e:ui`: Open Playwright's interactive UI for browser debugging.

## Coverage
Coverage is an occasional measurement (not part of `test`/`test:ci`), meant to
show how much of each file the suites exercise — most useful before refactoring
the large `script.js`.

- `npm run coverage:unit`: c8 coverage of the `src/` modules from the Node unit
  tests. Text summary in the terminal; HTML in `coverage/unit/`.
- `npm run coverage:e2e`: V8 coverage of the browser bundle (`script.js` + the
  `src/` modules as loaded in the page), collected during a Chromium-only
  Playwright run (config: `playwright.coverage.mjs`) and rendered with
  monocart. Console summary plus an HTML heatmap and `lcov.info` in
  `coverage/e2e/` (open `coverage/e2e/index.html` for the line-by-line view).
- `npm run coverage`: both of the above.

How the e2e collection works: `tests/support/fixtures.js` extends the base
`test` with an auto fixture that, only when `COVERAGE=1` and the engine is
Chromium, wraps each test in `page.coverage.startJSCoverage()` /
`stopJSCoverage()` and hands the raw V8 data to `monocart-reporter`. The
coverage config runs `chromium` + `mobile-chrome` (both Chromium engines, so
both expose CDP coverage; mobile-chrome adds the touch specs) and excludes the
single `file://` test so each file merges into one entry. The normal six-engine
run imports `test` from the same fixtures file but the fixture is a no-op
without `COVERAGE=1`.

Baseline (2026-06-27): unit — game-core ~89% lines, player-progress ~94% lines;
e2e — `script.js` ~83% lines / ~65% branch. The thinnest browser areas are
results/report/SI-reference popup builders, placement (Test Me) result
rendering, factor-targeting branches, and overlay Escape-key handling.

## What The Suites Cover
- Unit tests cover numeric normalization, decimal shifting, difficulty ranges, problem generation, SI conversions, geometry formulas, prime checks, factorization parsing/progression, problem stats, mastery, weighted selection, local profile persistence, single-profile migration, local profile create/switch behavior, 3-attempt/90%-current-accuracy boss readiness scoring with a 100% unlock gate and 80% finish-focus practice helper, Speed/Drops settings sync, pressure-tier compatibility metadata, boss clears, mastery-advance records, level-specific Blitz attempts/bests, generalized Blitz/Wave/Worksheet challenge bests, and practice suggestions.
- Browser tests cover loading, canvas paint, operation toggles, difficulty/readiness controls, Speed/Drops controls, Grid hints and hover tooltips for stats popups, falling-drop accuracy/evidence shading, Spacebar Breather mode, mastery-before-level-advance gating, optional Next Level advancement, boss HUD/stun behavior, locked boss Speed/Drops/operation/level-control behavior, persisted unlocked-level reloads, Blitz shield scoring, full Wave 1/Wave 2/Worksheet boss sequencing, Wave/Worksheet replay buttons, immediate numeric clearing, Enter-required SI and factorization answers, Tab-targeted factorization, pause/restart, local login/profile switching, clear-stats, feedback, stats/log/report overlays, removed Results-tab checks, and mobile keypad/layout controls.

## Browser/device matrix
`playwright.config.mjs` runs every spec across six projects: desktop `chromium`,
`firefox`, and `webkit` (Safari engine), plus touch profiles `mobile-chrome`
(Pixel 5), `mobile-safari` (iPhone 13), and `ipad` (iPad gen 7). Desktop-only
input-bar specs skip on touch profiles and vice versa via `test.skip(isMobile)`.
The shared-report link path (compress/decompress + checksum + read-only view) is
also covered by one top-level spec that runs on **all** projects, since a parent
often opens a shared link on a phone or iPad.

## CI
`.github/workflows/tests.yml` runs on pushes to `main`, pull requests, and manual dispatch:
1. `npm ci`
2. `npx playwright install --with-deps chromium firefox webkit`
3. `npm run test:ci` (runs the full six-project matrix)

The existing GitHub Pages deploy workflow remains separate.

## Local Troubleshooting
- If Playwright cannot find a browser, run `npx playwright install chromium`.
- If browser tests cannot bind `127.0.0.1:4173`, allow the test command to start a local server or change the port in `playwright.config.mjs`.
- Playwright intentionally blocks external font and analytics requests during tests.
- The test-only browser API is installed only when the URL includes `?test=1`.
