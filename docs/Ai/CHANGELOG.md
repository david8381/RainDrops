# Changelog

## Purpose
This file records meaningful project changes so future collaborators (including AI agents) can quickly understand what changed, when, and why without rereading every file.

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
