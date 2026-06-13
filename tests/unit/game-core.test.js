import assert from "node:assert/strict";
import { describe, it } from "node:test";

import "../../src/game-core.js";

const {
  advanceFactorDrop,
  clamp,
  createDefaultOpConfig,
  createProblemStats,
  expDiffToConversion,
  factorizationProduct,
  formatFactorization,
  formatFixedScale,
  generateCircleOfType,
  generateProblem,
  generateSIProblem,
  generateWeightedProblem,
  getDifficultyRange,
  getFullFactorization,
  getMastery,
  getSIPrefixesForDifficulty,
  getSelectionWeight,
  isComposite,
  isPrime,
  matchesFactorDrop,
  normalizeTypedValue,
  parseFactorizationInput,
  pow10,
  recordProblemResult,
  shiftDecimal,
  weightedPick,
} = globalThis.RainMathCore;

function sequenceRng(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

describe("numeric utilities", () => {
  it("clamps and normalizes typed numeric input", () => {
    assert.equal(clamp(1, 10, -2), 1);
    assert.equal(clamp(1, 10, 20), 10);
    assert.equal(normalizeTypedValue("0007"), "7");
    assert.equal(normalizeTypedValue(".5"), "0.5");
    assert.equal(normalizeTypedValue("-.5"), "-0.5");
    assert.equal(normalizeTypedValue("1.2300", { allowIncomplete: false }), "1.23");
    assert.equal(normalizeTypedValue("12abc"), "12abc");
  });

  it("formats and shifts fixed-scale decimal values", () => {
    assert.equal(pow10(3), 1000);
    assert.equal(formatFixedScale(123, 2), "1.23");
    assert.equal(formatFixedScale(-123, 2), "-1.23");
    assert.equal(shiftDecimal(35, 1, 2), "350");
    assert.equal(shiftDecimal(35, 1, -2), "0.035");
  });
});

describe("difficulty ranges", () => {
  it("maps each operation to its intended low and high range", () => {
    assert.deepEqual(getDifficultyRange("add", 1), { min: 1, max: 3 });
    assert.deepEqual(getDifficultyRange("add", 10), { min: 1, max: 20 });
    assert.deepEqual(getDifficultyRange("mul", 10), { min: 1, max: 12 });
    assert.deepEqual(getDifficultyRange("f10", 10), { min: 1, max: 20 });
    assert.deepEqual(getDifficultyRange("rect", 10), { min: 1, max: 20 });
    assert.deepEqual(getDifficultyRange("circ", 10), { min: 1, max: 12 });
    assert.deepEqual(getDifficultyRange("factor", 1), { min: 4, max: 16 });
    assert.deepEqual(getDifficultyRange("factor", 10), { min: 4, max: 200 });
  });

  it("unlocks SI prefixes by difficulty", () => {
    assert.deepEqual(
      getSIPrefixesForDifficulty(1).map((p) => p.sym),
      ["k", ""]
    );
    assert.ok(getSIPrefixesForDifficulty(7).some((p) => p.sym === "M"));
    assert.ok(getSIPrefixesForDifficulty(9).some((p) => p.sym === "p"));
    assert.equal(expDiffToConversion(3), "*1000");
    assert.equal(expDiffToConversion(-2), "/100");
  });
});

describe("problem generation", () => {
  it("generates basic arithmetic with correct answers and stats keys", () => {
    const config = createDefaultOpConfig();
    for (const key of ["add", "sub", "mul", "div"]) {
      config[key].difficulty = 3;
    }

    const add = generateProblem("add", config, sequenceRng([0, 0.5]));
    assert.equal(add.opKey, "add");
    assert.equal(add.answer, 1 + 4);
    assert.equal(add.statsKey, "1,4");

    const sub = generateProblem("sub", config, sequenceRng([0, 0.9]));
    assert.equal(sub.opKey, "sub");
    assert.ok(sub.answer >= 0);

    const mul = generateProblem("mul", config, sequenceRng([0.5, 0.5]));
    assert.equal(mul.answerText, String(mul.answer));

    const div = generateProblem("div", config, sequenceRng([0.5, 0.25]));
    assert.match(div.text, /\d+ ÷ \d+/);
    assert.equal(Number(div.answerText), div.answer);
  });

  it("generates factors-of-10 and SI problems with answer text", () => {
    const config = createDefaultOpConfig();
    config.f10.difficulty = 7;
    const f10 = generateProblem("f10", config, sequenceRng([0, 0.9, 0, 0]));
    assert.equal(f10.opKey, "f10");
    assert.match(f10.text, /×|÷/);
    assert.equal(Number(f10.answerText), f10.answer);

    const si = generateSIProblem(1, sequenceRng([0, 0.9, 0]));
    assert.deepEqual(
      { text: si.text, answerText: si.answerText, statsKey: si.statsKey },
      { text: "km → m", answerText: "*1000", statsKey: "k,base" }
    );
  });

  it("generates geometry problems with known formulas", () => {
    const circleCases = [
      ["Cr", 3, 6],
      ["Cd", 3, 3],
      ["Ar", 3, 9],
      ["Ad", 3, 2.25],
    ];

    for (const [subtype, value, answer] of circleCases) {
      const problem = generateCircleOfType(subtype, value);
      assert.equal(problem.opKey, "circ");
      assert.equal(problem.answer, answer);
      assert.equal(problem.answerText, String(answer));
    }

    const config = createDefaultOpConfig();
    const rect = generateProblem("rect", config, sequenceRng([0, 0.5, 0]));
    assert.equal(rect.opKey, "rect");
    assert.match(rect.text, /^P▭/);
    assert.equal(rect.answerText, String(rect.answer));
  });

  it("generates composite-only factorization problems", () => {
    const config = createDefaultOpConfig();
    config.factor.difficulty = 1;
    for (let i = 0; i < 20; i += 1) {
      const problem = generateProblem("factor", config);
      assert.equal(problem.opKey, "factor");
      assert.ok(isComposite(problem.factorOriginal));
      assert.equal(problem.factorRemaining, problem.factorOriginal);
    }
  });
});

describe("factorization helpers", () => {
  it("parses prime-factor notation and validates products", () => {
    assert.deepEqual(parseFactorizationInput("2^2*3"), { 2: 2, 3: 1 });
    assert.deepEqual(parseFactorizationInput("2*2*3"), { 2: 2, 3: 1 });
    assert.equal(parseFactorizationInput("4*3"), null);
    assert.equal(factorizationProduct({ 2: 3, 5: 1 }), 40);
    assert.equal(formatFactorization({ 2: 2, 3: 1 }, 1), "2^2*3");
    assert.equal(getFullFactorization(84), "2^2*3*7");
  });

  it("matches full factor answers against factor drops", () => {
    const drop = { opKey: "factor", factorOriginal: 36 };
    assert.equal(matchesFactorDrop("2^2*3^2", drop), true);
    assert.equal(matchesFactorDrop("2*3^2", drop), false);
  });

  it("keeps targeting mode manual until the last factor is entered", () => {
    const drop = {
      factorOriginal: 6,
      factorRemaining: 6,
      factorCollected: {},
    };
    advanceFactorDrop(drop, 2, { fromTargeting: true });
    assert.deepEqual(drop.factorCollected, { 2: 1 });
    assert.equal(drop.factorRemaining, 3);
    assert.equal(drop.factorComplete, undefined);

    advanceFactorDrop(drop, 3, { fromTargeting: true });
    assert.deepEqual(drop.factorCollected, { 2: 1, 3: 1 });
    assert.equal(drop.factorRemaining, 1);
    assert.equal(drop.factorComplete, true);
  });

  it("auto-completes a final prime outside targeting mode", () => {
    const drop = {
      factorOriginal: 6,
      factorRemaining: 6,
      factorCollected: {},
    };
    advanceFactorDrop(drop, 2);
    assert.deepEqual(drop.factorCollected, { 2: 1, 3: 1 });
    assert.equal(drop.factorRemaining, 1);
    assert.equal(drop.factorComplete, true);
  });
});

describe("mastery weighting", () => {
  it("records attempts and computes bounded mastery weights", () => {
    const stats = createProblemStats();
    const drop = { opKey: "add", statsKey: "1,1", text: "1 + 1" };
    recordProblemResult(stats, drop, true);
    recordProblemResult(stats, drop, false);

    assert.deepEqual(stats.add["1,1"], { asked: 2, correct: 1 });
    assert.ok(getMastery(stats, "add", "1,1") > 0.36);
    assert.ok(getMastery(stats, "add", "1,1") < 0.38);
    assert.equal(getMastery(stats, "add", "1,1", () => 0.8), 0.8);
    assert.equal(getMastery(stats, "add", "1,1", () => 2), 1);
    assert.equal(getSelectionWeight(0), 15);
    assert.equal(getSelectionWeight(1), 1);
  });

  it("picks weighted items and generates weighted problems", () => {
    const pick = weightedPick(
      [
        { value: "low", weight: 1 },
        { value: "high", weight: 9 },
      ],
      () => 0.5
    );
    assert.equal(pick, "high");

    const config = createDefaultOpConfig();
    const stats = createProblemStats();
    const problem = generateWeightedProblem("add", config, stats, sequenceRng([0, 0]));
    assert.equal(problem.opKey, "add");
    assert.match(problem.text, /\d+ \+ \d+/);
  });
});

describe("prime checks", () => {
  it("distinguishes prime and composite values", () => {
    assert.equal(isPrime(2), true);
    assert.equal(isPrime(97), true);
    assert.equal(isPrime(1), false);
    assert.equal(isPrime(100), false);
    assert.equal(isComposite(4), true);
    assert.equal(isComposite(97), false);
  });
});
