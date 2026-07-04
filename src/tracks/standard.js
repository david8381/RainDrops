// Standard track — the game's original curriculum, expressed as data.
//
// Each op maps to a level descriptor with a `kind` tag that selects a game-core
// builder strategy. Ops not present here fall back to game-core's built-in
// behavior, so the remaining non-arithmetic ops are being migrated in one at a
// time (see docs/Ai/FEATURE_REQUESTS/curriculum-tracks.md, phase C).
export const standard = {
  id: "standard",
  label: "Standard",
  ops: null, // null → every operation is available

  // Arithmetic: level → operand range [min, lerp(maxLo, maxHi, (level-1)/9)].
  add: { kind: "range", min: 1, maxLo: 3, maxHi: 20 },
  sub: { kind: "range", min: 1, maxLo: 3, maxHi: 20 },
  mul: { kind: "range", min: 1, maxLo: 3, maxHi: 12 },
  div: { kind: "range", min: 1, maxLo: 3, maxHi: 12 },

  // Factors of 10: cumulative types with (digits + power - 1) ≤ level, over
  // digits 1..maxDigits and powers 1..maxPower, each in × and ÷.
  f10: { kind: "f10", maxDigits: 4, maxPower: 4 },

  // Prime factoring: composites n in [minN, maxN] whose factor-difficulty ≤
  // level + levelOffset (cumulative).
  factor: { kind: "factor", minN: 4, maxN: 400, levelOffset: 1 },

  // Rounding: level N (1..maxLevel) → the spec tuples in levelSpecs[N-1] (the
  // last entry doubles as the level-maxLevel / mixed-review block). Each tuple is
  // [placeKey, relationKey, caseNames[], minValue, maxValue, inputDecimals]; the
  // place/relation/case label maps and rendering stay in game-core.
  round: {
    kind: "round",
    maxLevel: 10,
    levelSpecs: [
      [["ten", "norm", ["down", "up", "half", "zero"], 10, 99, 0]],
      [["ten", "big", ["down", "up", "half", "zero", "carry"], 100, 999, 0]],
      [["ten", "cross", ["down", "up"], 1, 9, 0]],
      [["hundred", "norm", ["down", "up", "half", "zero"], 100, 9999, 0]],
      [
        ["hundred", "cross", ["down", "up", "half"], 1, 99, 0],
        ["thousand", "norm", ["down", "up", "half", "zero", "carry"], 1000, 99999, 0],
      ],
      [["tenth", "norm", ["down", "up", "half", "zero"], 1, 9.99, 2]],
      [["tenth", "extra", ["down", "up", "half", "carry"], 1, 99.999, 3]],
      [["hundredth", "norm", ["down", "up", "half", "zero"], 1, 9.999, 3]],
      [
        ["tenth", "cross", ["down", "up", "half"], 0.01, 0.09, 2],
        ["hundredth", "cross", ["down", "up", "half"], 0.001, 0.009, 3],
      ],
      [
        ["thousandth", "norm", ["down", "up", "half", "zero", "carry"], 1, 9.9999, 4],
        ["tenth", "mix", ["down", "up"], 1, 99.999, 3],
        ["hundredth", "mix", ["half"], 1, 99.999, 3],
      ],
    ],
  },

  // Simplify fractions: level N → the concept cells in levelSpecs[N-1]. Each cell
  // is [band, kind, factor] (kind: "cancel" GCF=factor, or "whole" → integer).
  // The band→sampling-range and label maps stay in game-core (generation strategy).
  reduce: {
    kind: "reduce",
    maxLevel: 10,
    levelSpecs: [
      [["small", "cancel", 2], ["small", "cancel", 3], ["small", "cancel", 5], ["small", "cancel", 7]],
      [["small", "whole", 2], ["small", "whole", 3], ["small", "whole", 4], ["small", "whole", 5]],
      [["smallmed", "cancel", 4], ["smallmed", "cancel", 6], ["smallmed", "cancel", 8], ["smallmed", "cancel", 9]],
      [["small", "cancel", 1], ["smallmed", "cancel", 1], ["smallmed", "cancel", 2], ["smallmed", "cancel", 3]],
      [["two", "cancel", 2], ["two", "cancel", 3], ["two", "cancel", 5], ["two", "cancel", 7]],
      [["two", "whole", 3], ["two", "whole", 4], ["two", "whole", 6], ["two", "whole", 8]],
      [["two", "cancel", 4], ["two", "cancel", 6], ["two", "cancel", 9], ["two", "cancel", 12]],
      [["two", "cancel", 11], ["two", "cancel", 13], ["two", "cancel", 1], ["med", "cancel", 1]],
      [["large", "cancel", 3], ["large", "cancel", 6], ["large", "whole", 4], ["large", "cancel", 1]],
      [["huge", "cancel", 7], ["huge", "cancel", 12], ["huge", "whole", 8], ["huge", "cancel", 1]],
    ],
  },

  // Powers & roots: a cumulative ladder — level N exposes ladder rungs 1..N (in
  // order). Each rung enumerates makePowProblem(kind, a[, b]) calls:
  //   {kind, aFrom, aTo}      → for a in [aFrom..aTo]: (kind, a)
  //   {kind, a, bFrom, bTo}   → for b in [bFrom..bTo]: (kind, a, b)   (fixed base a)
  //   {kind, pairs:[[a,b]…]}  → (kind, a, b) for each pair
  // The makePowProblem rendering (superscripts, radicals) stays in game-core.
  pow: {
    kind: "pow",
    maxLevel: 10,
    ladder: [
      { kind: "sq", aFrom: 2, aTo: 7 },
      { kind: "sq", aFrom: 8, aTo: 12 },
      { kind: "sqrt", aFrom: 2, aTo: 12 },
      { kind: "pow", a: 10, bFrom: 1, bTo: 6 },
      { kind: "root10", pairs: [[2, 1], [2, 2], [2, 3], [3, 1], [3, 2]] },
      { kind: "pow", a: 2, bFrom: 1, bTo: 10 },
      { kind: "cube", aFrom: 2, aTo: 10 },
      { kind: "cbrt", aFrom: 2, aTo: 10 },
      { kind: "pow", a: 3, bFrom: 1, bTo: 6 },
      { kind: "neg10", aFrom: 1, aTo: 6 },
    ],
  },

  // SI unit conversions: `prefixes` (in unlock order) with each prefix's unlock
  // threshold in `thresholds` — level N exposes prefixes[i] where N ≥
  // thresholds[i]. The conversion/render math (siBaseUnits, expDiffToConversion)
  // stays in game-core.
  si: {
    kind: "si",
    prefixes: [
      { sym: "k", exp: 3, name: "kilo" },
      { sym: "", exp: 0, name: "base" },
      { sym: "c", exp: -2, name: "centi" },
      { sym: "m", exp: -3, name: "milli" },
      { sym: "h", exp: 2, name: "hecto" },
      { sym: "da", exp: 1, name: "deca" },
      { sym: "d", exp: -1, name: "deci" },
      { sym: "M", exp: 6, name: "mega" },
      { sym: "μ", exp: -6, name: "micro" },
      { sym: "G", exp: 9, name: "giga" },
      { sym: "n", exp: -9, name: "nano" },
      { sym: "T", exp: 12, name: "tera" },
      { sym: "p", exp: -12, name: "pico" },
    ],
    thresholds: [1, 1, 2, 3, 5, 6, 6, 7, 7, 8, 8, 9, 9],
  },
};
