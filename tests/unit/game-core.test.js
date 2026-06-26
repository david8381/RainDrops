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
  makeShapeProblem,
  makeShapeProblemFromKey,
  getShapesUniverse,
  makePowProblem,
  makePowProblemFromKey,
  getPowUniverse,
  getF10Universe,
  makeF10ProblemFromKey,
  factorDifficulty,
  getFactorUniverse,
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
  hashString,
  matchesFactorDrop,
  normalizeTypedValue,
  parseNumericAnswer,
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

  it("parses decimal and simple-fraction answers", () => {
    assert.equal(parseNumericAnswer("4.5"), 4.5);
    assert.equal(parseNumericAnswer("9/2"), 4.5);
    assert.equal(parseNumericAnswer("5"), 5);
    assert.equal(parseNumericAnswer("-3/2"), -1.5);
    assert.equal(parseNumericAnswer("12/4"), 3);
    assert.ok(Number.isNaN(parseNumericAnswer("9/0")));
    assert.ok(Number.isNaN(parseNumericAnswer("9/"))); // still typing
    assert.ok(Number.isNaN(parseNumericAnswer("abc")));
    assert.ok(Number.isNaN(parseNumericAnswer("")));
  });

  it("hashString is deterministic and sensitive to changes", () => {
    assert.equal(hashString("hello"), hashString("hello"));
    assert.notEqual(hashString("hello"), hashString("hellp"));
    assert.notEqual(hashString("hello"), hashString("hello", 1)); // seed matters
    assert.match(hashString("anything"), /^[0-9a-z]+$/); // base36
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
    assert.deepEqual(getDifficultyRange("f10", 10), { min: 1, max: 4 });
    assert.deepEqual(getDifficultyRange("shapes", 10), { min: 2, max: 5 });
    assert.deepEqual(getDifficultyRange("factor", 1), { min: 4, max: 400 });
    assert.deepEqual(getDifficultyRange("factor", 10), { min: 4, max: 400 });
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

  it("builds factors-of-10 problems by structural type", () => {
    // Level gates types by digits + power - 1 (cumulative): L1 has only 1-digit ×/÷10.
    assert.equal(getF10Universe(1).length, 2);
    assert.equal(getF10Universe(2).length, 6);
    assert.equal(getF10Universe(10).length, 32);

    // statsKey identifies the type, not the specific number.
    const det = makeF10ProblemFromKey("mul,1,1", sequenceRng([0, 0]));
    assert.equal(det.opKey, "f10");
    assert.equal(det.statsKey, "mul,1,1");
    assert.equal(det.text, "1 × 10");
    assert.equal(det.answer, 10);

    // Division shifts the decimal left without floating-point noise.
    const div = makeF10ProblemFromKey("div,1,2", sequenceRng([0.2, 0]));
    assert.equal(div.statsKey, "div,1,2");
    assert.equal(Number(div.answerText), div.answer);
    assert.match(div.text, /÷ 100$/);
  });

  it("builds powers & roots with clean answers and a cumulative level ladder", () => {
    // Each family's formula and notation.
    assert.deepEqual(
      { t: makePowProblem("sq", 7).text, a: makePowProblem("sq", 7).answer },
      { t: "7²", a: 49 }
    );
    assert.deepEqual({ t: makePowProblem("sqrt", 9).text, a: makePowProblem("sqrt", 9).answer }, { t: "√81", a: 9 });
    assert.deepEqual({ t: makePowProblem("cube", 4).text, a: makePowProblem("cube", 4).answer }, { t: "4³", a: 64 });
    assert.deepEqual({ t: makePowProblem("cbrt", 6).text, a: makePowProblem("cbrt", 6).answer }, { t: "∛216", a: 6 });
    assert.deepEqual({ t: makePowProblem("pow", 10, 4).text, a: makePowProblem("pow", 10, 4).answer }, { t: "10⁴", a: 10000 });
    assert.deepEqual({ t: makePowProblem("pow", 2, 8).text, a: makePowProblem("pow", 2, 8).answer }, { t: "2⁸", a: 256 });
    assert.deepEqual({ t: makePowProblem("pow", 3, 5).text, a: makePowProblem("pow", 3, 5).answer }, { t: "3⁵", a: 243 });
    assert.deepEqual({ t: makePowProblem("root10", 3, 1).text, a: makePowProblem("root10", 3, 1).answer }, { t: "∛1000", a: 10 });

    // Negative powers of 10 must be clean terminating decimals, not 1e-6.
    const neg = makePowProblem("neg10", 6);
    assert.equal(neg.text, "10⁻⁶");
    assert.equal(neg.answer, 0.000001);
    assert.equal(neg.answerText, "0.000001");

    // statsKey round-trips.
    const rt = makePowProblemFromKey("pow,2,8");
    assert.equal(rt.opKey, "pow");
    assert.equal(rt.answer, 256);

    // Cumulative ladder: squares at L1, square roots by L3, negatives only at L10.
    const keysAt = (lvl) => getPowUniverse(lvl).map((p) => p.statsKey);
    assert.ok(keysAt(1).includes("sq,7"));
    assert.ok(!keysAt(1).includes("sqrt,9"));
    assert.ok(keysAt(3).includes("sqrt,9"));
    assert.ok(!keysAt(9).some((k) => k.startsWith("neg10")));
    assert.ok(keysAt(10).some((k) => k.startsWith("neg10")));
    assert.equal(getPowUniverse(1).length, 6); // squares 2–7
    assert.equal(getPowUniverse(11).length, getPowUniverse(10).length); // clamps at 10
  });

  it("generates shape problems with known formulas", () => {
    // Square area & perimeter.
    assert.equal(makeShapeProblem("sq", "A", [4]).answer, 16);
    assert.equal(makeShapeProblem("sq", "P", [4]).answer, 16);
    // Rectangle area & perimeter.
    assert.equal(makeShapeProblem("rect", "A", [3, 5]).answer, 15);
    assert.equal(makeShapeProblem("rect", "P", [3, 5]).answer, 16);
    // Triangle: area = ½·b·h, perimeter = sum of sides.
    assert.equal(makeShapeProblem("tri", "A", [3, 4]).answer, 6);
    assert.equal(makeShapeProblem("tri", "P", [3, 4, 5]).answer, 12);
    // Circle answers as the coefficient of π.
    const circleArea = makeShapeProblem("cir", "A", [3]);
    assert.equal(circleArea.answer, 9);
    assert.equal(circleArea.text, "A○ r=3 =?π");
    assert.equal(makeShapeProblem("cir", "C", [3]).answer, 6);

    // 3D shapes (levels 5-8): cube, rectangular prism, cylinder, sphere.
    assert.equal(makeShapeProblem("cube", "SA", [2]).answer, 24); // 6·2²
    assert.equal(makeShapeProblem("cube", "V", [4]).answer, 64); // 4³
    assert.equal(makeShapeProblem("rprism", "SA", [2, 3, 4]).answer, 52); // 2(6+8+12)
    assert.equal(makeShapeProblem("rprism", "V", [2, 3, 4]).answer, 24);
    assert.equal(makeShapeProblem("cyl", "V", [2, 5]).answer, 20); // r²h coefficient
    assert.equal(makeShapeProblem("sph", "SA", [3]).answer, 36); // 4r² coefficient
    // Sphere volume coefficient (4r³/3) is only offered when it is clean.
    const sphereVolumes = getShapesUniverse(8)
      .filter((p) => p.statsKey.startsWith("sph,V,"))
      .map((p) => p.statsKey);
    assert.deepEqual(sphereVolumes, ["sph,V,3", "sph,V,6"]);

    // statsKey round-trips through makeShapeProblemFromKey.
    const roundTrip = makeShapeProblemFromKey("rect,A,2,5");
    assert.equal(roundTrip.opKey, "shapes");
    assert.equal(roundTrip.answer, 10);
    assert.equal(roundTrip.text, "A▭ 2×5");

    // generateProblem dispatches into the level's cumulative shape set.
    const config = createDefaultOpConfig();
    config.shapes.difficulty = 4;
    const problem = generateProblem("shapes", config, sequenceRng([0]));
    assert.equal(problem.opKey, "shapes");
    assert.equal(problem.answerText, String(problem.answer));
  });

  it("generates composite-only factorization problems", () => {
    const config = createDefaultOpConfig();
    config.factor.difficulty = 3;
    for (let i = 0; i < 20; i += 1) {
      const problem = generateProblem("factor", config);
      assert.equal(problem.opKey, "factor");
      assert.ok(isComposite(problem.factorOriginal));
      assert.equal(problem.factorRemaining, problem.factorOriginal);
    }
  });

  it("scores prime-factoring difficulty from number structure", () => {
    assert.equal(factorDifficulty(6), 1); // 2·3
    assert.equal(factorDifficulty(4), 2); // 2²
    assert.equal(factorDifficulty(9), 3); // 3²
    assert.equal(factorDifficulty(12), 4); // 2²·3
    assert.equal(factorDifficulty(36), 6); // 2²·3²
    // The ladder is shifted by one so L1 is not just {6}: L1 holds difficulty <= 2.
    assert.deepEqual(getFactorUniverse(1).map((p) => p.statsKey), ["4", "6", "10", "15"]);
    assert.equal(getFactorUniverse(2).length, 9); // adds difficulty-3 composites
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
