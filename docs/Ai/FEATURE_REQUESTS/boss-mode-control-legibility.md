# Feature: Make boss-mode controls legible (no silent gating)

Status: landed
Owner: Codex (planned by Claude; reviewed by Claude)
Last Updated: 2026-06-29
Related Commits: (this commit)

## User Request
"There's something funky about the different boss-mode options — I was clicking on them
and it wasn't changing." Investigation confirmed the controls aren't broken; they're
**silently gated**. Fix the feedback so the boss-mode area stops feeling inert.

## Goal
Every boss-mode control should make its state obvious: if you can't use it yet, it shows
**why** and what unlocks it — instead of silently hiding, disabling, or refusing to move.
Must work on **touch** (today the only explanation is a desktop hover `title`).

## Diagnosis (confirmed in code)
The per-operation diff card (`buildDiffCards`, script.js ~3909) has three boss-mode
controls, each of which fails *silently and differently*:

1. **Level ▲ selector** — `setDifficulty` → `canAdvanceDifficulty` blocks climbing above
   your unlocked level. The number just doesn't move. Worse, the only feedback
   (`showReadyRequired`) flashes "Master first" on the **Mastered button**, not on the
   selector the user actually clicked.
2. **"Mastered" button** (`.diff-ready`) — rendered but native-`disabled` when
   `!canOpenLevelChoices(skill)` (not boss-ready and never attempted/advanced). It looks
   clickable but taps do nothing (disabled → no click event → no feedback).
3. **Blitz / Wave / Worksheet** (`.diff-challenge`) — `hidden` entirely when the selected
   level isn't replay-eligible (`getReplayChallengeLevel(opKey, skill) === 0`). They
   vanish/appear as the level changes, so there's often nothing to click.

The one explanation that exists — `getBossButtonTitle` as a `title` tooltip — is invisible
on mobile and easy to miss on desktop. Re-render paths are fine (`setDifficulty` and the
boss end-paths fully rebuild the cards); this is purely a feedback/affordance problem, not
a stale-render or stuck-lock bug.

## Design — show the lock + the reason, give tap feedback
North star: **replace silent hide / native-disable / no-op with a visible locked state +
reason, and tap feedback on mobile.** Keep the existing start-boss/challenge flows
unchanged when controls *are* available. Don't build a new screen — this is an
in-place legibility pass on the diff card.

### Pure, testable reason helpers (game-core.js)
Add small pure functions (unit-tested, like the other `format*`/`can*` helpers), so the
copy/logic isn't buried in DOM code:
- `getMasteryGateReason(skill)` → `null` when choices are open, else a short reason, e.g.
  `"Master {BOSS_READY_SCORE}% of Level N to choose Boss / Next Level."` (mirror
  `getBossButtonTitle`'s not-ready branch, but as returnable data).
- `getReplayLockReason({ selectedLevel, unlockedLevel, currentLevel, bossReady })` → `null`
  when replays are available at the selected level, else the reason:
  - selected level **above** current/unlocked → `"Reach Level N first."`
  - selected level **is** current but not mastered → `"Master this level to unlock its
    challenges."`
  - selected level beaten earlier → (available; returns null)
  Keep it a pure function of those numbers so it's trivially unit-tested.

### Control changes (script.js / styles.css)
1. **Mastered button:** when gated, **stop using native `disabled`** for the *gating* case
   so taps register — keep the locked styling (`.is-locked`), and on click show the
   `getMasteryGateReason` text as visible, mobile-friendly feedback (extend/replace the
   `showReadyRequired` flash so it shows the real reason and persists briefly). Still
   render truly-inert (no feedback needed) only while a boss/challenge is actually running
   (`isControlLocked()`), which is a separate, correct disable.
2. **Challenge buttons:** when `getReplayLockReason` is non-null, **don't hide the row** —
   show a single compact locked hint line (e.g. `🔒 {reason}`) in place of the buttons,
   rather than three dead buttons (keeps the many-ops layout uncluttered) or nothing.
   When replays *are* available, render the buttons exactly as today.
3. **Level ▲ blocked:** make the feedback land **on the selector** the user clicked (not
   the Mastered button), and ensure it's visible on touch — a brief inline cue like
   "Beat the boss to go higher" near the selector, reusing the reason copy.

Keep the `title` tooltips too (harmless on desktop), but the visible states are the fix.

## Open Questions
- **Settled:** scope is the in-place legibility pass, not a dedicated boss screen.
- Exact copy + iconography (🔒 vs a small lock glyph vs plain text) — pick during impl,
  keep it kid-readable and short.
- Whether the compact locked challenge hint should appear for *every* op with nothing
  unlocked (could be noisy on a brand-new profile) — impl call: prefer showing it only
  when it adds signal, otherwise a minimal hint; don't clutter the card grid.

## Implementation Notes
- Card build/refresh: `buildDiffCards` (~3909) and `updateReadinessDisplays` (~4111) — both
  must apply the new locked states/text so they survive the periodic in-place refresh, not
  just the full rebuild. Mirror to the mobile keypad strip (`buildKpDiffStrip` /
  `.kp-diff-*`).
- Gating predicates already exist: `canOpenLevelChoices`, `shouldPromptBossAttempt`,
  `canAdvanceDifficulty`, `getReplayChallengeLevel`, `getBossButtonTitle`. Reuse them;
  add only the two pure reason helpers.
- `showReadyRequired` (script.js) is the current ▲-blocked flash — rework it to target the
  selector and carry the real reason.
- No profile schema change. No change to the actual boss/challenge start logic or to when
  things unlock — only how the locked state is *communicated*.

## Acceptance Criteria
- No boss-mode control fails silently: a gated Mastered button, challenge buttons, and a
  blocked ▲ each show a visible reason / tap feedback explaining what unlocks them.
- All feedback is visible on **touch** (no reliance on hover `title`).
- Tapping the gated Mastered button shows its unlock reason instead of doing nothing.
- Challenge area communicates why replays are unavailable at the selected level instead of
  vanishing.
- When controls *are* available, Boss / Blitz / Wave / Worksheet / Next Level still start
  exactly as before (no regression).

## Testing
- **Unit (game-core):** `getMasteryGateReason` (null when open; reason when not boss-ready)
  and `getReplayLockReason` for each branch (below-current beaten → null; current
  not-mastered → master-this-level; above-unlocked → reach-level-N).
- **E2E:** (a) a not-boss-ready profile → the Mastered control shows/【taps to】 a reason
  and the challenge area shows a locked hint (assert text present, not `hidden`); (b)
  blocked ▲ → feedback appears at the selector; (c) a boss-ready / level-unlocked profile →
  Mastered opens the offer and Blitz/Wave/Worksheet start as today (no regression).

## Outcome
Implemented by Codex on 2026-06-29:
- Added pure, unit-tested `getMasteryGateReason(skill)` and `getReplayLockReason(...)`
  helpers in `src/game-core.js`.
- Desktop level cards now keep the gated Mastered control tappable, show a specific
  mastery reason on click, show selector feedback beside the level number when `+` is
  blocked, and show a compact locked challenge hint instead of a disappearing
  Blitz/Wave/Worksheet row.
- Mobile keypad diff controls mirror the same locked states and tap feedback.
- Existing unlocked flows are unchanged: Mastered opens the boss/next-level offer, and
  Blitz/Wave/Worksheet controls still start their challenge modes when eligible.
- Added unit and e2e coverage for the locked-state reason helpers and visible desktop
  plus touch feedback.
