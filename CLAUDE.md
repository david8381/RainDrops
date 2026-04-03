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
- **`index.html`** — markup: header, controls bar (op toggles, difficulty, speed), game canvas, input bar
- **`styles.css`** — dark theme with CSS variables, responsive layout
- **`script.js`** — all game logic (~860 lines): game loop, drop physics, input handling, audio synthesis

### Key Data Structures (in `script.js`)
- `drops[]` — active falling drops: `{ id, x, y, speed, text, answer, answerText, opKey }`
- `opConfig` — per-operation config: `{ enabled, difficulty, symbol, label }`
- `gameSpeed` — global speed (0-100) controlling fall speed and spawn rate
- `score` — simple correct-answer counter

### Core Mechanics
- Answers clear on keypress (no Enter key needed) — first matching drop is cleared
- Each operation has an independent difficulty (1-10) controlling number range
- Speed slider (0-100) controls spawn rate and fall speed globally
- Operations can be toggled on/off during gameplay via chit buttons
- Audio uses Web Audio API (synthesized pop, miss, wrong-input sounds)

## Working Rules

- Prefer simple, readable JavaScript over additional tooling
- Do not rename the `docs/Ai` folder
- Add a changelog entry in `docs/Ai/CHANGELOG.md` for any player-facing or architectural change
- Keep documentation in sync with behavioral changes
- If adding new operations, update `opConfig`, `operators` (or add a generator), and the toggle chits in `index.html`
- Git: push to `main` branch, GitHub SSH user `david8381`, repo `RainDrops`
