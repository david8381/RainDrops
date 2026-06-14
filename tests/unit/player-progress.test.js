import assert from "node:assert/strict";
import { describe, it } from "node:test";

import "../../src/game-core.js";
import "../../src/player-progress.js";

const {
  PROFILE_STORE_KEY,
  STORAGE_KEY,
  computeSkillReadiness,
  createDefaultProfile,
  createStoredProfile,
  getPracticeSuggestions,
  getPressureTier,
  getProfileList,
  getSkillUniverseProblems,
  getSkillUniverseSize,
  mirrorLegacyProblemStats,
  isBossMasteredProblem,
  problemCurrentAccuracy,
  problemMastery,
  readProfile,
  readProfileStore,
  recordBossAttempt,
  recordBlitzAttempt,
  recordChallengeAttempt,
  getChallengeBest,
  getChallengeBests,
  recordProgressEvent,
  saveProfile,
  summarizeProfile,
  switchStoredProfile,
  syncSettings,
} = globalThis.RainMathProgress;

function createMemoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.hasOwn(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    data,
  };
}

describe("player progress profile", () => {
  it("creates a backend-ready local profile with all skills", () => {
    const profile = createDefaultProfile(Date.UTC(2026, 0, 1));

    assert.equal(profile.version, 3);
    assert.equal(profile.user.id, "local-default");
    assert.deepEqual(Object.keys(profile.skills), [
      "add",
      "sub",
      "mul",
      "div",
      "f10",
      "si",
      "shapes",
      "factor",
    ]);
    assert.equal(profile.skills.add.currentLevel, 1);
    assert.equal(profile.skills.add.readiness, 0);
  });

  it("preserves saved levels and records boss attempts per level", () => {
    const profile = createDefaultProfile();

    syncSettings(profile, { difficulties: { add: 2 } });
    assert.equal(summarizeProfile(profile).skills.add.bossAttemptedForLevel, false);

    recordBossAttempt(profile, "add", Date.UTC(2026, 0, 1));
    assert.equal(profile.skills.add.bossAttempts.length, 4);
    assert.equal(profile.skills.add.bossAttempts[0].level, 1);
    assert.equal(profile.skills.add.bossAttempts[0].result, "cleared");
    assert.equal(profile.skills.add.bossAttempts[0].temporary, false);
    assert.equal(profile.skills.add.bossAttempts[0].pressureTier, "calm");
    assert.equal(profile.skills.add.bossAttempts[3].level, 2);
    assert.equal(profile.skills.add.bossAttempts[3].pressureTier, "steady");
    assert.equal(profile.skills.add.bossAttempts[3].speedPercent, 30);
    assert.equal(profile.skills.add.bossAttempts[3].inferred, false);
    assert.equal(summarizeProfile(profile).skills.add.bossAttemptedForLevel, true);
    assert.equal(summarizeProfile(profile).skills.add.bossClearedCurrentPressureTier, true);

    recordBossAttempt(profile, "add", { pressureTier: "blitz", nowMs: Date.UTC(2026, 0, 2) });
    assert.equal(profile.skills.add.bossAttempts.length, 8);
    assert.equal(profile.skills.add.bossAttempts.at(-1).pressureTier, "blitz");
    recordBossAttempt(profile, "add", { pressureTier: "blitz", nowMs: Date.UTC(2026, 0, 3) });
    assert.equal(profile.skills.add.bossAttempts.length, 8);

    syncSettings(profile, { speed: 80 });
    const pressureSummary = summarizeProfile(profile).skills.add;
    assert.equal(pressureSummary.currentPressureTier.key, "blitz");
    assert.equal(pressureSummary.currentSpeedPercent, 80);
    assert.equal(pressureSummary.bossClearedCurrentPressureTier, true);
    assert.deepEqual(
      pressureSummary.bossPressureTiers.filter((tier) => tier.cleared).map((tier) => tier.key),
      ["calm", "steady", "quick", "blitz"]
    );

    syncSettings(profile, { difficulties: { add: 3 } });
    assert.equal(profile.skills.add.currentLevel, 3);
    assert.equal(summarizeProfile(profile).skills.add.bossAttemptedForLevel, false);
  });

  it("records blitz attempts for boss-cleared levels", () => {
    const profile = createDefaultProfile();
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 1) });

    let summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.blitzUnlockedLevel, 1);
    assert.equal(summary.blitzBest, null);

    recordBlitzAttempt(profile, "add", {
      level: 1,
      score: 42,
      speedPercent: 58,
      spawnRate: 6,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 2),
    });
    recordBlitzAttempt(profile, "add", {
      level: 1,
      score: 65,
      speedPercent: 74,
      spawnRate: 8,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 3),
    });

    summary = summarizeProfile(profile).skills.add;
    assert.equal(profile.skills.add.blitzAttempts.length, 2);
    assert.equal(summary.blitzBest.score, 65);
    assert.equal(summary.blitzBest.maxSpeedPercent, 74);
    assert.equal(summary.blitzBest.maxDropLimit, 8);
  });

  it("keeps blitz bests level-specific but reports the best score across levels", () => {
    const profile = createDefaultProfile();

    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 1) });
    recordBlitzAttempt(profile, "add", {
      level: 1,
      score: 65,
      speedPercent: 70,
      spawnRate: 7,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 2),
    });

    syncSettings(profile, { difficulties: { add: 2 } });
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 3) });
    recordBlitzAttempt(profile, "add", {
      level: 2,
      score: 55,
      speedPercent: 62,
      spawnRate: 6,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 4),
    });

    let summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.blitzUnlockedLevel, 2);
    assert.equal(summary.blitzBest.level, 1);
    assert.equal(summary.blitzBest.score, 65);

    recordBlitzAttempt(profile, "add", {
      level: 2,
      score: 65,
      speedPercent: 78,
      spawnRate: 8,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 5),
    });
    summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.blitzBest.level, 2);
    assert.equal(summary.blitzBest.score, 65);

    recordBlitzAttempt(profile, "add", {
      level: 2,
      score: 82,
      speedPercent: 92,
      spawnRate: 10,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 6),
    });
    summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.blitzBest.level, 2);
    assert.equal(summary.blitzBest.score, 82);
  });

  it("records challenge bests by score and boss time", () => {
    const profile = createDefaultProfile();
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 1) });

    recordBlitzAttempt(profile, "add", {
      level: 1,
      score: 44,
      speedPercent: 55,
      spawnRate: 5,
      nowMs: Date.UTC(2026, 0, 2),
    });
    recordChallengeAttempt(profile, "add", {
      type: "wave",
      level: 1,
      score: 31,
      nowMs: Date.UTC(2026, 0, 3),
    });
    recordChallengeAttempt(profile, "add", {
      type: "boss",
      level: 1,
      durationMs: 91000,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 4),
    });
    recordChallengeAttempt(profile, "add", {
      type: "boss",
      level: 1,
      durationMs: 72000,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 5),
    });

    let summary = summarizeProfile(profile).skills.add;
    assert.equal(profile.skills.add.challengeAttempts.length, 4);
    assert.equal(summary.challengeBests.blitz.score, 44);
    assert.equal(summary.challengeBests.wave.score, 31);
    assert.equal(summary.challengeBests.boss.durationMs, 72000);

    syncSettings(profile, { difficulties: { add: 2 } });
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 6) });
    recordChallengeAttempt(profile, "add", {
      type: "wave",
      level: 2,
      score: 31,
      nowMs: Date.UTC(2026, 0, 7),
    });
    recordChallengeAttempt(profile, "add", {
      type: "blitz",
      level: 2,
      score: 40,
      nowMs: Date.UTC(2026, 0, 8),
    });

    summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.blitzUnlockedLevel, 2);
    assert.equal(summary.challengeBests.blitz.score, 40);
    assert.equal(summary.challengeBests.wave.level, 2);
    assert.equal(getChallengeBest(profile.skills.add, "wave", 1).level, 2);
    assert.equal(getChallengeBests(profile.skills.add, 1).boss.durationMs, 72000);
  });

  it("reports per-level challenge bests, carrying better scores down without overwriting", () => {
    const profile = createDefaultProfile();
    // Clear L1 boss, then a strong wave at L1.
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 1) });
    recordChallengeAttempt(profile, "add", { type: "wave", level: 1, score: 14, nowMs: Date.UTC(2026, 0, 2) });
    // Advance, clear L2 boss, then a weaker wave at L2.
    syncSettings(profile, { difficulties: { add: 2 } });
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 3) });
    recordChallengeAttempt(profile, "add", { type: "wave", level: 2, score: 9, nowMs: Date.UTC(2026, 0, 4) });
    // Now working toward L3 (never played).
    syncSettings(profile, { difficulties: { add: 3 } });

    const rows = summarizeProfile(profile).skills.add.challengeBestsByLevel;
    const byLevel = Object.fromEntries(rows.map((row) => [row.level, row]));
    assert.equal(rows.length, 3);
    // L1 keeps its strong score even though a weaker L2 run exists.
    assert.equal(byLevel[1].wave.score, 14);
    // L2 shows its own (weaker) score.
    assert.equal(byLevel[2].wave.score, 9);
    // L3 has never been played -> no scores.
    assert.equal(byLevel[3].wave, null);
    assert.equal(byLevel[3].blitz, null);
    assert.equal(byLevel[3].boss, null);
  });

  it("persists to and recovers from localStorage", () => {
    const storage = createMemoryStorage();
    const profile = createDefaultProfile();
    profile.user.name = "Test Player";

    saveProfile(profile, storage);
    const loaded = readProfile(storage);

    assert.equal(JSON.parse(storage.data[STORAGE_KEY]).user.name, "Test Player");
    assert.equal(JSON.parse(storage.data[PROFILE_STORE_KEY]).activeUserId, "local-default");
    assert.equal(loaded.user.name, "Test Player");
  });

  it("migrates an untouched legacy local profile to david", () => {
    const legacy = createDefaultProfile(Date.UTC(2026, 0, 1));
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify(legacy),
    });

    const loaded = readProfile(storage, Date.UTC(2026, 0, 2));
    const store = readProfileStore(storage, Date.UTC(2026, 0, 2));

    assert.equal(loaded.user.id, "david");
    assert.equal(loaded.user.name, "david");
    assert.equal(store.activeUserId, "david");
    assert.ok(store.profiles.david);
  });

  it("preserves an explicitly named legacy profile during migration", () => {
    const legacy = createDefaultProfile(Date.UTC(2026, 0, 1));
    legacy.user.name = "Ada";
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify(legacy),
    });

    const loaded = readProfile(storage, Date.UTC(2026, 0, 2));

    assert.equal(loaded.user.id, "local-default");
    assert.equal(loaded.user.name, "Ada");
  });

  it("creates and switches locally stored profiles", () => {
    const legacy = createDefaultProfile(Date.UTC(2026, 0, 1));
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify(legacy),
    });

    const ada = createStoredProfile("Ada Lovelace", storage, Date.UTC(2026, 0, 2));
    let list = getProfileList(storage, Date.UTC(2026, 0, 2));

    assert.equal(ada.user.id, "ada-lovelace");
    assert.equal(readProfile(storage).user.name, "Ada Lovelace");
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((profile) => profile.name).sort(), ["Ada Lovelace", "david"]);
    assert.equal(list.find((profile) => profile.id === "ada-lovelace")?.active, true);

    const david = switchStoredProfile("david", storage, Date.UTC(2026, 0, 3));
    list = getProfileList(storage, Date.UTC(2026, 0, 3));

    assert.equal(david.user.id, "david");
    assert.equal(readProfile(storage).user.name, "david");
    assert.equal(list.find((profile) => profile.id === "david")?.active, true);
  });

  it("falls back to defaults when stored data is malformed", () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: "{nope" });
    const loaded = readProfile(storage);

    assert.equal(loaded.user.id, "local-default");
    assert.equal(loaded.skills.add.totals.attempts, 0);
  });

  it("migrates untouched legacy level defaults without downgrading practiced levels", () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify({
        version: 1,
        settings: { difficulties: { add: 3, mul: 3 } },
        skills: {
          add: { currentLevel: 3, totals: { attempts: 0 }, problems: {} },
          mul: { currentLevel: 3, totals: { attempts: 1 }, problems: { "2,2": { attempts: 1 } } },
        },
      }),
    });

    const loaded = readProfile(storage);

    assert.equal(loaded.skills.add.currentLevel, 1);
    assert.equal(loaded.settings.difficulties.add, 1);
    assert.equal(loaded.skills.mul.currentLevel, 3);
    assert.equal(loaded.settings.difficulties.mul, 3);
  });

  it("records outcomes, streaks, response time, and recent history", () => {
    const profile = createDefaultProfile(Date.UTC(2026, 0, 1));

    recordProgressEvent(profile, {
      opKey: "add",
      statsKey: "3,5",
      text: "3 + 5",
      outcome: "correct",
      responseMs: 1200,
      pressureTier: "blitz",
    }, Date.UTC(2026, 0, 1, 0, 0, 1));
    recordProgressEvent(profile, {
      opKey: "add",
      statsKey: "3,5",
      text: "3 + 5",
      outcome: "wrong",
    }, Date.UTC(2026, 0, 1, 0, 0, 2));
    recordProgressEvent(profile, {
      opKey: "add",
      statsKey: "4,4",
      text: "4 + 4",
      outcome: "helped",
    }, Date.UTC(2026, 0, 1, 0, 0, 3));

    const skill = profile.skills.add;
    assert.equal(skill.totals.attempts, 3);
    assert.equal(skill.totals.correct, 1);
    assert.equal(skill.totals.wrong, 1);
    assert.equal(skill.totals.helped, 1);
    assert.equal(skill.totals.currentStreak, 0);
    assert.equal(skill.totals.bestStreak, 1);
    assert.equal(skill.totals.responseCount, 1);
    assert.equal(skill.pressureTiers.blitz.attempts, 1);
    assert.equal(skill.pressureTiers.blitz.correct, 1);
    assert.equal(skill.problems["3,5"].attempts, 2);
    assert.equal(skill.problems["3,5"].pressureTiers.blitz.correct, 1);
    assert.equal(skill.problems["3,5"].recent[0].pressureTier, "blitz");
    assert.equal(skill.problems["4,4"].helped, 1);
    assert.equal(skill.recent.length, 3);
  });

  it("keeps one correct answer below problem mastery", () => {
    const profile = createDefaultProfile();

    recordProgressEvent(profile, {
      opKey: "add",
      statsKey: "1,7",
      text: "1 + 7",
      outcome: "correct",
      responseMs: 900,
    });

    assert.ok(problemMastery(profile.skills.add.problems["1,7"]) < 50);
  });

  it("uses recent weighted accuracy so old misses can be overcome", () => {
    const profile = createDefaultProfile();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      recordProgressEvent(profile, {
        opKey: "add",
        statsKey: "1,7",
        text: "1 + 7",
        outcome: "wrong",
        responseMs: 900,
      });
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      recordProgressEvent(profile, {
        opKey: "add",
        statsKey: "1,7",
        text: "1 + 7",
        outcome: "correct",
        responseMs: 900,
      });
    }

    const problem = profile.skills.add.problems["1,7"];

    assert.ok(problem.correct / problem.attempts < 0.9);
    assert.ok(problemCurrentAccuracy(problem) >= 0.9);
    assert.equal(isBossMasteredProblem(problem), true);
  });

  it("does not overstate boss readiness after a small perfect sample", () => {
    const profile = createDefaultProfile();
    syncSettings(profile, { difficulties: { add: 3 } });
    let recorded = 0;

    for (let a = 1; a <= 7 && recorded < 10; a += 1) {
      for (let b = 1; b <= 7 && recorded < 10; b += 1) {
        recordProgressEvent(profile, {
          opKey: "add",
          statsKey: `${a},${b}`,
          text: `${a} + ${b}`,
          outcome: "correct",
          responseMs: 900,
        });
        recorded += 1;
      }
    }

    const summary = computeSkillReadiness(profile.skills.add);

    assert.equal(getSkillUniverseSize("add", 3), 49);
    assert.equal(summary.universeCount, 49);
    assert.equal(summary.attempts, 10);
    assert.equal(summary.distinct, 10);
    assert.equal(summary.readiness, 0);
    assert.equal(summary.bossReady, false);
  });

  it("builds practice suggestions from weak review and unseen coverage", () => {
    const profile = createDefaultProfile();
    syncSettings(profile, { difficulties: { add: 3 } });
    recordProgressEvent(profile, {
      opKey: "add",
      statsKey: "4,1",
      text: "4 + 1",
      outcome: "wrong",
      responseMs: 3000,
    });
    recordProgressEvent(profile, {
      opKey: "add",
      statsKey: "2,2",
      text: "2 + 2",
      outcome: "correct",
      responseMs: 900,
    });

    const universe = getSkillUniverseProblems("add", 3);
    const suggestions = getPracticeSuggestions(profile.skills.add, 4);

    assert.equal(universe.length, 49);
    assert.deepEqual(universe[0], { statsKey: "1,1", text: "1 + 1" });
    assert.deepEqual(universe.at(-1), { statsKey: "7,7", text: "7 + 7" });
    assert.ok(suggestions.some((problem) => problem.kind === "review" && problem.statsKey === "4,1"));
    assert.ok(suggestions.some((problem) => problem.kind === "new" && problem.statsKey !== "4,1" && problem.statsKey !== "2,2"));
  });

  it("computes boss readiness from broad mastery across the level universe", () => {
    const profile = createDefaultProfile();
    syncSettings(profile, { difficulties: { add: 3 } });
    for (let a = 1; a <= 7; a += 1) {
      for (let b = 1; b <= 7; b += 1) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          recordProgressEvent(profile, {
            opKey: "add",
            statsKey: `${a},${b}`,
            text: `${a} + ${b}`,
            outcome: "correct",
            responseMs: 900,
          });
        }
      }
    }

    const summary = computeSkillReadiness(profile.skills.add);

    assert.equal(summary.attempts, 147);
    assert.equal(summary.distinct, 49);
    assert.equal(summary.universeCount, 49);
    assert.equal(summary.masteredCount, 49);
    assert.equal(summary.readiness, 100);
    assert.equal(summary.bossReady, true);
    assert.equal(summarizeProfile(profile).skills.add.bossReady, true);
  });

  it("unlocks boss readiness when 80 percent of the current level universe is mastered", () => {
    const profile = createDefaultProfile();
    syncSettings(profile, { difficulties: { add: 3 } });
    let mastered = 0;

    for (let a = 1; a <= 7; a += 1) {
      for (let b = 1; b <= 7; b += 1) {
        if (mastered >= 39) break;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          recordProgressEvent(profile, {
            opKey: "add",
            statsKey: `${a},${b}`,
            text: `${a} + ${b}`,
            outcome: "correct",
            responseMs: 900,
          });
        }
        mastered += 1;
      }
      if (mastered >= 39) break;
    }

    const summary = computeSkillReadiness(profile.skills.add);

    assert.equal(summary.masteredCount, 39);
    assert.equal(summary.readiness, 80);
    assert.equal(summary.bossReady, true);
  });

  it("mirrors durable profile stats into legacy problemStats", () => {
    const profile = createDefaultProfile();
    const target = globalThis.RainMathCore.createProblemStats();
    recordProgressEvent(profile, {
      opKey: "si",
      statsKey: "k,base",
      text: "km → m",
      outcome: "correct",
    });
    recordProgressEvent(profile, {
      opKey: "si",
      statsKey: "k,base",
      text: "km → m",
      outcome: "missed",
    });

    mirrorLegacyProblemStats(profile, target);

    assert.deepEqual(target.si["k,base"], { asked: 2, correct: 1 });
  });

  it("syncs current settings and levels", () => {
    const profile = createDefaultProfile();
    syncSettings(profile, {
      speed: 67,
      rate: 9,
      difficulties: { add: 6, mul: 8 },
    });

    assert.equal(profile.settings.pressureTier, "quick");
    assert.equal(profile.settings.speed, 67);
    assert.equal(profile.settings.rate, 9);
    assert.equal(profile.skills.add.currentLevel, 6);
    assert.equal(profile.skills.mul.currentLevel, 8);
    assert.equal(getPressureTier(profile.settings.speed).key, "quick");
  });
});
