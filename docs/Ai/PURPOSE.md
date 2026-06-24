# Purpose

## Project Goal
Build a fast, friendly math game where falling drops are cleared by typing answers. The game should feel responsive, playable immediately, and let the user control their own practice mix while the game is running.

## Design Principles
- Low setup friction: first visit shows a Play/Tutorial/player menu, then returning visits load directly into play.
- Fast input: ordinary numeric answers clear immediately; multi-step or symbolic answers use Enter only where needed.
- User-controlled pacing: operation types, per-operation difficulty, fall speed, and active-drop load are adjustable during play.
- Content level and practice pressure are separate mastery axes: levels measure problem scope, while speed/drop load, Blitz/Wave scores, and Boss time give optional fluency goals.
- Clarity over complexity: production remains static HTML/CSS/browser JavaScript with no build step.
- Testable core behavior: math/problem rules live in DOM-free JavaScript so they can be covered by deterministic unit tests.

## Current Player-Facing Behavior
- Drops fall from the sky and clear when the correct answer is typed.
- The player ship is a canvas-drawn vector ship that briefly turns toward solved problems and fires from its nose.
- First-time visitors see a polished welcome menu with Play, Tutorial, and local player selection/creation. Choosing Play dismisses the menu for future visits; the Menu link can reopen it later.
- The Tutorial is an in-app stepper that highlights real controls and explains problem types, typing rules, Speed/Drops pressure, mastery grids, Spacebar Breather, boss mode, and local profiles/results.
- Welcome-menu and Tutorial copy lives in `src/text/english.js` so it can be edited in one place and later mirrored into other locale files.
- Immediate-clear operations: add, subtract, multiply, divide, factors of 10, and Shapes (level-gated: 2D square/rectangle/triangle/circle perimeter & area, then 3D cube/rectangular-prism/cylinder/sphere surface area & volume; round shapes answer as the π coefficient).
- Enter-required operations: SI metric conversions such as `*1000` or `/100`, and full prime factorization answers such as `2^2*3`.
- Prime factor drops can be targeted with Tab and simplified one factor at a time; when factoring is the only operation in play the most urgent drop is auto-targeted, so you can either step through factors or type the full `2^2*3` and press Enter.
- Each operation can be toggled on/off during gameplay; if none are enabled, no new drops spawn. Operations are grouped into compatible sets (arithmetic `+ - × ÷` and `×10` together; Shapes; SI; Factoring); enabling an operation from a different set disables the incompatible ones.
- Each operation has an independent difficulty level from 1-10, starting at level 1 for new profiles.
- Current levels are stored in the local profile; increasing to the next level requires beating that operation's boss mode at the current level.
- Boss mode unlocks from the per-operation Mastered control once 80% of the current-level problem universe is mastered. A problem counts as mastered only after at least 3 attempts with at least 90% current accuracy, where current accuracy heavily weights recent performance while retaining a small lifetime correction so older mistakes fade without trapping a player forever. Once unlocked but unbeaten, the Mastered control lightly pulses, and a modal Boss / No boss choice temporarily interrupts play. On reload, each operation resumes at the level after its highest cleared boss so a temporarily lowered selector does not strand progress.
- Full boss mode runs three assessment stages for the selected operation and level: Wave 1 is a shield-endurance speed ramp with a fixed simultaneous-bomb cap, Wave 2 is a load-ladder that presents a round of N problems and only steps up to N+1 after the whole round is cleared, and the final mothership is a "fact sheet" covering the entire current-level problem universe (randomly sampled, capped at 50) split across sequential Shields, Guns, Wings, and Core parts. The mothership reveals a small capped batch of problems at a time (at most 6 visible, never two with the same answer) so a typed answer can never clear the wrong node; solving all nodes on a part knocks that part off as fading damaged debris, and parts left empty by a small universe auto-collapse. Final-boss missiles are slower moving copies of remaining mothership nodes; solving a missile also clears that source node, so missiles add pressure without adding extra required facts.
- Wave 1, Wave 2, and standalone Blitz score on the number of problems solved, shown live on an on-ship shield/solved counter near the player base.
- Clearing the final mothership advances that operation to the next content level and unlocks replay challenges for the cleared level: Blitz score, Wave score, and Boss time.
- Boss, Blitz, and Wave problems are assessment/challenge events: they do not update ordinary per-problem mastery stats or the session Cleared counter.
- Blitz and Wave replay buttons are restricted to the highest cleared level for that operation. Blitz is a shield-endurance score run; Wave is a simultaneous-load score run; Boss replay records time without advancing content level. Higher-level challenge results can supersede lower-level displayed bests when they are better.
- Global practice controls include Speed from 0-100% and Drops from 0-10 simultaneous falling problems.
- Pause stops motion and spawning without covering the playfield, so settings and Results remain accessible.
- Space starts a practice-only Breather: visible drops stop moving, no new drops spawn, and normal play resumes automatically once the visible board is cleared. The input hint calls this out during play.
- The header shows a session-only Cleared counter for correct drops cleared during the current run.
- The Log link opens a local session history. A new session starts on each visit or player switch and records practice stats, boss/challenge solved counts, challenge starts/completions, and a Report view with per-operation engaged duration, correct/missed counts, and level-by-level mastery start/end changes. Boss pressure is still kept out of ordinary mastery accuracy.
- The Login link opens a local player selector where players can create or switch named profiles stored in localStorage, or clear the current player's saved practice stats.
- A local profile tracks per-operation readiness, per-problem outcomes, saved Speed/Drops settings, derived pressure-tier practice metadata, boss clears, Blitz/Wave/Boss challenge attempts and bests, and boss-readiness recommendations in localStorage.
- Existing single-profile localStorage data is migrated into the local profile selector as `david` when it still has the old default player identity.
- Boss readiness is universe-aware: it is the percentage of current-level problems that meet the 3-attempt/90%-current-accuracy mastery rule, with boss attempts unlocked at 80%.
- Current-level mastery is visible on per-operation level controls; broader learning progress is shown through the Results popup.
- Results show per-operation readiness, weak-practice suggestions, and unlocked challenge status where available. Challenge bests are listed per level: each level shows its own Blitz/Wave best score and Boss best time, or a stronger equal-or-higher level's score if one exists, with never-played levels shown as not played.
- Results practice suggestions blend weak seen problems for review with unseen level problems for coverage. Falling practice drops are weighted toward unmastered, low-accuracy, and under-attempted problems.
- Problem accuracy is shown through per-operation stats popups. Hovering/focusing grid cells shows detailed attempts, accuracy, and mastery status. Operation level cards include a Grid hint that opens the per-problem accuracy grid/list.
- Falling drops are shaded with the same accuracy/evidence palette as the stats popup: untested problems are black, hue runs from red through yellow to green by accuracy, and brightness/opacity increases with repeated attempts.
- During boss/challenge play the header readout (normally the session Cleared count) shows live stage progress instead: Wave 1 solved count and current speed, Wave 2 solved count and current load, and the mothership's nodes cleared. Between failed shield waves, a screen-wide top-to-bottom laser sweep represents the player's super weapon clearing the rest of the wave before the next stage begins. A full boss clear opens a victory summary (congratulations, the three stage results, and a Next Level button), with the accuracy grid reachable from it. A parallax starfield and a mothership that looms closer each wave reinforce the sense of approaching the boss.
- Touch devices use an on-screen keypad and compact controls.
- Physical numpad entry is normalized so bumping NumLock does not break answer entry; numpad digits still enter numbers when the browser reports them as navigation keys.
- Donate links point to Ko-fi from the header/menu and from each session report; Feedback opens a FormSubmit-backed feedback form.

## Non-Goals
- No lives, timers, ELO rating, backend sync, or build pipeline for production.
- Login is currently local profile selection only; it is not authentication.
- Tests and Playwright are dev-only tooling; the deployed game remains static.

## Repo Access
- GitHub SSH user: `david8381`
- Repo: `RainDrops`
- Default branch for pushes: `main`
