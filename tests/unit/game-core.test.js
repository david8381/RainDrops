import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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
  getSIReferenceRows,
  getSelectionWeight,
  formatPercent,
  formatDuration,
  formatResponseTime,
  formatMasteryDelta,
  formatSessionAccuracy,
  formatSessionLevelProgress,
  formatSessionSummary,
  getSessionReportLevels,
  formatSessionOperationStats,
  formatSessionLogDetails,
  formatAccuracyText,
  getCourseProgressPercent,
  formatSIStatsKey,
  formatStatsKeyLabel,
  computeShareChecksum,
  verifyShareChecksum,
  encodeShareString,
  decodeShareString,
  bytesToB64url,
  b64urlToBytes,
  formatReadinessPercent,
  formatReadyText,
  canOpenLevelChoices,
  shouldPromptBossAttempt,
  formatDropSeconds,
  formatBlitzResult,
  formatWaveResult,
  formatBlitzBestText,
  formatWaveBestText,
  formatBossReplayBestText,
  formatChallengeEntry,
  formatSkillDetails,
  formatPracticeNext,
  formatPlacementResult,
  resolvePlacementOutcome,
  smoothProgress,
  blitzDropSeconds,
  blitzSpeedPercent,
  blitzBombIntervalMs,
  waveBombIntervalMs,
  spawnIntervalMs,
  randomFallTimeSec,
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
} from "../../src/game-core.js";

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

  it("builds SI reference rows in descending exponent order with display strings", () => {
    const rows = getSIReferenceRows(10); // max difficulty -> all prefixes active

    assert.equal(rows.length, 13);
    assert.deepEqual(
      rows.map((r) => r.exp),
      [12, 9, 6, 3, 2, 1, 0, -1, -2, -3, -6, -9, -12]
    );

    const tera = rows[0];
    assert.equal(tera.sym, "T");
    assert.equal(tera.name, "tera");
    assert.equal(tera.base10, "10¹²"); // 10^12
    assert.equal(tera.factor, "1,000,000,000,000");
    assert.equal(tera.active, true);

    const base = rows.find((r) => r.exp === 0);
    assert.equal(base.sym, "");
    assert.equal(base.name, "(base)");
    assert.equal(base.base10, "10⁰");
    assert.equal(base.factor, "1");

    const milli = rows.find((r) => r.exp === -3);
    assert.equal(milli.sym, "m");
    assert.equal(milli.base10, "10⁻³"); // 10^-3
    assert.equal(milli.factor, "1/1,000");
  });

  it("formats display strings for the stats and session-report popups", () => {
    assert.equal(formatPercent(0.5), "50%");
    assert.equal(formatPercent(0.857), "86%"); // rounds
    assert.equal(formatPercent(1), "100%");

    assert.equal(formatDuration(NaN), "--");
    assert.equal(formatDuration(5500), "5.5s");
    assert.equal(formatDuration(65000), "1:05"); // minutes:seconds past 60s
    assert.equal(formatDuration(-100), "0.0s"); // clamps negatives

    assert.equal(formatResponseTime(null), "—"); // em dash placeholder
    assert.equal(formatResponseTime(undefined), "—");
    assert.equal(formatResponseTime(1500), "1.5s avg");

    assert.equal(formatMasteryDelta(5), "+5%");
    assert.equal(formatMasteryDelta(-3), "-3%");
    assert.equal(formatMasteryDelta(0), "no change");

    assert.equal(formatSessionAccuracy(null), "no practice attempts");
    assert.equal(formatSessionAccuracy({ attempts: 0 }), "no practice attempts");
    assert.equal(
      formatSessionAccuracy({ attempts: 4, correct: 3, accuracy: 0.75 }),
      "3/4 correct (75%)"
    );

    assert.equal(
      formatSessionLevelProgress({
        level: 3,
        masteryDelta: 10,
        started: { readiness: 40, masteredCount: 2, universeCount: 8 },
        ended: { readiness: 70, masteredCount: 5, universeCount: 8 },
      }),
      "L3 40% -> 70% (+10%; 2/8 -> 5/8 mastered)"
    );
  });

  it("formats challenge replay-button best text", () => {
    assert.equal(formatBlitzBestText(3, null), "Blitz L3");
    assert.equal(formatBlitzBestText(3, { durationMs: 65000 }), "Blitz L3 best 1:05");
    assert.equal(formatBlitzBestText(3, { score: 12 }), "Blitz L3 best 12 solved");

    assert.equal(formatWaveBestText(2, null), "Wave L2");
    assert.equal(formatWaveBestText(2, { maxLoadCleared: 4 }), "Wave L2 best 4 at once");
    assert.equal(formatWaveBestText(2, { score: 9 }), "Wave L2 best 9 solved");

    assert.equal(formatBossReplayBestText(5, null), "Worksheet L5");
    assert.equal(formatBossReplayBestText(5, { durationMs: 90000 }), "Worksheet L5 1:30");
  });

  it("formats Blitz and Wave challenge results", () => {
    assert.equal(formatDropSeconds(1.25), "1.3s drops");
    assert.equal(formatDropSeconds(NaN), "--");

    assert.equal(
      formatBlitzResult({ durationMs: 65000, fastestDropSeconds: 1.2, clearedCount: 30 }),
      "1:05 · 1.2s drops · 30 solved"
    );
    assert.equal(formatBlitzResult({ durationMs: 5000 }), "5.0s"); // optional parts omitted
    assert.equal(formatBlitzResult(null), "—");

    assert.equal(formatWaveResult({ maxLoadCleared: 4, clearedCount: 12 }), "4 at once · 12 solved");
    assert.equal(formatWaveResult({ maxLoadCleared: 3 }), "3 at once");
    assert.equal(formatWaveResult(null), "—");
  });

  it("formats skill readiness text and level-choice predicates", () => {
    assert.equal(formatReadinessPercent({ readiness: 87.6 }), "88%");
    assert.equal(formatReadinessPercent(null), "0%");

    // mastered (with boss-attempted check), unlocked, and plain mastered forms
    assert.equal(
      formatReadyText({ readiness: 100, bossAttemptedForLevel: true }),
      "Mastered: 100% ✓"
    );
    assert.equal(
      formatReadyText({ readiness: 80, levelAdvancedForLevel: true, bossReady: false }),
      "Unlocked: 80%"
    );
    assert.equal(formatReadyText({ readiness: 60 }), "Mastered: 60%");

    // level choices open once boss is ready / attempted / advanced
    assert.equal(canOpenLevelChoices({ bossReady: true }), true);
    assert.equal(canOpenLevelChoices({ levelAdvancedForLevel: true }), true);
    assert.equal(canOpenLevelChoices({}), false);
    assert.equal(canOpenLevelChoices(null), false);

    // boss prompt only when ready and not yet attempted or advanced
    assert.equal(shouldPromptBossAttempt({ bossReady: true }), true);
    assert.equal(shouldPromptBossAttempt({ bossReady: true, bossAttemptedForLevel: true }), false);
    assert.equal(shouldPromptBossAttempt({ bossReady: false }), false);
  });

  it("round-trips share blobs through the base64url codecs", () => {
    const obj = { name: "Adä", v: 1, sessionLog: [{ id: "s1", n: 5 }] }; // unicode-safe
    const enc = encodeShareString(obj);
    assert.ok(!/[+/=]/.test(enc)); // url-safe alphabet, no padding
    assert.deepEqual(decodeShareString(enc), obj);
    assert.equal(decodeShareString("!!!not base64!!!"), null); // bad input -> null
    assert.equal(decodeShareString(""), null);

    const bytes = new Uint8Array([0, 1, 250, 99, 255]);
    assert.deepEqual(b64urlToBytes(bytesToB64url(bytes)), bytes);
  });

  it("computes and verifies the share tamper checksum", () => {
    const salt = "rm.aurora.v1";
    const content = { note: "hi", v: 1, name: "Ada", sessionLog: [{ id: "s1", x: 5 }] };
    const checksum = computeShareChecksum(content, salt);

    // deterministic and salt-sensitive
    assert.equal(computeShareChecksum(content, salt), checksum);
    assert.notEqual(computeShareChecksum(content, "other-salt"), checksum);

    const payload = { ...content, id: `rmabc123-${checksum}` };
    assert.equal(verifyShareChecksum(payload, salt), true); // intact
    assert.equal(verifyShareChecksum({ ...payload, name: "Eve" }, salt), false); // tampered
    assert.equal(verifyShareChecksum(content, salt), true); // legacy blob with no id is accepted
  });

  it("resolves stats-key display labels per operation", () => {
    assert.equal(formatStatsKeyLabel("si", "k,m"), "kilo → milli");
    assert.equal(formatStatsKeyLabel("add", "2,3"), "2,3"); // arithmetic key passes through
    // op-specific keys delegate to that op's problem-from-key text
    assert.equal(formatStatsKeyLabel("pow", getPowUniverse(1)[0].statsKey), makePowProblemFromKey(getPowUniverse(1)[0].statsKey).text);
    assert.equal(formatStatsKeyLabel("shapes", getShapesUniverse()[0].statsKey), makeShapeProblemFromKey(getShapesUniverse()[0].statsKey).text);
  });

  it("computes course progress percent and formats SI stats keys", () => {
    assert.equal(getCourseProgressPercent(1), 10);
    assert.equal(getCourseProgressPercent(5), 50);
    assert.equal(getCourseProgressPercent(10), 100);
    assert.equal(getCourseProgressPercent(0), 10); // clamps level to 1..10
    assert.equal(getCourseProgressPercent(99), 100);

    assert.equal(formatSIStatsKey("k,m"), "kilo → milli");
    assert.equal(formatSIStatsKey("base,M"), "(base) → mega");
    assert.equal(formatSIStatsKey("weird"), "weird"); // not a 2-part key, passes through
  });

  it("formats the short accuracy label for stats cells", () => {
    assert.equal(formatAccuracyText(4, 3, false), "75% (3/4)");
    assert.equal(formatAccuracyText(0, 0, false), "—"); // nothing attempted
    assert.equal(formatAccuracyText(4, 3, true), "Placed out · 75% (3/4)");
    assert.equal(formatAccuracyText(0, 0, true), "Placed out"); // placed out, no attempts
  });

  it("formats the session-log row details line", () => {
    assert.equal(
      formatSessionLogDetails({
        practice: { attempts: 10, correct: 8, accuracy: 0.8 },
        assessment: { correct: 5, wrong: 1, missed: 2 },
        challenges: { started: 3, completed: 2 },
      }),
      "Practice: 8/10 correct (80%) · Boss/challenge solved: 5 · stress misses/wrongs: 3 · Challenges: 3 started, 2 completed"
    );
    assert.equal(
      formatSessionLogDetails({
        practice: { attempts: 0 },
        assessment: { correct: 0, wrong: 0, missed: 0 },
        challenges: { started: 0, completed: 0 },
      }),
      "Practice: no practice attempts · Boss/challenge solved: 0 · stress misses/wrongs: 0 · Challenges: none"
    );
  });

  it("formats per-operation session-report stat lines, omitting empty ones", () => {
    assert.deepEqual(
      formatSessionOperationStats({
        practice: { correct: 6, missed: 2, wrong: 1, attempts: 9 },
        assessment: { correct: 3, missed: 1, wrong: 0, attempts: 4 },
        challenges: { started: 2, completed: 1 },
      }),
      [
        "Correct/missed: 9/3",
        "Practice attempts: 9",
        "Wrong: 1",
        "Boss/challenge attempts: 4",
        "Challenges: 2 started, 1 completed",
      ]
    );
    // practice-only: no wrong/assessment/challenge lines
    assert.deepEqual(
      formatSessionOperationStats({
        practice: { correct: 5, missed: 0, wrong: 0, attempts: 5 },
        assessment: { correct: 0, missed: 0, wrong: 0, attempts: 0 },
        challenges: { started: 0, completed: 0 },
      }),
      ["Correct/missed: 5/0", "Practice attempts: 5"]
    );
  });

  it("resolves session-report levels, synthesizing one when none recorded", () => {
    // recorded levels pass through unchanged
    const recorded = [{ level: 1 }, { level: 2 }];
    assert.equal(getSessionReportLevels({ levels: recorded }), recorded);

    // no levels -> a single synthesized row from started/ended/masteryDelta
    assert.deepEqual(
      getSessionReportLevels({
        started: { level: 3, readiness: 40 },
        ended: { readiness: 70 },
        masteryDelta: 10,
      }),
      [
        {
          level: 3,
          started: { level: 3, readiness: 40 },
          ended: { readiness: 70 },
          masteryDelta: 10,
        },
      ]
    );

    // empty levels array also falls back
    assert.equal(
      getSessionReportLevels({ levels: [], started: { level: 5 }, ended: {}, masteryDelta: 0 }).length,
      1
    );
  });

  it("formats the session-report summary line", () => {
    assert.equal(
      formatSessionSummary({
        practice: { attempts: 10, correct: 8, accuracy: 0.8 },
        assessment: { correct: 5 },
        challenges: { started: 3, completed: 2 },
      }),
      "Practice 8/10 correct (80%) · Boss/challenge solved 5 · Challenges 3 started / 2 completed"
    );
    assert.equal(
      formatSessionSummary({
        practice: { attempts: 0 },
        assessment: { correct: 0 },
        challenges: { started: 0, completed: 0 },
      }),
      "Practice no practice attempts · Boss/challenge solved 0 · Challenges 0 started / 0 completed"
    );
  });

  it("computes boss bomb-spawn intervals (blitz ramp + wave load)", () => {
    // blitz: eases 2200 -> 700 over one ramp unit, then tightens, floored at 320
    assert.equal(blitzBombIntervalMs(0), 2200);
    assert.equal(blitzBombIntervalMs(1), 700);
    assert.ok(blitzBombIntervalMs(2) < 700 && blitzBombIntervalMs(2) >= 320);
    assert.equal(blitzBombIntervalMs(50), 320); // deep overdrive floored

    // wave: tighter as load grows, floored at 360
    assert.equal(waveBombIntervalMs(1), 1150);
    assert.equal(waveBombIntervalMs(5), 790);
    assert.equal(waveBombIntervalMs(100), 360);
  });

  it("computes spawn interval and random fall time", () => {
    // drops off -> never spawn
    assert.equal(spawnIntervalMs(50, 0), Infinity);
    // eases 2200ms -> 500ms as speed rises
    assert.equal(spawnIntervalMs(0, 3), 2200);
    assert.equal(spawnIntervalMs(100, 3), 500);
    assert.equal(spawnIntervalMs(50, 3), 1350);

    // random fall time: 3s..max, driven by the injected rng
    assert.equal(randomFallTimeSec(10, () => 0), 3);
    assert.equal(randomFallTimeSec(10, () => 1), 10);
    assert.equal(randomFallTimeSec(10, () => 0.5), 6.5);
    assert.equal(randomFallTimeSec(2, () => 0.9), 3); // max clamped up to 3
  });

  it("ramps Blitz drop-time and speed along the survival curve", () => {
    assert.equal(smoothProgress(0), 0);
    assert.equal(smoothProgress(1), 1);
    assert.equal(smoothProgress(0.5), 0.5);
    assert.equal(smoothProgress(2), 1); // clamps input

    const cfg = { startDropSeconds: 5.4, baselineDropSeconds: 2.2, minDropSeconds: 0.85, startSpeed: 20 };

    // start: full drop-time, start speed
    assert.equal(blitzDropSeconds(0, cfg), 5.4);
    assert.equal(blitzSpeedPercent(0, cfg), 20);
    // after one ramp unit: baseline drop-time, full speed
    assert.equal(blitzDropSeconds(1, cfg), 2.2);
    assert.equal(blitzSpeedPercent(1, cfg), 100);
    // overdrive: drop-time keeps shrinking, speed adds +25/unit
    assert.ok(blitzDropSeconds(2, cfg) < 2.2 && blitzDropSeconds(2, cfg) > cfg.minDropSeconds);
    assert.equal(blitzSpeedPercent(2, cfg), 125);
    assert.equal(blitzSpeedPercent(3, cfg), 150);
    // deep overdrive is floored at minDropSeconds
    assert.equal(blitzDropSeconds(1000, cfg), cfg.minDropSeconds);
  });

  it("resolves the Test Me placement outcome from shield/level/attempts", () => {
    const cfg = { shieldMax: 6, shieldStart: 3, attemptCap: 10 };
    const decide = (shield, level, levelAsked) =>
      resolvePlacementOutcome({ shield, level, levelAsked }, cfg);

    // full shield -> climb
    assert.deepEqual(decide(6, 4, 2), { action: "climb" });
    assert.deepEqual(decide(7, 4, 2), { action: "climb" });
    // empty shield -> finish, recommend this level
    assert.deepEqual(decide(0, 4, 5), { action: "finish", recommendedLevel: 4, reason: "shield collapsed" });
    // mid shield, under the attempt cap -> keep going
    assert.deepEqual(decide(4, 4, 5), { action: "continue" });
    // at the cap, net-positive (above the start shield) -> climb
    assert.deepEqual(decide(4, 4, 10), { action: "climb" });
    // at the cap, not net-positive -> finish here
    assert.deepEqual(decide(3, 4, 10), {
      action: "finish",
      recommendedLevel: 4,
      reason: "reached attempt cap",
    });
  });

  it("formats the Test Me placement-result card text", () => {
    const result = formatPlacementResult(
      {
        recommendedLevel: 4,
        totalCorrect: 18,
        totalAsked: 20,
        levelSummaries: [
          { level: 1, correct: 4, asked: 4 },
          { level: 2, correct: 3, asked: 4 },
          { level: 3, correct: 0, asked: 0 },
        ],
      },
      "Multiplication"
    );
    assert.equal(result.level, 4);
    assert.equal(result.title, "Recommended: Multiplication Level 4");
    assert.match(result.body, /^18\/20 correct in Test Me\. Eligible problems through Level 3 /);
    assert.equal(result.details, "L1: 4/4 (100%) · L2: 3/4 (75%) · L3: 0/0 (0%)");

    // level 1 places nothing out and falls back to the explainer when no summaries
    const base = formatPlacementResult(
      { recommendedLevel: 1, totalCorrect: 2, totalAsked: 6 },
      "Addition"
    );
    assert.match(base.body, /No lower levels will be marked placed out\./);
    assert.match(base.details, /^Test Me runs like the regular game/);
  });

  it("formats the practice-next line, distinguishing new and seen facts", () => {
    assert.equal(
      formatPracticeNext([
        { kind: "new", text: "7 + 8" },
        { kind: "review", text: "6 × 9", mastery: 40 },
      ]),
      "Practice next: 7 + 8 (new), 6 × 9 (40%)"
    );
    assert.equal(formatPracticeNext([]), "Practice next: ");
  });

  it("formats the per-skill detail line in the results popup", () => {
    const skill = {
      currentLevel: 3,
      bossReady: false,
      bossThreshold: 100,
      readiness: 88,
      attempts: 40,
      distinct: 5,
      universeCount: 8,
      masteredCount: 3,
      accuracy: 0.88,
      recentAccuracy: 0.92,
      averageResponseMs: 1400,
    };
    assert.equal(
      formatSkillDetails(skill),
      "Level 3 · 12% to boss · 40 attempts · 5/8 seen · 3 mastered · 88% accuracy · 92% recent · 1.4s avg"
    );
    assert.equal(
      formatSkillDetails({ ...skill, bossReady: true }),
      "Level 3 · Boss ready · 40 attempts · 5/8 seen · 3 mastered · 88% accuracy · 92% recent · 1.4s avg"
    );
  });

  it("formats results challenge-row chips per level", () => {
    assert.deepEqual(formatChallengeEntry({ level: 5 }), {
      played: false,
      text: "L5: not played",
    });
    assert.deepEqual(
      formatChallengeEntry({
        level: 3,
        blitz: { durationMs: 5000 },
        wave: { maxLoadCleared: 4 },
        boss: { durationMs: 65000 },
      }),
      { played: true, text: "L3: Blitz 5.0s · Wave 4 at once · Worksheet 1:05" }
    );
    // missing sub-challenges fall back to en-dash placeholders; score used when no metric
    assert.deepEqual(formatChallengeEntry({ level: 2, blitz: { score: 12 } }), {
      played: true,
      text: "L2: Blitz 12 · Wave – · Worksheet –",
    });
  });

  it("marks SI reference rows active only when unlocked at the difficulty", () => {
    const easy = getSIReferenceRows(1);
    const activeSyms = easy
      .filter((r) => r.active)
      .map((r) => r.sym)
      .sort();
    assert.deepEqual(activeSyms, ["", "k"]); // difficulty 1 unlocks only kilo + base
    assert.equal(easy.length, 13); // locked prefixes are still listed (greyed out)
    assert.equal(easy.find((r) => r.sym === "p").active, false);
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
