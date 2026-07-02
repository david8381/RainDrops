# Feature: Simplify Fractions operation (½)

Status: landed
Owner: Codex (planned by Claude; reviewed by Claude)
Last Updated: 2026-07-01
Related Commits: (this commit)

## User Request
Add fraction simplification first — it's the atom fraction math reuses (adding fractions
produces an unreduced fraction to simplify). Semi-multistep like factoring: you can type
the reduced answer anytime, or **work it** — type a common factor and watch it get pulled
out of the numerator and denominator, press Enter to cancel it, repeat, then a final Enter
to confirm lowest terms.

## Goal
An educational "reduce to lowest terms" operation whose worked path **visualizes cancelling
common factors**, and whose answer-check + cancellation logic is a reusable building block
for later fraction math.

## Design

### The drop + dual path
A drop shows an unreduced fraction, e.g. **`12/18`**. Two ways to solve:
- **Fast path:** type the fully-reduced form (`2/3`, or a whole number when it reduces to
  one) + Enter → clears if it equals the fraction's value **and** is in lowest terms
  (`gcd=1`). Typing an un-reduced equivalent (`4/6`) is **rejected** ("not fully reduced").
- **Worked path (the visualization):** Tab-target the drop (auto-targeted when ½ is the only
  op, like factoring). Then, per cancellation:
  1. Type a common factor — say `2`. → the drop **re-renders factored: `(2·6) / (2·9)`**
     with the `2`s highlighted (live-on-type). The preview appearing *is* the validation
     that `2` divides both.
  2. **Enter** → the highlighted `2`s **cancel** (strike + fade) and the fraction **drops**
     to `6/9`.
  3. Repeat (`3` → `(3·2)/(3·3)` → Enter → `2/3`).
  4. **Terminal confirm:** once coprime, an Enter (empty input) submits and clears the drop.
- **Factor pulled out as-typed** (prime or not): `12/16` + `4` → `(4·3)/(4·4)` → Enter →
  `3/4`. So spotting the GCF is one clean step; prime-by-prime also works.
- **Invalid factor** (doesn't divide *both*, e.g. `4` on `12/18`): **no factored preview**
  appears and Enter rejects with "must divide both" — the absence of the visualization is the
  feedback.
- **Already reduced** (`3/5`): nothing cancels; the player just Enters to confirm, with a
  subtle "already in lowest terms ✓" cue so recognizing it feels rewarding.
- **Reduces to a whole** (`6/3`): cancel `3` → `2/1` → shows/clears as **`2`**.

Live-on-type factored preview is the target; if it proves fiddly in the input path, fall
back to *first Enter factors → second Enter cancels* (note which was used).

### Answer / cancellation core (pure, tested — this is the reusable atom)
In `game-core.js`:
- `gcdInt(a, b)`, `reduceFraction(num, den)` → `{num, den}` coprime, `isReducedFraction(num,
  den)` = `gcd===1`.
- `fractionCancelStep(num, den, factor)` → `{num/factor, den/factor}` when `factor > 1` and
  divides both, else `null`.
- `checkSimplifiedAnswer(origNum, origDen, typed)` → parse `typed` (`p/q` or integer); accept
  iff it equals `reduceFraction(orig)` in value **and** (for a fraction) is coprime.
Positive-only, **improper stays improper** (no mixed numbers).

### The grid — cases × magnitude (same philosophy as Rounding)
Cells = the *concept*, levels = *magnitude*. Cases:
- **prime** — a single common prime factor (`4/6`, `10/15`)
- **repeated** — GCF is a prime power / product, multiple cancellations (`8/12`, `12/18`)
- **whole** — reduces to an integer (`9/3`, `6/2`)
- **reduced** — already lowest terms; recognize & confirm, no cancel (`3/5`, `7/8`)

Proposed ladder (exact ranges/cell counts settle in impl, unit-tested like Rounding):
| Lvl | Magnitude | Cases in play |
|----|----|----|
| 1 | small (den ≤ ~12) | prime |
| 2 | small | prime · whole |
| 3 | small | prime · whole · reduced |
| 4 | small–med (GCF = 4 / prime²) | repeated · reduced |
| 5 | med (GCF = 6 / two primes) | prime · repeated · whole |
| 6 | two-digit | prime · reduced |
| 7 | two-digit | whole · repeated |
| 8 | two-digit | prime · repeated · reduced |
| 9 | larger | all four mixed |
| 10 | large num/den, bigger GCF | all four mixed |

`getReduceUniverse(level)` + `makeReduceProblemFromKey(statsKey)` mirror the Rounding/×10
shape: one cell per `(magnitude, case)`; the actual fraction is sampled to fit (and to *be*
that case — e.g. a `reduced` cell samples a coprime pair). Mastery per cell.

### Reuse for fraction math (why first)
`checkSimplifiedAnswer` + the cancellation drop become the **final step** of future add/sub
fraction problems (`1/2 + 1/6 = 4/6` → simplify to `2/3` with this exact interaction). Build
it as a self-contained component with that in mind.

## Open Questions
- **Settled:** worked path B (common-factor cancellation) with the factored-out visualization;
  no mixed numbers; positive-only; chit `½`; terminal confirm Enter; factor pulled out
  as-typed; already-reduced cue; reduces-to-whole shows the integer.
- Op key/name: proposed `reduce` (symbol `½`, display "Simplify Fractions") — keeps
  `frac`/`fraction` free for later fraction math. Confirm during impl.
- Prime-factor-scaffold ("factor both sides fully") is a **later** enhancement, not v1.

## Implementation Notes
- **game-core (pure, unit-tested):** the gcd/reduce/cancel/answer helpers above;
  `getReduceUniverse(level)` + `makeReduceProblem(FromKey)`; add `reduce` to
  `operationDefaults` (symbol `½`); `getDifficultyRange` branch.
- **script.js:** route `generateProblem`/`generateWeightedProblem` for `reduce`; `OP_SETS.reduce
  = "reduce"` (own lane); `opDisplayNames`/`opDisplayLabels`. The drop is a **targetable,
  morphing fraction** — reuse the factor-drop target/step-entry plumbing (`Tab` targeting,
  per-Enter step commit, special canvas rendering) but the "step" is a cancellation that
  divides both terms and re-renders `(f·x)/(f·y) → x/y`. Terminal empty-Enter on a coprime
  fraction clears it (with the ✓ cue); the fast path checks `checkSimplifiedAnswer`.
- **index.html:** `.op-chit` `data-op="reduce"` with `½` + a `data-tip` (e.g. "Simplify
  fractions — type a common factor to cancel, or the reduced answer / Example: 12/18 → 2/3").
- **Stats/grid:** list-style like f10/round (cells are concept buckets); `formatStatsKeyLabel`
  for `reduce`. Docs (PURPOSE/ARCHITECTURE/CHANGELOG) + Tutorial copy (add ½ to the own-lane
  list; a line on the cancel-to-simplify interaction).
- No profile schema change.

## Acceptance Criteria
- A `½` chit toggles a `reduce` op in its own lane.
- Worked path: typing a common factor shows the factored form `(f·x)/(f·y)`; Enter cancels and
  the fraction reduces; an invalid factor shows no preview and is rejected ("must divide
  both"); a final Enter on the coprime fraction clears it.
- Fast path: the reduced form clears; an un-reduced equivalent (`4/6` for `12/18`) is rejected.
- Reduces-to-whole shows/clears as the integer; already-reduced clears on Enter with the ✓ cue.
- The per-level grid shows concept cells (prime / repeated / whole / reduced), not individual
  fractions; mastery/boss/challenges work off that universe like ×10 / Rounding.

## Testing
- **Unit (game-core):** `gcdInt`/`reduceFraction`/`isReducedFraction`; `fractionCancelStep`
  (valid common factor divides both, invalid → null); `checkSimplifiedAnswer` (reduced ok,
  un-reduced rejected, whole-number reduce, coprime already-reduced); `getReduceUniverse`
  per-level counts + each cell samples a fraction that *is* its case (prime/repeated/whole/
  reduced) with the right magnitude.
- **E2E:** own-lane toggle; a fraction drop cleared via the **worked path** (type factor →
  factored preview → Enter cancels → repeat → confirm) and via the **fast path**; an
  un-reduced answer rejected; an invalid common factor rejected with no preview; reduces-to-
  whole; already-reduced confirm.

## Outcome
Implemented by Codex:
- Added `reduce` / `½` as its own operation lane with level range 1–10, profile universe support, stats labels, tutorial copy, and type docs.
- Added pure `game-core` helpers: `gcdInt`, `reduceFraction`, `isReducedFraction`, `fractionCancelStep`, `checkSimplifiedAnswer`, `getReduceUniverse`, `makeReduceProblem`, and `makeReduceProblemFromKey`.
- Added conceptual mastery buckets `red:<band>:<case>` for `prime`, `repeated`, `whole`, and `reduced` fraction-simplification cases.
- Wired fast-path answers so only lowest-terms answers clear on Enter; unreduced equivalents are rejected.
- Wired target-mode cancellation: a targeted fraction previews `(f·a)/(f·b)` while typing a common factor, Enter commits the cancellation, and an empty Enter clears once the current fraction is in lowest terms.
- Covered with unit tests for the pure helpers/universe and Playwright tests for lane switching, worked path, fast path, unreduced rejection, invalid common factor rejection, whole-number reduction, and already-reduced confirmation.

Verification run:
- `npm test`
- `npm run test:unit`
- `npm run typecheck`
- targeted Chromium Playwright: `fraction simplification|loads without page errors`
- related Chromium Playwright: operation chits, rounding, SI Enter, and factor targeting/boss-node flows
