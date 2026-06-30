# Feature: Rounding & Estimation operation

Status: v1 landed; **grid revision agreed — ready for implementation** (see "Revision" below)
Owner: Codex (planned by Claude; Claude to review)
Last Updated: 2026-06-30
Related Commits: v1 ea8bb27; revision (pending)

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

---

## Revision (2026-06-30): case-based grid — supersedes the band×place grid above

David's feedback after v1 shipped: the **rounding decision is the real concept**, and the
input-size-vs-place **relationship** is *also* conceptual, not just difficulty (e.g.
`7 ≈ 100` — "closer to 0 or 100?" — is genuinely hard; `472 ≈ 10` means ignoring noise
digits). The v1 `band × place` grid blurred these. New model:

### Model
- **Grid cell = the rounding CASE** (the decision). Let remainder `r = value mod place`,
  `0 ≤ r < place`:
  - `down` — `0 < r < place/2` → rounds down (`73 ≈ 10 → 70`)
  - `up` — `place/2 < r < place` → rounds up (`78 ≈ 10 → 80`)
  - `half` — `r == place/2` → rounds up by the half-up rule (`75 ≈ 10 → 80`)
  - `zero` (already-there) — `r == 0` → unchanged (`70 ≈ 10 → 70`)
  - `carry` — an `up` whose result gains a digit (`497 ≈ 10 → 500`, `9.97 ≈ 0.1 → 10`)
- **Level = place + size-relationship.** Magnitude becomes the *level*, not a cell.
  `relationship ∈ { normal (number has kept digits above the place), crossing (number
  smaller than the place → rounds to 0 or one whole place-unit) }`.
- **Prune degenerate cells:** no `zero` on crossing levels (only 0); drop single-number
  cells (e.g. the lone `5` half at 1-digit→ten — that case is taught at the 2-digit level
  where it varies: 15, 25, 35…).

### The 10-level ladder
| Lvl | Place | Size / relationship | Cells (cases) | # |
|----|----|----|----|----|
| 1 | ten | normal, 2-digit (easy opener) | down · up · half · zero | 4 |
| 2 | ten | bigger 3–4 digit + carry | down · up · half · zero · carry | 5 |
| 3 | ten | crossing, 1-digit (7→10, 3→0) | down(→0) · up(→10) | 2 |
| 4 | hundred | normal, 3–4 digit | down · up · half · zero | 4 |
| 5 | hundred crossing + thousand (capstone) | small→100 (47→0, 62→100) & 4–5 digit→1000 | cross: down(→0)·up(→100)·half · thousand: down·up·half·zero·carry | 8 |
| 6 | tenth | normal, `X.dd` | down · up · half · zero | 4 |
| 7 | tenth | bigger / extra-decimal + carry (9.97→10.0) | down · up · half · carry | 4 |
| 8 | hundredth | normal, `X.ddd` | down · up · half · zero | 4 |
| 9 | tenth & hundredth | crossing-to-zero (0.04→0.0, 0.06→0.1) | each place: down(→0) · up · half | 6 |
| 10 | thousandth + mixed (capstone) | `X.dddd` + review tenth/hundredth | down · up · half · zero · carry (+ mixed) | 8 |

Difficulty is intentionally **non-monotonic in digit count**: 2-digit→ten is the gentle
opener; the hard "crossing" cases (1-digit→ten, small→hundred) come later (L3, L5). No level
exceeds ~8 cells; the **capstones L5/L10** mix prior places so those bosses feel substantial.

### Generation
- `statsKey` encodes `(place, relationship, case)`, e.g. `r:ten:norm:up`,
  `r:hundred:cross:down`, `r:thousand:norm:carry`, `r:tenth:norm:half`. (Pick a clean, stable
  scheme; it just has to round-trip and be unique per cell.)
- A level descriptor lists its cells (place, relationship, case) + the digit-size range to
  sample within. `makeRoundProblemFromKey` constructs a number `v` satisfying **all three**:
  the right magnitude vs place (normal = has kept digits above the place; crossing = `v < place`),
  and `v mod place` in the case's range (`0` for zero; `(0, p/2)` down; `= p/2` half;
  `(p/2, p)` up; carry = an up where rounding gains a digit). Decimal levels: input carries
  one more decimal place than the target (extra-decimal "harder" levels carry two).
- `roundToPlace` is **unchanged** (already decimal-safe half-up). The capstones sample their
  mixed cells across the listed places.

### Implementation delta vs v1
- Replace the v1 `roundTypesForLevel` / band-based bucket descriptors with the
  case-based level descriptors above; keep `getRoundUniverse` / `makeRoundProblem(FromKey)` /
  `generateRoundProblem` signatures and the game-core ↔ player-progress wiring (universe
  routing, stats list, chit, generation) — only the *bucket definition + sampler* change.
- `roundTypeLabel` → a case-aware label, e.g. "nearest 100 · round up", "nearest 10 ·
  crosses to 0/10", so the grid/stats list reads as concepts.
- Update the v1 unit tests (cell counts were `[2,3,3,6,11,2,3,4,6,9]`; new counts are
  `[4,5,2,4,8,4,4,4,6,8]`) and add tests per below.

### Updated acceptance criteria
- Each level's grid shows its **case** cells (down/up/half/zero/carry as applicable), not
  band buckets; per-level counts match `[4,5,2,4,8,4,4,4,6,8]`.
- The sampler can **always** construct a valid number for every cell (esp. carry and
  crossing) — no empty/degenerate cells slip through.
- Spawned problems for a cell always fall in that cell's case (e.g. a `half` cell's number
  has `r == place/2`; a `carry` cell's rounded answer has more digits than its input's place
  group). Everything else (immediate clear, numeric-equal answers, own lane) unchanged.

### Updated testing
- **Unit:** per-cell sampler correctness — for each `(place, relationship, case)`, the sampled
  `v` satisfies the case predicate and `roundToPlace(v, place)` matches the expected direction
  (incl. carry gains a digit, crossing rounds to 0 or one unit); new per-level cell counts;
  degenerate-cell pruning (no `zero` on crossing; no single-number cells).
- **E2E:** unchanged in spirit — own-lane toggle, a sampled rounding drop clears on the typed
  answer, the stats list renders the case cells.

### Sanity-check flag for review
The one risk is the **sampler failing to construct a valid number** for a tight cell
(e.g. carry at a small band, or `half` where `place/2` isn't representable at the input
granularity). Codex: guarantee every listed cell is constructible (and unit-test it); I'll
verify each cell yields valid, in-case problems during review.
