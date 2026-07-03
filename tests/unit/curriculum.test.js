import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getDifficultyRange } from "../../src/game-core.js";
import { getSkillUniverseSize, getSkillUniverseProblems } from "../../src/player-progress.js";

// Byte-for-byte golden snapshot of the current ("Standard") curriculum: every op ×
// every level's difficulty range, universe size, and universe problem list. This is
// the safety net for the track refactor — the Standard track must reproduce it
// exactly. Regenerate the fixture only with a deliberate, reviewed curriculum change.
const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../support/curriculum-snapshot.json", import.meta.url)), "utf8")
);

describe("curriculum snapshot (Standard track = today's levels)", () => {
  for (const opKey of Object.keys(snapshot)) {
    it(`${opKey}: difficulty range / universe size / universe problems match the snapshot at every level`, () => {
      for (const [levelStr, expected] of Object.entries(snapshot[opKey])) {
        const level = Number(levelStr);
        assert.deepEqual(getDifficultyRange(opKey, level), expected.range, `${opKey} L${level} range`);
        assert.equal(getSkillUniverseSize(opKey, level), expected.size, `${opKey} L${level} size`);
        assert.deepEqual(getSkillUniverseProblems(opKey, level), expected.universe, `${opKey} L${level} universe`);
      }
    });
  }
});
