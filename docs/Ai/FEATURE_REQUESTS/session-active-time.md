# Feature: Session "active time" (stop idle from inflating duration)

Status: agreed — ready for implementation
Owner: Codex (planned by Claude; Claude to review)
Last Updated: 2026-07-01
Related Commits: (pending)

## User Request
Session durations are absurd when a tab is left open — David has one showing **2400 min**
("left it open all day and did nothing"). If a kid genuinely works for 20 minutes we want
it to read ~20 minutes; idle time should not count.

## Root cause
Session duration is `getSessionDurationMs = endedAt − startedAt` — pure wall-clock. And
`endedAt` is re-stamped by `touchSession` on *any* touch, including **just opening the Log
to view the session** and on `beforeunload`. So a long-open tab reads as "session start →
now" regardless of actual play. (The 30-min idle rule that ends a session only fires on
*reload*; a continuously-open tab never trips it.) The report's *per-operation* time is
already idle-safe — it sums per-problem response times capped at 60s — but the session
**headline** duration uses the naive wall-clock.

## Design — accumulate an idle-capped "active time"
Track real seat-time by accruing only the gaps between activity that are short enough to be
genuine work; long gaps are treated as idle and contribute at most a small cap.

- New per-session field **`activeMs`** (default 0, persisted).
- In `touchSession(profile, session, nowMs)`: before updating `lastSeenAt`, compute
  `gap = nowMs − Date.parse(session.lastSeenAt || session.startedAt)` and do
  `session.activeMs = (session.activeMs || 0) + clamp(0, SESSION_IDLE_GAP_CAP_MS, gap)`.
  Then set `lastSeenAt = endedAt = now` as today.
- `SESSION_IDLE_GAP_CAP_MS ≈ 120000` (2 min) — long enough that normal thinking pauses count
  in full, short enough that wandering off adds ≤ 2 min. Tunable; note the tradeoff (a single
  problem a kid genuinely chews on for >2 min caps at 2 min).
- Because every touch adds at most the cap, **passive touches can't inflate** it: opening the
  Log after hours idle adds ≤ 2 min; `beforeunload` after idle adds ≤ 2 min; a continuity
  resume after a ≤30-min gap adds ≤ 2 min.

### Capture genuine work, not just cleared drops
`touchSession` already fires on every solved problem + challenge event. Also **mark activity
on each answer submission (correct *or* wrong)** so a kid actively attempting (but not
clearing) still accrues time — route it through the same idle-capped accrual (a light
`heartbeatActiveSession()` on submit is enough; no need to record a stat). Don't accrue on
mere focus/idle keypresses beyond submissions.

### Display + legacy
- `getSessionDurationMs(session)` becomes the single source everything uses (log row, report
  meta, compact share link):
  - if `Number.isFinite(session.activeMs)` → return `activeMs`;
  - else (legacy sessions with no `activeMs`) → fall back to the **sum of per-operation
    engaged `durationMs`** (already idle-safe), not the old wall-clock.
  This means the existing 2400-min session immediately shows a sane number instead of 2400.
- Don't default `activeMs` in `normalizeSessionEntry` (leave it absent on legacy so the
  fallback applies); it gets created lazily on the first `touchSession`. Brand-new untouched
  sessions read 0 via the fallback, which is correct.
- Headline (active time) will generally exceed the sum of per-op engaged time (active counts
  pauses; engaged is capped solve-time) — that's expected and fine; they measure different
  things ("how long the sitting was" vs "solve time per operation").

## Open Questions
- **Settled:** approach = idle-capped active clock (#2); legacy falls back to engaged-time sum.
- Exact cap (2 vs 3 min) — start at 2 min, easy to tune after playtesting.
- Whether to surface engaged-time anywhere as a secondary stat — deferred; headline is active
  time.

## Implementation Notes
- `src/player-progress.js` (pure, unit-tested): `SESSION_IDLE_GAP_CAP_MS`; the accrual in
  `touchSession` (it already takes an injectable `nowMs` — good for deterministic tests);
  `getSessionDurationMs` active-then-engaged-fallback; ensure `activeMs` round-trips through
  `normalizeSessionEntry`/save without being defaulted on legacy.
- `script.js`: add a `heartbeatActiveSession()` on answer submission (correct + wrong) so
  genuine attempts accrue. The Log/Report/Finish/beforeunload touch points stay (now bounded
  by the cap). No display code changes beyond reading `getSessionDurationMs` (already used).
- No change to the session-continuity 30-min resume rule; this is orthogonal (it just stops
  the *duration* from inflating).
- Report view model: `createSessionReportViewModel` keeps taking `session.durationMs` from
  `getSessionDurationMs`, so the compact share link carries active time automatically.

## Acceptance Criteria
- A session idle for long stretches (or a long-open tab) shows active time ≈ real working
  time, never wall-clock; opening the Log/Report doesn't inflate it.
- ~20 min of continuous work (frequent solves/submissions, pauses < cap) reads ~20 min.
- A single idle gap of hours adds ≤ the cap (~2 min), not the whole gap.
- Legacy sessions with no `activeMs` show the idle-safe engaged-time sum (so the current
  2400-min session no longer shows 2400).
- Log row, report header, and shared link all show the same number.

## Testing
- **Unit (player-progress):** `touchSession` accrual — several small-gap touches sum in full;
  one large gap adds only the cap; `activeMs` persists across touches; `getSessionDurationMs`
  returns `activeMs` when present and the engaged-sum fallback when absent (drive with
  injected `nowMs`).
- **E2E:** solve a few problems → log duration is small/sane (not wall-clock); use a
  test hook to jump the clock forward between touches (à la `backdateActiveSession`) and
  assert the duration only grew by ≈ the cap, not the jump.

## Outcome
(pending implementation by Codex)
