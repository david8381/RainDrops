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
- Each operation has an independent difficulty level from 1-10, starting at level 1 for new profiles.
- Current levels are stored in the local profile; increasing to the next level requires clicking Ready for the current level. Ready is a temporary stand-in for a future boss attempt.
- Global controls include Speed, Rate, and Pace.
- The header shows a session-only Cleared counter for correct drops cleared during the current run.
- The Login link opens a local player selector where players can create or switch named profiles stored in localStorage.
- A local profile tracks per-operation readiness, per-problem outcomes, and boss-readiness recommendations in localStorage.
- Existing single-profile localStorage data is migrated into the local profile selector as `david` when it still has the old default player identity.
- Readiness is universe-aware: it considers how many level problems exist, how many have been seen/mastered, recent accuracy, and fluency.
- Readiness is visible on per-operation level controls; broader learning progress is shown through the Results popup.
- Results practice suggestions blend weak seen problems for review with unseen level problems for coverage.
- Problem accuracy is shown through per-operation stats popups.
- Touch devices use an on-screen keypad and compact controls.
- Feedback opens a FormSubmit-backed feedback form.

## Non-Goals
- No boss battles, lives, timers, ELO rating, backend sync, or build pipeline for production.
- Login is currently local profile selection only; it is not authentication.
- Tests and Playwright are dev-only tooling; the deployed game remains static.

## Repo Access
- GitHub SSH user: `david8381`
- Repo: `RainDrops`
- Default branch for pushes: `main`
