# Changelog

## Purpose
This file records meaningful project changes so future collaborators (including AI agents) can quickly understand what changed, when, and why without rereading every file.

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
- Added a Boss Now button to trigger the next boss battle early.

## 2026-02-03
- Initial playable Math Rain game built (HTML/CSS/JS single-page app).
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
