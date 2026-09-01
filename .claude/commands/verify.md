---
description: Run the full local pre-push gate (typecheck + unit + e2e) and triage failures
allowed-tools: Bash(npm run *), Bash(npx playwright *), Bash(lsof *), Bash(kill *), Read, Grep
---

Run the local gate. GitHub test CI is manual-only, so this is the only gate before a push.

1. `npm run typecheck` — **must be 0 errors**. Covers `src/game-core.js`, `src/player-progress.js`, `src/types.js` (script.js is excluded on purpose).
2. `npm run test:unit`
3. `npm run test:e2e` — 6 projects: chromium, firefox, webkit, mobile-chrome, mobile-safari, ipad.

A healthy full e2e run takes roughly 1.5 minutes.

## Triage before blaming the code

Two failures look like regressions but are not. Check these first — do not start
debugging the diff until both are ruled out.

**Many tests time out across multiple engines (~9 min run).** A stale static
server is wedged on port 4173; `reuseExistingServer: !CI` means Playwright
adopted it instead of starting a fresh one.

```
lsof -ti :4173 | xargs kill
```

Then re-run e2e.

**Only firefox fails, only "rapid impossible submissions briefly overload the
cannon."** Known timing flake under full parallel load. Confirm in isolation:

```
npx playwright test --project=firefox -g "overload the cannon"
```

If it passes alone, it is the flake — say so and move on.

**Rule of thumb:** a real regression shows up in the *unit* tests (the pure logic
is unit-tested) or as the same test failing consistently across engines.

## Report

State plainly what passed, what failed, and the actual output for any failure.
Do not report success if anything failed or was skipped.
