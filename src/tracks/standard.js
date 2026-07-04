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
};
