# Architecture

## Overview
This is a standalone, static web game. There is no build step and no external dependencies.

## Files
- `index.html`: Markup and layout for the game — header, controls bar, canvas, and input bar.
- `styles.css`: Visual design, layout, and responsive behavior.
- `script.js`: Game loop, input handling, drop generation, audio, and UI controls.

## Runtime Flow
1. The game auto-starts on page load. No setup overlay.
2. The animation loop runs via `requestAnimationFrame`.
3. Drops are spawned on a timer controlled by the global speed setting.
4. Typing an answer clears a matching drop immediately (no Enter key).
5. The user adjusts operations, difficulty, and speed during gameplay via in-game controls.

## Data Model (in `script.js`)
- `drops[]`: active drops with `{ id, x, y, speed, text, answer, answerText, opKey }`.
- `opConfig`: per-operation configuration: `{ enabled, difficulty, symbol, label }`.
- `gameSpeed`: global speed 0-100 controlling fall speed and spawn interval.
- `score`: simple counter of correct answers.
- `splashes[]`: particle effects from cleared drops.

## Controls
- **Operation chits**: pill-shaped toggles at the top to enable/disable each operation type during play. At least one must remain enabled.
- **Difficulty**: per-operation 1-10 setting with +/− buttons. Higher difficulty increases the number range for that operation.
- **Speed slider**: 0 (frozen) to 100 (fast). Controls both drop fall speed and spawn interval.
- **Pause**: Escape key or Pause button. Shows a blurred overlay.
- **Restart**: resets score and drops, keeps current settings.

## Extensibility Notes
- If adding new operations, add an entry to `opConfig`, `operators` (or a dedicated generator), and a toggle chit in `index.html`.
- The factors-of-10 operation (`f10`) uses a dedicated generator for decimal shift problems.
- Difficulty mapping is in `getDifficultyRange()` — add a branch for new operation types.
