# Changelog

## Purpose
This file records meaningful project changes so future collaborators (including AI agents) can quickly understand what changed, when, and why without rereading every file.

## 2026-06-24
- Added a persisted Text Size control for problem drops and worksheet nodes, with crisper heavier canvas text and matching desktop/touch controls.
- Added a Test Me diagnostic placement flow from the header and welcome menu. It climbs by operation level after 2/3 correct, can set a starting level, and does not write mastery stats.
- Added a Share Badge popup from boss victory and unlocked level cards, summarizing best Blitz, Wave, and Worksheet results with copy/share actions.
- Added a short cannon-overload cooldown after repeated impossible submissions, so keyboard spamming is throttled without counting as ordinary mastery accuracy.
- Let fully mastered current levels show Blitz, Wave, and Worksheet buttons immediately after choosing Keep Practicing, without requiring a temporary jump to the next level and back.
- Changed Blitz/Wave challenge bests to use their natural metrics: Blitz now records survival time plus fastest drop time reached, Wave records the highest simultaneous load fully cleared, and solved counts remain in attempt history for future progress views.
- Removed the hard 85% Blitz pressure cap by making the Blitz drop-time ramp continue more gradually after the old ceiling.
- Made boss optional after full mastery: the mastery prompt now offers Keep Practicing, Boss, or Next Level; Next Level records a mastery advance separately from boss clears so reloads still resume at the right level.
- Renamed the standalone final-boss replay to Worksheet, removed the 50-problem cap so it covers the full current-level universe, added live cleared/total plus elapsed time, and made missiles drop from visible worksheet nodes that can be cleared before launch.
- Let unlocked/revisited levels launch Blitz, Wave, or Worksheet independently without forcing the full three-stage boss sequence.
- Removed the visible Results tab, simplified welcome-menu Donate copy, locked operation toggles during boss/challenge play, and made session reports roomier with one mastery line per level.
- Changed the post-wave super-weapon sweep to travel bottom-to-top, locked level/challenge controls during boss play, and improved touch layouts so operation chits are visible as a grid while short landscape screens put the keypad beside the playfield.
- Raised boss unlocks to 100% current-level mastery and added finish-level focus practice once an operation reaches 80%, so remaining unmastered facts appear much more often near the end of a level.
- Added current level text and a subtle course-progress fill to operation chits so the top-level problem selector communicates where each operation sits in the 10-level course.
- Replaced the post-wave burst/explosion visual with a screen-wide laser sweep so it reads as the player's super weapon clearing the wave.
- Made the session report Donate prompt less prominent by moving it from a primary-looking action button into small footer text.
- Smoothed boss Wave 1 pressure by removing double-applied bomb speed and easing the speed ramp before it reaches the unreadable zone.
- Changed final-boss missiles into slower moving copies of remaining mothership nodes; solving a missile clears that node, so the final boss still measures the current-level fact sheet rather than adding extra generated problems.
- Made mastery prompts modal with Keep Practicing / Boss / Next Level choices, and paused gameplay under modal overlays so boss victory summaries and reports cannot cause background misses.
- Changed full boss session logging so a full boss run counts as one session challenge started/completed while still saving Blitz/Wave/Boss stage bests.
- Renamed Support links to Donate and added a Donate link to each session report.
- Updated session reports to show mastery changes level by level within each operation.
- Increased the recent-performance weight in current accuracy so a long-ago bad streak can be overcome by a strong recent streak.
- Expanded local session logs with a Report view showing per-operation engaged duration, correct/missed counts, challenge activity, and mastery start/end changes so a child can show concrete progress from a saved session.
- Added operation-level session report data in the local profile: practice/assessment stats, challenge counters, capped response-time duration, and mastery snapshots.

## 2026-06-23
- Added per-profile local session logging: each visit or player switch starts a bounded session record with practice accuracy, boss/challenge solved counts, challenge starts/completions, and duration.
- Added desktop and touch Log buttons with a session-log popup, plus tutorial copy pointing players to the new Log view.

## 2026-06-22
- Hardened boss/challenge problem handling so wrong answers, landed bombs, reveals, and solved boss nodes are intrinsically excluded from ordinary practice accuracy and mastery stats.

## 2026-06-21
- Replaced the bottom-center rectangle gun with a canvas-drawn player ship that turns toward solved problems, fires from its nose, pulses on shots, and returns to center afterward.

## 2026-06-20
- Hardened canvas frame clearing and per-drop draw isolation to reduce ChromeOS/Chromebook paint trails from laser and drop effects.
- Added a Ko-fi support link to the desktop header, compact mobile header, and welcome/menu panel, with support copy centralized in `src/text/english.js`.
- Tutorial steps now omit the tip callout when `tip` is missing or blank in `src/text/english.js`, so manual copy edits do not leave empty boxes.

## 2026-06-19
- Moved welcome-menu and Tutorial copy into `src/text/english.js`, a plain-script English catalog loaded before `script.js` so onboarding text is editable in one place while preserving direct `file://` loading.
- Added a first-visit welcome menu with Play, Tutorial, and local player selection/creation; choosing Play or leaving the Tutorial stores a local flag so returning visits go straight into the game, and the Menu link can reopen it.
- Added an in-app Tutorial stepper that highlights existing controls and explains problem types, typing, Speed/Drops pressure, mastery grids, Spacebar Breather, boss mode, and profiles/results.
- Normalized physical numpad input so pressing NumLock does not break answer entry; numpad digits still enter numbers even when the browser reports them as navigation keys.

## 2026-06-14
- Added a parallax starfield behind boss mode so the lead-up reads as flying forward toward the mothership between waves.
- Replaced the post-victory accuracy grid with a victory summary popup: a "Boss Defeated" congratulations, the three stage results (Wave 1 / Wave 2 solved counts and Worksheet time), and a Next Level button (the accuracy grid is still reachable from it).
- Added a looming mothership during the full boss lead-up: it peeks just onto the screen during Wave 1 and descends noticeably closer in Wave 2 before dropping into full position for the fight, reinforcing that the boss is launching the waves. It is purely cosmetic and non-interactive.
- Wrong typed answers no longer drain the shield during Wave 1/2/Blitz challenges (only landed bombs do), matching normal play where a wrong answer simply doesn't clear.
- On reload, each operation resumes at the level after its highest cleared boss, so temporarily lowering the level selector (e.g. to replay a cleared level) no longer strands you at the lower level next session.
- When an operation reaches mastery, a one-time non-modal toast offers to start the boss (with a Start Boss button), so you don't have to hunt for the pulsing Mastered control.
- Dropped the bottom-left boss HUD from view; stage progress now lives only in the header readout. During Wave 1 the header shows the live speed (Wave 1 ramps speed), Wave 2 shows the current load, and the Worksheet shows problems cleared.
- Show the operation's accuracy grid automatically after a full boss victory, so a clear ends on a recap of what was mastered.
- Auto-target factor problems during boss mode too (ship nodes and falling bombs), with the targeted node highlighted and showing what is left to factor; stepwise and full `2^2*3`+Enter both work.
- Shifted prime-factoring difficulty up by one (level 1 of just {6} was too easy): a level now holds every composite of difficulty ≤ level + 1, so level 1 is {4, 6, 10, 15}.
- Switching to an operation from another set now also clears any on-screen drops of the now-disabled operations, since operations from different sets are not mixed.
- Challenge replay buttons (Blitz/Wave/Worksheet) on an operation card now appear when the selected level has been unlocked, so advancing to a new level no longer plasters its card with previous-level challenge stats.
- The header "Cleared" readout now shows live stage progress during boss play — Wave 1 / Wave 2 solved count (plus Wave 2's current load) and Worksheet cleared/total plus elapsed time — then reverts to the session Cleared count when the boss ends.
- Fixed version stamping: `scripts/stamp-version.sh` now bumps the visible version, the `index.html` cache-busters, and `package.json` together (instead of editing a `const VERSION` line that no longer exists), and the `.githooks/pre-commit` hook now stages `index.html` + `package.json` so each commit auto-bumps the patch and cache-busters. `npm run stamp 0.4.0` sets an explicit version.
- Redesigned prime-factoring difficulty to come from a number's structure: difficulty(n) = primeIndex(largest prime factor) + max exponent + (# primes with exponent > 1) + Ω(n) − 4, with each level holding every composite of difficulty ≤ level (cumulative; L1 = {6}). Mastery and the universe now follow that ladder instead of a raw number range.
- Auto-target the most urgent factor drop when factoring is the only operation in play, so you can step through factors or type the full 2^2*3 + Enter without pressing Tab first.
- Redesigned factors-of-10 difficulty to be structural instead of number-specific: a problem "type" is (significant digits, power of 10, ×/÷) with difficulty = digits + power − 1, the concrete number is random, and mastery accrues per type. A level holds every type with digits + power − 1 ≤ level (cumulative), so the universe is small (2 types at L1, up to 32) instead of one entry per number.
- Extended the Shapes operation with 3D shapes: L5 cube, L6 rectangular prism, L7 cylinder, L8 sphere (surface area & volume; cylinder/sphere answer as the π coefficient). Non-clean dimension combinations (e.g. most sphere volumes) are filtered out so every answer is an integer or a half; levels 9–10 reuse the full L8 set.
- Merged the separate rectangle and circle operations into one level-gated Shapes operation focused on formulas with small numbers: L1 square, L2 rectangle, L3 triangle, L4 circle (each adds perimeter/area, circle answers as the π coefficient), cumulative per level. Legacy rect/circ profile stats are dropped on load.
- Grouped operations into compatible sets (arithmetic +−×÷ and ×10 together; Shapes; SI; Factoring), so turning on an op from another set turns off the incompatible ones — reducing answer collisions and mixed-input confusion.
- Results now shows challenge bests per cleared level instead of only the highest cleared level: each level shows its own best (or a stronger equal-or-higher level's), never-played levels show nothing, and a worse higher-level run no longer hides a better earlier-level score.
- Raised the Wave 2 maximum simultaneous load from 10 to 25 now that the round only steps up after each batch is fully cleared.
- Redesigned the final mothership as a Worksheet/fact sheet: it now draws from the whole current-level problem universe split across the four ship parts, so clearing it means working through every problem type like a math worksheet.
- Boss nodes now reveal in small capped batches (at most 6 visible at once) and never reveal two answers that collide, so a typed answer can no longer clear the wrong node (no false positives).
- Empty trailing ship parts (when a level's universe is smaller than the part count, e.g. low-level SI/factor) now auto-collapse so the boss can always be completed.
- Scored Wave 1 (and standalone Blitz) on the number of problems solved, matching Wave 2; relabeled HUD, Results, and end-of-run summaries to "solved".
- Changed Wave 2 to clear-gated rounds: it presents N problems, waits until the whole batch is cleared, then steps up to N+1, instead of ramping the simultaneous load on a timer/score.
- Added an on-ship shield + solved counter near the player base during Wave 1/Wave 2 so the live shield and solved count are visible without reading the corner HUD.
- Challenge bombs now appear just inside the top edge so they are readable and answerable immediately.

## 2026-06-13
- Moved the boss HUD from the top-left to the bottom-left and made it fade quieter/sooner so it no longer covers falling problems and bombs.
- Drew boss-ship problem nodes in a second pass on top of all part bodies so an overlapping part box can no longer hide a problem's text.
- Changed the Wave 2 challenge score to a plain count of problems solved (and relabeled the HUD/Results/summary text accordingly) instead of the load-weighted formula, which was unclear.
- Fixed the mobile layout so the bottom keypad is no longer hidden behind the browser address bar: the app height is now driven from `visualViewport` (with `dvh`/`vh` fallbacks) and resynced on viewport resize and orientation change.

## 2026-06-12
- Changed falling-drop and stats-grid colors so hue reflects accuracy, while opacity reflects number of attempts; unseen problems remain black and one correct attempt is faint green.
- Split Wave 1 and Wave 2 pressure semantics: Wave 1 ramps speed with fixed load, while Wave 2 ramps load at a fixed readable speed.
- Made the boss HUD compact and fading so it announces changes briefly, then becomes a low-opacity corner status instead of covering the top of the playfield.
- Removed the large "shielded" labels from locked mothership parts so they no longer obscure the ship/problem area.
- Redesigned boss mode into Wave 1 shield endurance, Wave 2 load ladder, and a final mothership fight with Shields, Guns, Wings, and Core parts.
- Added separate persisted challenge records for Blitz score, Wave score, and Boss time; replay buttons unlock after a level boss clear and do not advance content level.
- Made full boss-mode challenge problems excluded from ordinary mastery stats, while final mothership victory remains the only path that advances the operation level.
- Added a light pulsing state for Mastered controls when an operation is boss-ready but the current level boss has not been beaten yet.
- Tightened the falling-drop/stats-grid visual palette so color and opacity reflect learning evidence instead of showing unseen and lightly seen problems the same way.
- Renamed the visible Boss readiness percentage to Mastered, added a real stats-grid hover tooltip, and hardened the visible Blitz button click path.
- Excluded Boss, Blitz, and Wave problem answers/misses from ordinary mastery stats and the session Cleared counter.
- Changed Mastered % to the percentage of current-level problems with at least 3 attempts and at least 90% current accuracy, and locked boss starts until that value reaches the configured boss threshold.
- Added recent-weighted current accuracy so old misses fade over time while lifetime accuracy still contributes to mastery.
- Increased practice weighting for unmastered, low-accuracy, and under-attempted problems so weak spots appear more often, using the profile's current-weighted mastery when available.
- Added hover/tap title details to stats-grid cells and softened impossible typed input so it no longer penalizes every visible drop.
- Added a Spacebar Breather note to the input hint and a Login-menu button to clear the current player's saved practice stats.
- Clarified challenge labels and summaries so Blitz/Wave/Boss results show the level they apply to.
- Changed Blitz from a one-hit shield failure into shield endurance: correct Blitz bombs add +1 shield, wrong attempts or landed bombs subtract -5, and shield collapse records the score.
- Added a visible Blitz shield around the player base whose thickness/brightness reflects current shield strength.
- Restored explicit Speed (0-100%) and Drops (0-10) controls for ordinary practice, replacing the single visible Pressure selector while keeping derived pressure metadata for saved progress compatibility.
- Boss attempts now lock the Speed/Drops snapshot at start and disable those controls during the attempt so mid-boss changes cannot alter credited settings.
- Added Blitz mode after a level boss clear as a standalone shield-endurance challenge.
- Blitz attempts and best scores are stored per operation/level in the local profile and shown in Results/level controls without advancing content level.
- Results now focuses on readiness, practice suggestions, and challenge unlock/best status instead of a visible pressure-clear ladder.

## 2026-06-11
- Added a visible Grid hint to operation level cards and a stats-popup note explaining that grid colors match falling-drop colors.
- Falling drops now use the same per-problem accuracy palette as the stats popup, giving live visual feedback for untested, weak, and mastered problems.
- Added a Spacebar Breather mode for ordinary practice: current visible drops stop moving, new drops stop spawning, and play resumes automatically after the board is cleared.
- Renamed the boss prelude from generic Wave 1/Wave 2 language to guard-screen messaging to clarify its purpose as a current-level retrieval check before the boss ship.
- Destroyed boss parts now fall away as damaged fading debris instead of simply disappearing.
- Replaced separate Speed and Rate controls with one Pressure selector (`Calm`, `Steady`, `Quick`, `Blitz`) that combines fall speed, spawn rate, active-drop cap, and boss pressure.
- Boss mode now locks the selected Pressure recipe at attempt start, so changing pressure mid-boss cannot change the credited tier.
- Boss clears now cascade downward: clearing a higher pressure records lower pressure tiers for that content level and lower content levels.
- Results now show per-operation pressure clear badges, and Boss readiness controls include the current pressure tier.
- Progress events now store pressure tier plus raw speed/rate values and aggregate pressure-tier practice stats at skill and problem level for future reporting/backend sync.
- Made Pause non-modal: it stops gameplay without covering the playfield, so settings and Results remain accessible.
- Removed the Pace slider from desktop/mobile controls; pressure now owns both speed and rate behavior.
- Expanded boss waves and changed them from simultaneous rows into staggered randomized problem arrivals.
- Boss waves now avoid duplicate answers among currently active wave drops, while boss ship nodes try to avoid repeating the exact same problem.
- Reworked the boss ship visuals so each part contains multiple problem nodes and is destroyed only once all of its nodes are solved.
- Added browser test coverage for multi-node boss parts staying alive until all nodes on that part are solved.
- Added an opt-in boss mode from each operation's readiness control: two announced problem waves lead into a multi-part boss ship.
- Boss ship parts now contain current-level problems; destroying the core records a boss clear and advances that operation to the next level.
- Added fast problem bombs from active boss cannons. Solving bombs clears them; landed bombs briefly stun input without cascading further damage.
- Added a compact boss HUD, browser test coverage for boss start/victory/stun behavior, and docs for the new boss-mode architecture.

## 2026-06-10
- Added a backend-shaped local player profile in `src/player-progress.js` with localStorage persistence, per-operation readiness, per-problem outcome history, and boss-readiness recommendation flags.
- Added a Results popup for current learning progress, including overall readiness, per-operation readiness, attempts, accuracy, recent accuracy, response time, and weak-practice suggestions.
- Wired correct, wrong, missed, and helped outcomes into the local profile while preserving the existing visible score as a simple correct-answer counter.
- Tightened readiness scoring so boss recommendations are based on the full current level universe, repeated per-problem mastery, coverage, recent accuracy, and fluency instead of small recent samples.
- Renamed the visible session counter to Cleared and added per-operation readiness indicators to the level controls.
- Updated Results practice suggestions to blend weak seen problems with unseen level problems, labeling unseen suggestions as new instead of showing a mastery percentage.
- Changed new profiles to start every operation at level 1, load saved current levels from the profile at startup, and require a temporary Ready click before advancing to the next level.
- Added a Login popup for creating and switching named local profiles in localStorage, with old single-profile default data migrated as `david`.
- Added unit tests for the player progress profile and browser tests for desktop/mobile Results and Login entry points.
- Updated documentation for the new local profile/readiness architecture.

## 2026-06-09
- Added a dev-only automated test suite: Node unit tests for core game rules and Playwright browser tests for desktop/mobile gameplay flows.
- Added `src/game-core.js` and moved DOM-free math/problem behavior there so browser code and unit tests share the same implementation.
- Kept browser loading as classic scripts so opening `index.html` directly from disk still works.
- Added a gated `?test=1` browser test API for deterministic Playwright setup and assertions.
- Added GitHub Actions test CI separate from the existing GitHub Pages deploy workflow.
- Fixed targeted prime-factor mode so typed divisors do not auto-complete a final prime unless the user enters it explicitly.
- Fixed completed targeted factor drops so pressing Enter clears the drop and increments score.
- Added a browser regression test for the direct `file://` `index.html` workflow.
- Switched the GoatCounter loader to an explicit `https://` URL to avoid invalid local-file script URLs.
- Updated AI docs for the current operation set, touch keypad, stats popup, test commands, and codebase review findings.

## 2026-03-26
- Major rewrite: stripped ELO rating system, boss battles (ship/flood), lives, session timer, starting level, game over screen, and setup overlay.
- Game now auto-starts on page load with no configuration screen.
- Added in-game operation toggle chits (+, −, ×, ÷, x10) — click to enable/disable during gameplay.
- Added per-operation difficulty controls (1-10) adjustable during gameplay via +/− buttons.
- Added global speed slider (0-100) controlling drop fall speed and spawn rate; speed 0 freezes the game.
- Simplified scoring to a plain counter (correct answers only).
- Removed side panel, ELO board, progress bars, and gun/laser visuals.
- Modernized UI: refined dark theme, controls bar above canvas, cleaner layout, backdrop blur on pause overlay, focus ring on input, pill-shaped op toggles.
- Reduced script.js from ~1915 lines to ~860 lines.
- Updated all documentation to match new architecture.

## 2026-02-26
- Added a new operation type: Factors of 10 (`f10`) for decimal shifting problems (multiply/divide by 10, 100, 1000).
- Added the setup checkbox for Factors of 10.
- Switched answer input `inputmode` to `decimal` to make decimal entry easier on mobile keyboards.
- Reduced initial speed for the Factors of 10 operation so drops spawn and fall slower at the start.
- Removed the previous speed floor behavior so repeated misses can keep slowing drop speed toward zero.
- Lowered starting range from 4 to 2.
- Added a dynamic active-drop cap so early gameplay starts with fewer simultaneous drops and scales up with speed.
- Added optional session timer settings (2/5/10 minutes) with a live HUD countdown.
- Added results-email capture at game start and a timed-session completion flow that opens an email draft with the session summary.
- Fixed decimal input matching/prefix validation to avoid false wrong-input resets while typing values like `0.00...` for factors-of-10 problems.

## 2026-02-04
- Loaded Space Grotesk font via Google Fonts (was referenced but never loaded).
- Cached canvas dimensions to avoid layout recalculation every frame.
- Batched ELO board updates and switched to persistent DOM elements (no more innerHTML rebuild per frame).
- Added Escape key to toggle pause during gameplay.
- Added miss feedback: descending sawtooth sound and red ground flash when drops hit bottom.
- Added visual glow highlight on drops whose answer matches the current input.
- Added localStorage persistence: progress saves on level-up, Resume button on setup screen.
- Added optional lives mechanic (None/3/5) with game-over overlay and Play Again button.
- Replaced boss music setInterval with Web Audio API lookahead scheduling for drift-free playback.
- Auto-focus answer input after boss victory.
- Replaced drop ID generation with incrementing counter.
## 2026-02-06
- Pausing or returning to the setup screen now freezes answer clearing and game state.
- Resume now restores saved lives count.
- Added a pause overlay and disabled answer input while paused.
- ELO now updates on a rolling 30s window using time-to-clear and input churn signals.
- Prevented duplicate answers from appearing on screen at the same time.
- Invalid inputs that cannot complete any on-screen answer now count as wrong attempts and clear the input.
- Wrong answers now backslide per-operation progress.
- Version now displays a date/time stamp.
- Added a pre-commit hook to auto-stamp the version on each commit.
- Added a miss sound for wrong answer inputs (enter or impossible prefix).
- Wrong input now uses a distinct sound from drops hitting the ground.
- Added alternating ship boss battles with hull, wings, and guns plus stun shots.
- Updated architecture/purpose docs for ship boss and rolling ELO.
- Fixed version stamping script to update reliably.
- Added Boss Now (ship) and Flood Now (drop swarm) buttons to trigger boss battles early.
- Ship bosses now have a single pool of problems that must all be cleared, and they keep firing faster missiles while alive.
- Stun no longer blurs the input, and a post-stun refocus keeps typing smooth.
- Escape/Backspace now clear the full input entry.
- Restart preserves ELO instead of resetting it.
- Increased raindrop text size/contrast for readability.

## 2026-02-03
- Initial playable Rain Math game built (HTML/CSS/JS single-page app).
- Startup settings overlay: choose starting level, operations, and number range (1-12).
- Gameplay: falling drops, type-to-clear without pressing Enter, progressive difficulty.
- Division uses the selected range as the maximum quotient.
- Replaced lives with per-operation ratings:
  - Drop rate controls drop speed and spawn rate per operation.
  - Accuracy controls number range per operation.
  - Overall rating shown top-right computed from drop rate + accuracy.
- Added per-operation ratings panel in the UI.
- Per-operation panel now shows average drop rate instead of speed rating.
- Each raindrop now varies more in speed around the mean.
- Enter clears the answer box.
- Raindrops are drawn as line-style drops.
- Added synthesized pop sounds on correct answers.
- Added a visible version stamp in the HUD for cache verification.
- Added boss battles before level-ups with increased drop rate.
- Boss drops are tinted and have dedicated boss and victory music.
- Tuned boss intensity and capped spawn bursts to reduce overwhelm.
- Enter now checks the answer before clearing the input.
- Added a short pre-boss lull in drops.
- Slowed level advancement to require more clears per level.
- Boss battles now require clearing all active boss drops to finish.
- Added splash effects on correct answers.
- Removed manual range selection; range now grows with progression and accuracy.
- Correct answers now clear all drops with the same answer value.
- Added a laser gun effect targeting solved drops.
- Added overall and per-operation progress bars plus current range display.
- Boss battles now stop spawning once the clear target is reached.
- Progress UI moved to a right-side panel for better visibility.
- Spawn positions now respect the canvas width to avoid off-screen drops.
- Progress bars now show boss progress during boss fights and do not reset per-op progress each level.
- Progression is now per-operation: each op has its own level, range, and boss battle (no overall level/range).

## Notes
- Keep entries concise and focused on player-facing or structural changes.
