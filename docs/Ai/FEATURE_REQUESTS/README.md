# Feature Requests

Tracked design docs — one file per meaningful feature or request. This folder is
**committed**, so a feature's request, design, decisions, and outcome survive a
fresh clone and are visible to any agent or human. (The `DIALOGUE.md` agent channel
is gitignored and short-lived — use it only to coordinate turns, not to hold design.)

## How docs relate
- **Feature file (here)** — the *why and how we decided* for one feature: request,
  design, open questions, acceptance criteria, outcome. A living doc; its `Status`
  evolves over the feature's life.
- **`CHANGELOG.md`** — the chronological *what changed* (one entry per change).
- **`ARCHITECTURE.md` / `PURPOSE.md`** — the enduring structure and product intent.
- **`DIALOGUE.md`** (gitignored) — terse coordination only: "claimed X", "landed X
  in commit abc123", "see feature file Y".

## When to create one
Anything bigger than a small bug/doc fix, or any decision worth recording (a
pedagogical choice, a non-obvious trade-off, a deferred idea). A one-line tweak just
needs a `CHANGELOG` entry — don't add bureaucracy for trivial changes.

## Workflow
1. Before implementing a non-trivial feature, create/update its file here
   (`Status: proposed` or `agreed`).
2. Keep substantive design discussion in the feature file, not `DIALOGUE.md`.
3. Use `DIALOGUE.md` only to coordinate ("claimed", "please review", "landed in X").
4. On landing, fill in `## Outcome`, set `Status: landed`, and add the `CHANGELOG`
   entry.
5. Don't migrate old `DIALOGUE.md` history wholesale — pull a detail forward only if
   it's still relevant.

## Naming
Kebab-case slug describing the feature: `answer-space-aware-overload.md`,
`portable-key-backup.md`. No date prefix — these are living docs (the date lives in
`Last Updated` / `Related Commits`).

## Index
Keep this list current (newest meaningful first):
- `rounding-and-estimation.md` — Status: landed — `≈` Rounding/estimation (case-based grid: cells=cases, levels=place+size).
- `boss-mode-control-legibility.md` — Status: landed — make silently-gated boss/challenge controls show their locked state + reason (touch-friendly).
- `session-continuity-and-finish.md` — Status: landed — one report per sitting (resume recent session) + a "Finish" share-the-report control.
- `richer-report-and-compact-share-link.md` — Status: landed — clearer session reports and shorter parent share links.
- `answer-space-aware-overload.md` — Status: landed — guessability-weighted cannon overload.

---

## Template

```md
# Feature: Short Name

Status: proposed | agreed | claimed | in-progress | landed | deferred
Owner: Codex | Claude | shared | unclaimed
Last Updated: YYYY-MM-DD
Related Commits: <hashes>

## User Request
Original user-facing request/context, lightly cleaned up.

## Goal
What player/parent/dev problem this solves.

## Design
Current agreed design. Include pedagogical reasoning when relevant.

## Open Questions
Specific unresolved decisions.

## Implementation Notes
Important code areas, constraints, migration notes, collision warnings.

## Acceptance Criteria
Concrete behavior that should be true when done.

## Testing
Unit / e2e / manual test expectations.

## Outcome
Filled in when landed: commit, behavior summary, known follow-ups.
```
