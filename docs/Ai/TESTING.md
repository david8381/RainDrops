# Testing

## First-Time Setup
1. Install Node 24 or newer.
2. Run `npm install`.
3. Run `npx playwright install chromium`.

The app has no production build step. These commands install only developer test tooling.

## Daily Commands
- `npm run test:unit`: Run deterministic Node unit tests for `src/game-core.js` and `src/player-progress.js`.
- `npm run test:e2e`: Run Playwright browser tests against a local static server.
- `npm test`: Run unit tests, then browser tests.
- `npm run test:ci`: Same test sequence intended for CI.
- `npm run test:e2e:ui`: Open Playwright's interactive UI for browser debugging.

## What The Suites Cover
- Unit tests cover numeric normalization, decimal shifting, difficulty ranges, problem generation, SI conversions, geometry formulas, prime checks, factorization parsing/progression, problem stats, mastery, weighted selection, local profile persistence, single-profile migration, local profile create/switch behavior, 3-attempt/90%-current-accuracy boss readiness scoring with a 100% unlock gate and 80% finish-focus practice helper, Speed/Drops settings sync, pressure-tier compatibility metadata, boss clears, mastery-advance records, level-specific Blitz attempts/bests, generalized Blitz/Wave/Worksheet challenge bests, and practice suggestions.
- Browser tests cover loading, canvas paint, operation toggles, difficulty/readiness controls, Speed/Drops controls, Grid hints and hover tooltips for stats popups, falling-drop accuracy/evidence shading, Spacebar Breather mode, mastery-before-level-advance gating, optional Next Level advancement, boss HUD/stun behavior, locked boss Speed/Drops/operation/level-control behavior, persisted unlocked-level reloads, Blitz shield scoring, full Wave 1/Wave 2/Worksheet boss sequencing, Wave/Worksheet replay buttons, immediate numeric clearing, Enter-required SI and factorization answers, Tab-targeted factorization, pause/restart, local login/profile switching, clear-stats, feedback, stats/log/report overlays, removed Results-tab checks, and mobile keypad/layout controls.

## CI
`.github/workflows/tests.yml` runs on pushes to `main`, pull requests, and manual dispatch:
1. `npm ci`
2. `npx playwright install --with-deps chromium`
3. `npm run test:ci`

The existing GitHub Pages deploy workflow remains separate.

## Local Troubleshooting
- If Playwright cannot find a browser, run `npx playwright install chromium`.
- If browser tests cannot bind `127.0.0.1:4173`, allow the test command to start a local server or change the port in `playwright.config.mjs`.
- Playwright intentionally blocks external font and analytics requests during tests.
- The test-only browser API is installed only when the URL includes `?test=1`.
