# Architecture

## Overview
This is a standalone, static web game. There is no build step and no external dependencies.

## Files
- `index.html`: Markup and layout for the game, including the setup overlay and stats.
- `styles.css`: Visual design, layout, and responsive behavior.
- `script.js`: Game loop, input handling, drop generation, and rating logic.

## Runtime Flow
1. The user chooses settings in the overlay and starts the game.
2. The animation loop runs via `requestAnimationFrame`.
3. Drops are spawned on a timer, fall based on per-op drop rate, and are rendered on a canvas.
4. Typing an answer clears a matching drop immediately (no Enter key).
5. Correct/miss events update per-operation drop rate and accuracy.
6. Drop rate drives spawn rate and fall speed; per-operation progression and accuracy drive number range.
7. Boss battles are triggered per operation when that operation hits its progress gate, alternating between drop bosses and ship bosses.
8. The overall rating is computed from average drop rate and accuracy and shown in the HUD.

## Data Model (in `script.js`)
- `drops`: active drops with `{ id, x, y, speed, text, answer, opKey, isBoss }`.
- `settings`: chosen ops and starting level.
- `opElo`: per-op ratings: `{ speed, accuracy, events }` used to derive drop rate.
- `opState`: per-op progression state: `{ level, progress, pendingProgress, bossActive, bossCleared, bossTarget, bossSpawnLocked, bossQueued, preBossBreakMs, bossTypeToggle, bossType }`.
- `lives`: optional lives counter (null when disabled).
- `shipState`: active ship boss with a pool of problems, shot timer, and missile firing.
- `stunnedUntil`: timestamp for temporary input disable when the ship fires.

## Extensibility Notes
- If adding new operations, update `opLabels` and the setup UI, then either add a normal entry in `operators` or a dedicated generator branch in `generateProblem`.
- The factors-of-10 operation (`f10`) uses a dedicated generator that creates decimal shift problems (multiply/divide by 10, 100, 1000).
- Keep changes in `script.js` isolated to the rating helpers for predictability.
