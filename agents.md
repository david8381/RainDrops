# AI Agent Instructions

How any AI assistant (Claude, Codex, etc.) should pick up this repo. (Claude also
has `CLAUDE.md`; this file is the cross-agent source of truth — keep them aligned.)

## Read first (docs/Ai)
- `PURPOSE.md` — goals and user intent.
- `ARCHITECTURE.md` — structure, the runtime data model, and the **"Design intent & module boundaries"** section (which layer new code belongs in, and why the engine is kept coupled on purpose).
- `CHANGELOG.md` — recent changes, newest at top; avoid rework.
- `TESTING.md` — how to run and verify.

## What this app is
Vanilla browser game (falling math drops). **Native ES modules, no bundler, no runtime deps** — `index.html` loads one `<script type="module">` (`script.js`) that imports the `src/` modules; source == runtime. It is **served over HTTP** (ES modules don't load from `file://`).

## Commands
- `npm start` — serve at http://127.0.0.1:4173 to play locally (matches production).
- `npm run dev` — same with live-reload (edit → tab refreshes).
- `npm run test:unit` · `npm run test:e2e` · `npm test` — Node unit tests + Playwright (six browser/device projects).
- `npm run typecheck` — `tsc --checkJs` over the typed core (`src/game-core.js`, `src/player-progress.js`, `src/types.js`); **must stay at 0 errors** (part of `test:ci`, enforced in CI).
- `npm run coverage` — c8 (unit) + monocart (e2e) coverage.

## Where code goes (see ARCHITECTURE for detail)
- Pure rules / game-logic / formatters → `src/game-core.js` (unit-tested + type-checked).
- Profile / persistence / readiness → `src/player-progress.js` (unit-tested + type-checked).
- Self-contained runtime subsystems → `src/engine/` (shared `state.js`, predicates, splashes, laser-ship).
- Modal "views" → `src/popups/` (build DOM from injected data + callbacks).
- The coupled real-time engine (boss / drop management / input / game loop / UI orchestration) lives in `script.js` **by design** — don't split it to chase smaller files; the coupling is essential.

## Working rules
- **Test-first / keep green:** run unit + e2e (+ `npm run typecheck`) and keep them passing for any change.
- Add a `CHANGELOG.md` entry for any player-facing or architectural change; keep docs in sync.
- **Do not hand-edit version strings.** A pre-commit hook (`scripts/stamp-version.sh`, `core.hooksPath=.githooks`) stamps the version + `?v=` cache-busters on every commit. To set an explicit version: `npm run stamp X.Y.Z`.
- Document the data shapes you touch via the JSDoc `@typedef`s in `src/types.js`.
- Prefer simple, readable JavaScript over new tooling; keep production dependency-free.

## Known test flakiness (not regressions)
- A **stale `:4173` static server** from a prior run is reused by Playwright (`reuseExistingServer`) and can wedge — symptom: a sudden run where ~15-20 tests time out / "browser has been closed" across multiple engines, ~9 min instead of ~1.5 min. Fix: `lsof -ti :4173 | xargs kill`, then re-run.
- The Firefox e2e **"rapid impossible submissions briefly overload the cannon"** is timing-sensitive and occasionally fails under full parallel load; it passes on retry / in isolation. A lone Firefox failure of just that test is the flake, not your change.
