// Times Tables track — multiply-only.
//
// `kind: "arithmeticLevels"` means each level is described as readable operand
// ranges. A level can use:
//   a: 7                      one left operand
//   b: { from: 1, to: 12 }    an inclusive right-operand range
//   a/b: [2, 5, 10]           explicit values
//   pairs: [[7, 8], [8, 7]]   exact pairs when a range is not enough
//
// The generated statsKeys are still "a,b" (for example "7,8"), so per-fact
// mastery stays shared with Standard multiplication while track level progress
// remains separate.
export const timesTables = {
  id: "timesTables",
  label: "Times Tables (×)",
  ops: ["mul"],
  mul: {
    kind: "arithmeticLevels",
    levels: [
      { label: "1s table", a: 1, b: { from: 1, to: 12 } },
      { label: "2s table", a: 2, b: { from: 1, to: 12 } },
      { label: "3s table", a: 3, b: { from: 1, to: 12 } },
      { label: "4s table", a: 4, b: { from: 1, to: 12 } },
      { label: "5s table", a: 5, b: { from: 1, to: 12 } },
      { label: "6s table", a: 6, b: { from: 1, to: 12 } },
      { label: "7s table", a: 7, b: { from: 1, to: 12 } },
      { label: "8s table", a: 8, b: { from: 1, to: 12 } },
      { label: "9s table", a: 9, b: { from: 1, to: 12 } },
      { label: "10s table", a: 10, b: { from: 1, to: 12 } },
      { label: "11s table", a: 11, b: { from: 1, to: 12 } },
      { label: "12s table", a: 12, b: { from: 1, to: 12 } },
      { label: "Mixed 1s through 12s", a: { from: 1, to: 12 }, b: { from: 1, to: 12 } },
    ],
  },
};
