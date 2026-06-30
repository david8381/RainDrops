# Feature: Rounding & Estimation operation

Status: landed
Owner: Codex (planned by Claude; reviewed by Claude)
Last Updated: 2026-06-30
Related Commits: (this commit)

## User Request
Add a foundational elementary skill the game lacks: **rounding / estimation**. David
specified the 10-level ladder and asked that the mastery grid be sized by *complexity*
(kinds of problem) rather than by every individual number — explicitly modeled on how the
×10 operation defines its universe.

## Goal
A new `round` operation that teaches rounding integers and decimals to a target place,
with a level ladder from "nearest ten, small numbers" up to "nearest thousandth." Answers
are typed numbers that clear immediately, like arithmetic.

## Design

### The grid / universe model (the key decision)
Follow the **×10 pattern**, not the Powers pattern. `getF10Universe` returns one cell per
*conversion type* and `makeF10ProblemFromKey` samples a random number into that type at
spawn; mastery is tracked per type. Powers instead enumerates every literal problem, which
only works because its operands are tiny (2–12) — that would explode for rounding.

So: **one grid cell = one complexity bucket = `(input size-band) × (target place)`.** The
actual number is randomized within the bucket each spawn. "Round *some* 3-digit number to
the nearest hundred" is one cell, regardless of which 3-digit number falls.

**Prune degenerate buckets:** keep a bucket only if its largest possible number can reach
**half the target place** (so there's a real round-up/round-down decision). This drops
non-problems like "1-digit → nearest hundred" (always 0) while keeping good entry cases
like "2-digit → nearest hundred" (closer to 0 or 100?). Rule: `maxValue(band) >= place/2`.

### Level ladder + resulting grid
Places: tens=10, hundreds=100, thousands=1000, tenths=0.1, hundredths=0.01,
thousandths=0.001. Integer bands = digit count of the integer; decimal bands = integer-part
digit count (the input carries one more decimal place than the target so the rounding digit
isn't trivially zero — e.g. target tenth → input has 2 decimals).

| Lvl | Target place(s) | Input bands (after pruning) | Cells |
|----|----|----|----|
| 1 | tens | 1–2 digit | 2 |
| 2 | tens | 1–3 digit | 3 |
| 3 | hundreds | 2–4 digit (1-digit pruned) | 3 |
| 4 | tens, hundreds | 2–4 digit | 6 |
| 5 | tens, hundreds, thousands | 2–5 digit (2-digit→thousand pruned) | 11 |
| 6 | tenths | 1–2 int digit | 2 |
| 7 | tenths (harder) | 2–4 int digit, +1 extra input decimal | 3 |
| 8 | tenths, hundredths | 1–2 int digit | 4 |
| 9 | tenths, hundredths (harder) | 2–4 int digit | 6 |
| 10 | tenths, hundredths, thousandths | 1–3 int digit | 9 |

Refinements vs the raw ladder David gave (confirmed):
- L3 starts at 2-digit (1-digit→hundred is always 0, pruned).
- L10 "thousand" = **thousandth** (decimal block).
- **"Harder" (L7/L9)** = bigger integer parts **and one extra decimal place in the input**,
  so the digit after the rounding position varies (e.g. `472.863 ≈ 0.1`).

### Presentation & answer
- **Drop text:** `<number> ≈ <unit>`, e.g. `47 ≈ 10` (→ `50`), `3.47 ≈ 0.1` (→ `3.5`),
  `3.476 ≈ 0.01` (→ `3.48`). The `≈` reads as "estimate / round to the nearest," and the
  unit is unambiguous across every place.
- **Chit symbol / label:** `≈`. **Display name:** "Rounding".
- **Answer rules:** round-half-up; positive numbers only; clears immediately (no Enter).
  Accept numerically-equal answers (`3.5` == `3.50`) — `parseNumericAnswer` already does, so
  no trailing-zero traps.
- **Own compatibility lane:** `OP_SETS.round = "round"` (standalone, like SI/Shapes/Powers),
  so a rounding drop never shares the board with `+`/`÷` drops of different answer semantics.

## Open Questions
- **Settled:** grid = complexity buckets (×10 pattern); prune always-0 cells; `≈ <unit>`
  notation; own lane; L10 = thousandths; "harder" = bigger int part + extra input decimal.
- Exact `statsKey` string format and chit tooltip copy — impl detail, pick something clear
  (suggestion below) and keep it consistent with the other ops.

## Implementation Notes
Mirror the ×10 / shapes / pow integration end-to-end.

**game-core.js (pure, unit-tested):**
- `roundToPlace(value, place)` — round-half-up, **decimal-safe**. Beware float error
  (`3.45/0.1` is `34.4999…`): scale to integers (or use an epsilon nudge) so `3.45 ≈ 0.1`
  → `3.5` and cascades (`96 ≈ 10` → `100`, `9.97 ≈ 0.1` → `10`) are correct.
- `roundTypesForLevel(level)` → array of bucket descriptors `{ statsKey, band, place }`
  per the table, with the prune rule applied. (Suggested `statsKey`: `r:2d:10`,
  `r:3d:100`, `r:2i:0.1`, `r:1i:0.01` — band + place.)
- `getRoundUniverse(level)` → `roundTypesForLevel(level).map(t => ({ statsKey, text }))`
  (matches `getF10Universe` shape used by the grid/boss).
- `makeRoundProblem(band, place, rng)` and `makeRoundProblemFromKey(statsKey, rng)` —
  sample a number to fit the band (b-digit integer in `[10^(b-1), 10^b-1]`; decimals =
  integer part of i digits + the right number of decimal places), compute the rounded
  answer, return `{ text: "<n> ≈ <unit>", answer, answerText, statsKey, opKey: "round" }`.
- Add `round` to `operationDefaults` (`symbol: "≈", label: "≈"`). Give `getDifficultyRange`
  a sensible `round` branch/guard if anything calls it (f10/shapes/pow precedent).

**script.js:**
- `generateProblem` / `generateWeightedProblem` route `opKey === "round"` to the new
  makers (mirror the f10/pow branches).
- `OP_SETS.round = "round"`; `opDisplayNames.round = "Rounding"`.
- No new control wiring beyond what every op gets (chit toggle, diff card, grid, boss/
  challenge buttons) — those are data-driven off `operationDefaults` + the universe helpers.

**index.html:** add the `.op-chit` button `data-op="round"` with `≈` and a `data-tip`
(e.g. "Rounding & estimation — round to the nearest unit / Example: 47 ≈ 10 → type 50 /
Example: 3.47 ≈ 0.1 → type 3.5").

**Docs/copy:** PURPOSE (operation list + the immediate-clear list), ARCHITECTURE (op
inventory if it enumerates), CHANGELOG, and the Tutorial copy in `src/text/english.js`
(it lists own-lane operations — add Rounding).

No profile schema change; the universe is computed, not stored.

## Acceptance Criteria
- A `≈` chit toggles a `round` operation in its own lane (enabling it disables incompatible
  ops, like the other standalone lanes).
- Rounding drops render as `<n> ≈ <unit>` and clear when the correct rounded number is typed
  (immediate, no Enter); numerically-equal forms accepted.
- The per-level grid shows the bucket cells from the table (not individual numbers), and
  mastery/boss/challenges work off that universe like ×10.
- Each level only presents its ladder's places/bands; degenerate "always 0" buckets absent.
- `roundToPlace` is correct for round-half-up, cascades, and decimal places (no float drift).

## Testing
- **Unit (game-core):** `roundToPlace` across tens/hundreds/thousands and
  tenths/hundredths/thousandths, including half-up (`45 ≈ 10` → 50, `3.45 ≈ 0.1` → 3.5) and
  cascades (`96 ≈ 10` → 100, `9.97 ≈ 0.1` → 10); `roundTypesForLevel` cell counts per the
  table + the prune rule (no always-0 buckets); `makeRoundProblemFromKey` returns a number
  whose correct answer matches `roundToPlace`, within the bucket's band.
- **E2E:** enable the `≈` chit (assert incompatible ops turn off); a spawned rounding drop
  clears on the correct typed answer; the grid/diff card renders for `round`.

## Outcome
Implemented by Codex on 2026-06-30:
- Added the `round` operation with `≈` chit, "Rounding" display name, and its own
  compatibility lane.
- Added pure core helpers for decimal-safe half-up rounding, per-level rounding bucket
  universes, and bucket-sampled problem generation. Stats keys distinguish normal and
  harder decimal buckets so mastery does not leak between different precision demands.
- Wired rounding into ordinary and weighted problem generation, profile universe sizing,
  mastery/readiness, boss/challenge fact-sheet support, stats labels, and the Grid popup.
- Updated Tutorial/PURPOSE/ARCHITECTURE/CHANGELOG plus unit/e2e coverage.
