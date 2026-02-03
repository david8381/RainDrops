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
3. Drops are spawned on a timer, fall based on per-op speed rating, and are rendered on a canvas.
4. Typing an answer clears a matching drop immediately (no Enter key).
5. Correct/miss events update per-operation speed rating and accuracy.
6. Speed rating drives spawn rate and fall speed; accuracy drives number range.
7. The overall rating is computed from average speed and accuracy and shown in the HUD.

## Data Model (in `script.js`)
- `drops`: active drops with `{ id, x, y, speed, text, answer, opKey }`.
- `settings`: chosen ops and max range.
- `opElo`: per-op ratings: `{ speed, correct, total }`.

## Extensibility Notes
- If adding new operations, update `operators`, `opLabels`, and the setup UI.
- Keep changes in `script.js` isolated to the rating helpers for predictability.
