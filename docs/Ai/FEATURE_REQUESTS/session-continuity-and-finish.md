# Feature: Session continuity + "Finish" (one report per sitting)

Status: agreed — ready for implementation
Owner: Codex (planned by Claude; Claude to review)
Last Updated: 2026-06-29
Related Commits: (pending)

## User Request
"I want everything a kid does in one sitting to show up in the **same** report — if
they did 10 different problem types, the parent shouldn't get 10 reports to click. The
beginning of a session should be when they come to the website and the end when they
leave. And at the end, give them a clear way to send that one report to a parent."

Motivation: support the "I only have a few minutes" mindset — a short, focused sitting
that ends with a single, shareable proof of what they accomplished.

## Goal
A **sitting = one session = one report**, robust across page reloads and brief
wandering, covering every operation they practiced — plus a prominent "I'm done" action
that surfaces that one combined report with Share-with-a-parent front and center.

## Design
Two complementary pieces. Piece 1 is the substance (fixes fragmentation); piece 2 is the
closure/share polish.

### Piece 1 — Session continuity (resume a recent sitting instead of always new)
Today **every page load mints a brand-new session** (`startVisitSession` →
`createSessionId()` is always a fresh random id), so a reload or a leave-and-return
splits one sitting into multiple report rows. Within a single visit, multiple operations
already accumulate into one report correctly — the only fragmenter is the per-load new
session.

Fix: on load, **resume the profile's most recent session if its last activity was within
a grace window** (decided: **30 minutes**); otherwise start a fresh one. The resume path
already exists — `recordSessionStart` calls `findSession`/`touchSession` to continue an
existing session by id; it just never fires today because the id is random each load. So
the change is: pick the existing recent session's id on load instead of always minting.

Rules:
- Resume the newest session in the **active profile** only if `now - lastSeenAt ≤ 30 min`.
- Otherwise (longer gap, or no sessions) start a new session as today.
- **Switching player profiles always starts a fresh session** (different kid — never
  resume across profiles).
- "Leave" is already captured: `endedAt`/`lastSeenAt` are re-stamped on every heartbeat,
  including the `beforeunload` handler, so a session's end ≈ its last activity. No new
  leave-detection needed. (Honest limit: a browser can't distinguish "left for good" from
  "switched tabs for 2 min" — so a sitting is *defined* as "activity with no gap > 30 min."
  Standard analytics-style session timeout; matches intuition.)

Keep the continuity decision **pure and unit-tested** (e.g. a `shouldResumeSession(session,
nowMs, graceMs)` helper in `player-progress.js`), so the 30-min rule isn't buried in DOM
code.

### Piece 2 — "Finish" control (the closure + share)
A clear control next to Pause/Restart (and in the touch header) — proposed label
**"Finish"** (warmer than "End session" for a kid). On click:
- stop play (stop spawning, clear/settle the board),
- disable all active operation types (nothing keeps accruing),
- open **the current session's combined report** with **"Share with a parent"** visible
  and emphasized.

Decided: **Finish only shows + shares; it does NOT hard-close/fragment.** Re-enabling an
op (or picking a problem) after Finish continues the **same** session — so an accidental
Finish, or "actually, one more," stays in one report. Ending is left to the idle-grace /
tab-close path from Piece 1.

Empty-session nicety: if Finish is pressed with no activity yet, show a gentle "no drops
cleared yet" state rather than a blank report (or disable Finish until there's activity).

## Open Questions
- **Settled:** grace window = **30 min**; Finish = **show + share only** (no hard close).
- Exact "stop play" semantics on Finish vs the existing Pause — confirm during impl they
  compose cleanly (Finish should leave the game in a clean, resumable state, not a weird
  half-paused one). Reuse Pause's stop-spawn path where possible.
- Label/copy ("Finish" vs "I'm done" vs "Done for now") — pick during impl; keep it
  positive. Mobile/touch header placement to be confirmed against current control layout.

## Implementation Notes
- **Continuity:** `script.js` `createSessionId()` / `startVisitSession()` (~307–322) and
  the init call site. Add the pure `shouldResumeSession(...)` to `player-progress.js`;
  `recordSessionStart` (player-progress.js ~915) already resumes by id. `recordSessionStart`
  and friends already take an injectable `nowMs` — use it for deterministic unit tests.
  Newest session is `profile.sessionLog[0]` (unshifted newest-first); its `lastSeenAt`
  drives the decision.
- **Leave stamping:** already handled by `heartbeatActiveSession` + the `beforeunload`
  listener (script.js ~6384) and `touchSession` (player-progress.js ~906). No change.
- **Finish UI:** controls live in `index.html` near Pause/Restart and in the touch header;
  wire in `script.js`. Reuse `buildSessionReportPopup(state.activeSessionId)` and the
  existing `shareReportWithParent` — Finish is mostly routing + stop-play + disable-ops, not
  new report code.
- No profile schema change, no migration. Continuity is purely how the active session id is
  chosen on load.
- Watch link size: a richer multi-op sitting makes a longer share link than a single-op one
  — fine (the recent v2 trims keep it reasonable), just don't regress the read-only/tamper
  protections.

## Acceptance Criteria
- Reloading mid-sitting (gap < 30 min) keeps the **same** session — no new Log row; the
  report still shows all prior activity.
- A gap > 30 min, or a fresh profile/visit, starts a **new** session.
- Switching player profiles starts a new session (never resumes another kid's).
- Multiple operations in one sitting render in **one** report (already true — must stay).
- A "Finish" control next to Pause/Restart and in the touch header: stops play, disables
  active ops, and opens the current session's combined report with Share-with-a-parent
  visible.
- Finish does **not** fragment: re-enabling an op after Finish continues the same session.
- Tab close still stamps the session end.

## Testing
- **Unit (player-progress):** `shouldResumeSession` — within grace resumes, beyond grace is
  new, missing/empty is new; resume only within the same profile. `recordSessionStart`
  resume-by-id already touches an existing session (cover if not already).
- **E2E:** (a) do activity → reload → assert same `activeSessionId` and a single Log row
  with the pre-reload activity present; (b) backdate the newest session's `lastSeenAt`
  (via a test hook or seeded profile, since e2e can't wait 30 real minutes) → reload →
  assert a new session; (c) switch profile → new session; (d) Finish button → ops disabled,
  board stopped, report popup open with the Share button visible; (e) after Finish,
  re-enable an op and clear a drop → it lands in the **same** session/report.

## Outcome
(pending implementation by Codex)
