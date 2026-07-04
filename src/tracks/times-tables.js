// Times Tables track — multiply-only, where level N is the N times table
// (N×1 … N×factors), N = 1…maxLevel. The `timesTable` kind's statsKeys ("N,b")
// are the same shape as Standard mul, so per-fact stats are universal and shared
// across tracks (see curriculum-tracks.md — facts are shared, coverage is not).
export const timesTables = {
  id: "timesTables",
  label: "Times Tables (×)",
  ops: ["mul"],
  mul: { kind: "timesTable", maxLevel: 12, factors: 12 },
};
