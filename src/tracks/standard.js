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
};
