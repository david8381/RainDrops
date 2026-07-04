import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getDifficultyRange, generateProblem, createDefaultOpConfig } from "../../src/game-core.js";
import { getSkillUniverseSize, getSkillUniverseProblems } from "../../src/player-progress.js";
import { TRACKS, getActiveTrack } from "../../src/curriculum.js";

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

describe("track swap changes the curriculum (Times Tables)", () => {
  const tt = getActiveTrack("timesTables");

  it("resolves known + unknown track ids", () => {
    assert.equal(getActiveTrack("timesTables"), TRACKS.timesTables);
    assert.equal(getActiveTrack("nope"), TRACKS.standard);
    assert.equal(getActiveTrack(undefined), TRACKS.standard);
  });

  it("mul levels are explicit table levels plus a final mixed review, and differ from Standard", () => {
    // Level 3 = the 3 times table.
    assert.deepEqual(getDifficultyRange("mul", 3, tt), { min: 1, max: 12 });
    assert.equal(getSkillUniverseSize("mul", 3, tt), 12);
    assert.deepEqual(
      getSkillUniverseProblems("mul", 3, tt),
      Array.from({ length: 12 }, (_, i) => ({ statsKey: `3,${i + 1}`, text: `3 × ${i + 1}` }))
    );
    // Level 7 = the 7 times table.
    assert.deepEqual(getSkillUniverseProblems("mul", 7, tt)[6], { statsKey: "7,7", text: "7 × 7" });
    // Final level is mixed review: every fact from 1×1 through 12×12.
    assert.equal(getSkillUniverseSize("mul", 13, tt), 144);
    assert.equal(getSkillUniverseSize("mul", 99, tt), 144); // clamps
    assert.deepEqual(getSkillUniverseProblems("mul", 13, tt)[0], { statsKey: "1,1", text: "1 × 1" });
    assert.deepEqual(getSkillUniverseProblems("mul", 13, tt).at(-1), { statsKey: "12,12", text: "12 × 12" });

    // Genuinely different from the Standard grid at the same level.
    assert.notDeepEqual(getSkillUniverseProblems("mul", 3, tt), getSkillUniverseProblems("mul", 3));
  });

  it("generates times-table problems (multiplier = level)", () => {
    const config = createDefaultOpConfig();
    config.mul.difficulty = 6;
    const seq = () => 0.5; // mid-range factor
    const p = generateProblem("mul", config, seq, tt);
    assert.equal(p.opKey, "mul");
    assert.match(p.text, /^6 × \d+$/);
    assert.match(p.statsKey, /^6,\d+$/);
    assert.equal(p.answer, 6 * Number(p.statsKey.split(",")[1]));
  });
});
