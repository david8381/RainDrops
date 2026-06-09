# Purpose

## Project Goal
Build a fast, friendly math game where falling drops are cleared by typing answers. The game should feel responsive, playable immediately, and let the user control their own practice mix while the game is running.

## Design Principles
- No setup friction: the game loads directly into play.
- Fast input: ordinary numeric answers clear immediately; multi-step or symbolic answers use Enter only where needed.
- User-controlled pacing: operation types, per-operation difficulty, fall speed, spawn rate, and fall-time pace are adjustable during play.
- Clarity over complexity: production remains static HTML/CSS/browser JavaScript with no build step.
- Testable core behavior: math/problem rules live in DOM-free JavaScript so they can be covered by deterministic unit tests.

## Current Player-Facing Behavior
- Drops fall from the sky and clear when the correct answer is typed.
- Immediate-clear operations: add, subtract, multiply, divide, factors of 10, rectangle perimeter/area, and circle circumference/area coefficient answers.
- Enter-required operations: SI metric conversions such as `*1000` or `/100`, and full prime factorization answers such as `2^2*3`.
- Prime factor drops can also be targeted with Tab and simplified one factor at a time.
- Each operation can be toggled on/off during gameplay; if none are enabled, no new drops spawn.
- Each operation has an independent difficulty level from 1-10.
- Global controls include Speed, Rate, and Pace.
- Scoring is a simple correct-answer counter.
- Problem accuracy is tracked in-session and shown through per-operation stats popups.
- Touch devices use an on-screen keypad and compact controls.
- Feedback opens a FormSubmit-backed feedback form.

## Non-Goals
- No boss battles, lives, timers, ELO rating, login, persistence, or build pipeline for production.
- Tests and Playwright are dev-only tooling; the deployed game remains static.

## Repo Access
- GitHub SSH user: `david8381`
- Repo: `RainDrops`
- Default branch for pushes: `main`
