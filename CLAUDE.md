# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Math Rain — a browser-based math game where falling raindrops are cleared by typing correct answers. Built with vanilla HTML/CSS/JS, no frameworks or build tools.

## Running

Open `index.html` in a browser. No build step, no installs, no dependencies.

## Deployment

GitHub Pages via `.github/workflows/pages.yml`. Pushes to `main` auto-deploy.

## Documentation

Read these before making changes:
1. `docs/Ai/PURPOSE.md` — goals and design principles
2. `docs/Ai/ARCHITECTURE.md` — structure, runtime flow, data model
3. `docs/Ai/CHANGELOG.md` — recent changes (avoid rework)

## Architecture

Three files comprise the entire app:
- **`index.html`** — markup: game canvas, setup overlay, HUD, side panel
- **`styles.css`** — dark theme with CSS variables, responsive layout
- **`script.js`** — all game logic (~845 lines): game loop, drop physics, input handling, ELO rating system, audio synthesis, boss battles

### Key Data Structures (in `script.js`)
- `drops[]` — active falling drops: `{ id, x, y, speed, text, answer, opKey, isBoss }`
- `opElo` — per-operation ratings: `{ speed, correct, total }` driving spawn rate and fall speed
- `opState` — per-operation progression: `{ level, progress, bossActive, bossCleared, bossQueued, bossTarget, bossSpawnLocked, preBossBreakMs, pendingProgress }`
- `settings` — user-chosen operations and starting level

### Core Mechanics
- Answers clear on keypress (no Enter key needed) — first matching drop is cleared
- Each operation (add/subtract/multiply/divide) has independent ELO, level, range, and boss progression
- Speed ELO (400–2000) controls spawn rate (1700ms→500ms) and fall speed (30→100 px/sec)
- Number range grows with level and accuracy, capped at 12; division range means quotient range
- Boss battles trigger at level-step gates (18 clears), require clearing 8 boss drops
- Audio uses Web Audio API (synthesized pop, boss music, victory sounds)

## Working Rules

- Prefer simple, readable JavaScript over additional tooling
- Do not rename the `docs/Ai` folder
- Add a changelog entry in `docs/Ai/CHANGELOG.md` for any player-facing or architectural change
- Keep documentation in sync with behavioral changes
- If adding new operations, update `operators`, `opLabels`, and the setup UI in tandem
- Keep rating logic changes isolated to the rating helpers in `script.js`
- Git: push to `main` branch, GitHub SSH user `david8381`, repo `RainDrops`
