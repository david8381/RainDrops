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
  getProfileList,
  getSkillUniverseProblems,
  getSkillUniverseSize,
  mirrorLegacyProblemStats,
  problemMastery,
  readProfile,
  readProfileStore,
  recordBossAttempt,
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

    assert.equal(profile.version, 2);
    assert.equal(profile.user.id, "local-default");
    assert.deepEqual(Object.keys(profile.skills), [
      "add",
      "sub",
      "mul",
      "div",
      "f10",
      "si",
      "rect",
      "circ",
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
    assert.equal(profile.skills.add.bossAttempts.length, 1);
    assert.equal(profile.skills.add.bossAttempts[0].level, 2);
    assert.equal(summarizeProfile(profile).skills.add.bossAttemptedForLevel, true);

    syncSettings(profile, { difficulties: { add: 3 } });
    assert.equal(profile.skills.add.currentLevel, 3);
    assert.equal(summarizeProfile(profile).skills.add.bossAttemptedForLevel, false);
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
    assert.equal(skill.problems["3,5"].attempts, 2);
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
    assert.ok(summary.readiness < 40);
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
    assert.ok(summary.readiness >= 80);
    assert.equal(summary.bossReady, true);
    assert.equal(summarizeProfile(profile).skills.add.bossReady, true);
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
      speed: 80,
      rate: 7,
      pace: 10,
      difficulties: { add: 6, mul: 8 },
    });

    assert.equal(profile.settings.speed, 80);
    assert.equal(profile.settings.rate, 7);
    assert.equal(profile.settings.pace, 10);
    assert.equal(profile.skills.add.currentLevel, 6);
    assert.equal(profile.skills.mul.currentLevel, 8);
  });
});
