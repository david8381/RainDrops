// Curriculum "tracks" — data-driven level definitions.
//
// A track maps each operation to a descriptor that the (shared) game-core
// builders read to produce that op's per-level problem universe / difficulty.
// The `standard` track reproduces the game's original hardcoded levels; alternate
// tracks (e.g. `timesTables`) redefine them as pure DATA. game-core reads these
// through a trailing `track = TRACKS.standard` parameter, so this module is
// data-only (no builder functions) and there is no import cycle with game-core.
//
// A descriptor's `kind` selects the game-core builder strategy. Ops not present on
// a track fall back to game-core's built-in ("standard") behavior — so the
// refactor can move ops onto the track one at a time without breaking anything.

export const TRACKS = {
  standard: {
    id: "standard",
    label: "Standard",
    ops: null, // null → every operation is available
    // Arithmetic: level → operand range [min, lerp(maxLo, maxHi, (level-1)/9)].
    add: { kind: "range", min: 1, maxLo: 3, maxHi: 20 },
    sub: { kind: "range", min: 1, maxLo: 3, maxHi: 20 },
    mul: { kind: "range", min: 1, maxLo: 3, maxHi: 12 },
    div: { kind: "range", min: 1, maxLo: 3, maxHi: 12 },
  },

  // Multiply-only: level N is the N times table (N×1 … N×factors), N = 1…maxLevel.
  timesTables: {
    id: "timesTables",
    label: "Times Tables (×)",
    ops: ["mul"],
    mul: { kind: "timesTable", maxLevel: 12, factors: 12 },
  },
};

export function getActiveTrack(trackId) {
  return TRACKS[trackId] || TRACKS.standard;
}
