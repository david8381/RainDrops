# Feature: Curriculum Tracks (data-driven levels)

Status: landed (v2 phase D — human-readable arithmetic level lists)
Owner: Claude & Codex
Last Updated: 2026-07-05
Related Commits: 5962132, bd3731e (steps 1–4), c3a4edc (step 5), ef8870a (A), 4363fe3 (B), 1d41212…a2694c2 (C), + phase D (arithmeticLevels)

## User Request
"A way to monetize this might be to offer tracks (e.g. Math-U-See, Saxon) — and
to do that we would need a flexible way of defining problems, levels, progression."
Then: "I want to be PREPARED… start defining our levels as examples of the above…
right now we define levels of a given op a certain way — call that the standard
path — but we could just as easily define a different path. A refactor of the
existing workflow in light of those future plans." And a concrete first deliverable:
"add a second track: multiply-only, each level is multiples of 1, 2, … 12 — so we
actually see this functionality in action."

## Goal
- **Prepare**: express the current, hardcoded per-op level definitions as *data*
  read through a swappable seam, without changing any behavior (the game today
  becomes the `standard` track).
- **Prove**: ship a real, playable second track (**Times Tables**) so the seam is
  demonstrably real, not dormant — and so alternate curricula (Saxon, Math-U-See)
  later become mostly data additions.

## Design
- **`src/curriculum.js`** (pure data, no imports): `TRACKS` maps each op to a
  descriptor with a `kind` tag, plus `ops` (which ops the track exposes; `null` =
  all). `getActiveTrack(id)` resolves to `TRACKS.standard` for unknown/missing ids.
  - `standard`: arithmetic ops are `{ kind: "range", min, maxLo, maxHi }` (the old
    `getDifficultyRange` lerp, now as data). Non-arithmetic ops are *not yet* on the
    track — they fall back to game-core's built-in behavior (deferred; see below).
  - `timesTables`: `ops: ["mul"]`, with `mul.kind = "arithmeticLevels"` and an explicit
    `levels` list: 1s table, 2s table, ..., 12s table, then a mixed 1×1-12×12 review.
- **The seam**: an optional trailing `track = TRACKS.standard` parameter on the
  functions that map level → universe/difficulty. game-core stays pure/DOM-free (no
  globals, no import cycle); existing callers omit the arg → Standard → the existing
  test suite is the regression net.
  - game-core: `getDifficultyRange`, `generateProblem`, `generateWeightedProblem`,
    `getAnswerUniverse`.
  - player-progress: `getSkillUniverseSize` / `getSkillUniverseProblems` and the
    readiness chain (`computeSkillReadiness`, `…ForLevel`, `updateSkillReadiness`,
    practice/finish-level helpers). `summarizeProfile` resolves the profile's track
    once and threads it down, so every readiness consumer becomes track-aware.
- **New `arithmeticLevels` kind**: each level describes operand ranges or exact
  pairs (`a`, `b`, `pairs`), and game-core expands that one shape into generation,
  weighted practice, answer universes, mastery universes, and boss worksheets.
  StatsKeys are still `"a,b"`, so per-fact mastery stats carry over across tracks
  (switching doesn't corrupt stats).
- **Activation**: profile field `activeTrack` (additive; defaulted in
  `createDefaultProfile`, back-filled via the `ensureProfileShape` spread; **no
  `PROFILE_VERSION` bump**). script.js resolves `getActiveTrack(profile.activeTrack)`
  and threads it into generation/universe/answer calls.
- **Op gating**: when a track sets `ops`, script.js hides the other op chits, forces
  only those ops enabled (`applyTrackOpGating`), guards `toggleOp`, and `getEnabledOps`
  filters to the allowed set. Standard (`ops: null`) is unchanged.
- **Level cap**: `getOpMaxLevel(opKey)` = `getTrackOpMaxLevel(opKey, track)` (level-list
  length, explicit `maxLevel`, else the Standard 10). Used by `setDifficulty`, the
  diff-card `aria-valuemax`, placement, boss advancement, and the resume clamp.
- **Selector**: a "Curriculum" `<select>` in the Login player manager
  (`src/popups/login-popup.js`, ctx-injected `setActiveTrack`). On change:
  `setActiveTrackForProfile` sets `activeTrack`, clamps each op's level into the new
  track's range, saves, and re-applies the profile (re-gates chits, rebuilds cards,
  resets the run).

## Open Questions
Resolved for the MVP; see deferred follow-ups.

## Implementation Notes
- Preserve emission order everywhere (weighted pick + `sequenceRng` determinism
  depend on it). The golden snapshot is order-sensitive.
- `src/types.js`: `StoredProfile.activeTrack?: string` added (kept typecheck green).
- Test hooks: `setTrack(trackId)` and `spawnGeneratedDrop()` (spawns one drop via the
  real weighted generator so e2e can inspect generated problems).

## Acceptance Criteria
- Standard reproduces today's levels **byte-for-byte** (golden snapshot).
- Selecting Times Tables → only `×` available; L1-L12 present the matching N times
  table (N×1…N×12); L13 is a mixed 1×1-12×12 review; grid/mastery reflect the
  active level's fact universe.
- Switching back to Standard restores all 11 ops and the 10-level cap; mul level
  clamps to 10; fact stats persist.

## Testing
- `tests/unit/curriculum.test.js`: golden snapshot (Standard) + swap-proof (Times
  Tables table levels, final 144-fact mixed level, ≠ Standard, generation shape).
- e2e "curriculum tracks": switch → op-set collapse → range/universe → real
  generation is N×b → master records the 12 facts → L13 has 144 facts → restore Standard.
- 99 unit + 61 chromium e2e green at landing.

## Outcome (step-5 MVP)
Landed the prepared seam (arithmetic Standard as data) + the playable Times Tables
track with a Login selector. Shipped as v0.3.146 (commit c3a4edc).

## v2 — shared facts / per-track coverage (in progress)
Review of the MVP surfaced two real gaps + a structural critique (all agreed with
the user):
- **Progress bled across tracks.** The MVP kept one shared per-op record holding
  level, per-fact stats, *and* boss/mastery flags. So clearing Standard mul level 2
  marked Times-Tables level 2 "mastered" even at ~50% coverage of the 2-times-table,
  and reports couldn't say which track. Incoherent.
- **Only ~40% data.** Only the arithmetic ranges were data; the other 7 ops still ran
  on hardcoded game-core logic (deferred "step 6"). So Standard was *not* a full
  representation.
- **File layout** didn't scale (one short `curriculum.js`).

**Key design distinction (user):** *per-problem fact stats are universal* (knowing
`7×8` is knowing it, any track) and stay **shared**; *what a track covers* — level
structure, which facts are in level N, boss/level clears, current level, "mastered
level N" — is **per-track**.

Agreed direction:
- **A. File reorg** ✅ (commit ef8870a) — `src/tracks/<track>.js` data modules +
  `src/curriculum.js` as the thin registry (`TRACKS` + `getActiveTrack`).
  Behavior-preserving.
- **B. Shared facts / per-track coverage** ✅ — split the op record: `problems`
  (per-fact stats), `totals`, `recent`, `pressureTiers` stay **shared**;
  `currentLevel` + `bossAttempts` + `levelAdvances` + `placementCredits` +
  blitz/challenge bests moved to `tracks[trackId]`. Readiness recomputes from the
  shared facts against the **active track's** universe via a track-resolved view
  (`viewSkillForTrack`, so the ~12 bare-`skill` readers kept their signatures);
  writers use `ensureCoverage`. `PROFILE_VERSION` 3→4 migration folds existing
  progress into `tracks.standard`. e2e proves a Standard clear doesn't carry to
  Times Tables while facts do. 99 unit + 231 e2e (6 projects) green.
- **C. Data-fy all 11 ops** ✅ — every op's level definition now lives in
  `src/tracks/standard.js`, read via the threaded track (`track[op] ??
  TRACKS.standard[op]`, so alternate tracks can override): f10 (maxDigits/maxPower),
  factor (minN/maxN/levelOffset), round (per-level spec tuples), reduce (per-level
  concept cells), pow (cumulative rung ladder), si (prefixes + unlock thresholds),
  shapes (partial — the level gate `defs` + dimension bounds are data; per-shape
  enumeration + area/volume formulas stay in game-core as the generation strategy).
  One op per commit (1d41212…a2694c2), the byte-for-byte snapshot green at each.
- **D. Human-readable arithmetic level lists** ✅ — alternate arithmetic tracks no
  longer need one-off generator kinds. New `kind: "arithmeticLevels"` describes
  each level as readable operand ranges or exact pairs:
  `[{ label: "7s table", a: 7, b: { from: 1, to: 12 } }, ...]`. game-core expands
  that one data shape into generation, weighted practice, answer universes,
  mastery universes, and boss worksheets. Times Tables now uses this form with
  13 levels: L1-L12 are the individual 1s-12s tables; L13 is mixed review over
  all 144 facts from 1×1 through 12×12. Track max-level handling was widened
  through boss, Test Me, session/challenge storage, and op-chit progress so tracks
  are not forced into Standard's 10-level cap.

Still deferred: more real tracks (Saxon, Math-U-See — mostly data additions now);
per-op mastery thresholds stay global (seam: `TRACKS[id].progression`).
