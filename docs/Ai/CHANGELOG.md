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

## Notes
- Keep entries concise and focused on player-facing or structural changes.
