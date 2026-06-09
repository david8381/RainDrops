# Testing

## First-Time Setup
1. Install Node 24 or newer.
2. Run `npm install`.
3. Run `npx playwright install chromium`.

The app has no production build step. These commands install only developer test tooling.

## Daily Commands
- `npm run test:unit`: Run deterministic Node unit tests for `src/game-core.js`.
- `npm run test:e2e`: Run Playwright browser tests against a local static server.
- `npm test`: Run unit tests, then browser tests.
- `npm run test:ci`: Same test sequence intended for CI.
- `npm run test:e2e:ui`: Open Playwright's interactive UI for browser debugging.

## What The Suites Cover
- Unit tests cover numeric normalization, decimal shifting, difficulty ranges, problem generation, SI conversions, geometry formulas, prime checks, factorization parsing/progression, problem stats, mastery, and weighted selection.
- Browser tests cover loading, canvas paint, operation toggles, difficulty controls, speed/rate/pace displays, immediate numeric clearing, Enter-required SI and factorization answers, Tab-targeted factorization, pause/restart, feedback, stats overlays, and mobile keypad controls.

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
