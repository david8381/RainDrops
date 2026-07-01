import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProblemStats } from "../../src/game-core.js";

import {
  BOSS_READY_SCORE,
  PROFILE_STORE_KEY,
  STORAGE_KEY,
  computeSkillReadiness,
  createDefaultProfile,
  createStoredProfile,
  deleteStoredProfile,
  getPracticeSuggestions,
  getPressureTier,
  getProfileList,
  getSkillUniverseProblems,
  getSkillUniverseSize,
  buildStatsTooltip,
  mirrorLegacyProblemStats,
  isBossMasteredProblem,
  problemCurrentAccuracy,
  problemMastery,
  readProfile,
  readProfileStore,
  recordBossAttempt,
  recordLevelAdvance,
  recordBlitzAttempt,
  recordChallengeAttempt,
  getChallengeBest,
  getChallengeBests,
  getFinishLevelPracticeProblems,
  importStoredProfile,
  isPlacementPlacedOut,
  recordPlacementCredit,
  recordProgressEvent,
  recordSessionChallenge,
  recordSessionEvent,
  recordSessionHeartbeat,
  recordSessionStart,
  saveProfile,
  shouldResumeSession,
  summarizeProfile,
  summarizeSessionLog,
  switchStoredProfile,
  syncSettings,
} from "../../src/player-progress.js";

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
    assert.deepEqual(profile.sessionLog, []);
    assert.deepEqual(Object.keys(profile.skills), [
      "add",
      "sub",
      "mul",
      "div",
      "f10",
      "round",
      "si",
      "shapes",
      "pow",
      "factor",
    ]);
    assert.equal(profile.skills.add.currentLevel, 1);
    assert.equal(profile.skills.add.readiness, 0);
    assert.equal(profile.settings.textSize, "normal");
  });

  it("records and summarizes local session logs", () => {
    const profile = createDefaultProfile(Date.UTC(2026, 0, 1));
    const start = Date.UTC(2026, 0, 1, 12, 0, 0);

    recordSessionStart(profile, {
      id: "visit-1",
      speed: 40,
      rate: 4,
      userAgent: "test browser",
    }, start);
    for (let i = 0; i < 3; i += 1) {
      recordProgressEvent(profile, {
        opKey: "add",
        statsKey: "1,1",
        text: "1 + 1",
        outcome: "correct",
        responseMs: 1200,
      }, start + 1000 + i);
      recordSessionEvent(profile, "visit-1", {
        opKey: "add",
        outcome: "correct",
        responseMs: 1200,
      }, start + 1000 + i);
    }
    recordSessionEvent(profile, "visit-1", {
      opKey: "add",
      outcome: "missed",
      assessment: true,
    }, start + 2000);
    recordSessionChallenge(profile, "visit-1", {
      opKey: "add",
      action: "start",
      type: "full",
    }, start + 3000);
    recordSessionChallenge(profile, "visit-1", {
      opKey: "add",
      action: "complete",
      type: "boss",
      cleared: true,
      durationMs: 45000,
      score: 7,
    }, start + 46000);
    recordSessionHeartbeat(profile, "visit-1", start + 60000);

    const [session] = summarizeSessionLog(profile);

    assert.equal(session.id, "visit-1");
    assert.equal(session.durationMs, 60000);
    assert.equal(session.settings.speed, 40);
    assert.equal(session.settings.textSize, "normal");
    assert.equal(session.practice.attempts, 3);
    assert.equal(session.practice.correct, 3);
    assert.equal(session.practice.accuracy, 1);
    assert.equal(session.practice.averageResponseMs, 1200);
    assert.equal(session.assessment.attempts, 1);
    assert.equal(session.assessment.missed, 1);
    assert.equal(session.totalSolved, 3);
    assert.equal(session.challenges.started, 1);
    assert.equal(session.challenges.completed, 1);
    assert.equal(session.challenges.cleared, 1);
    assert.equal(session.challenges.boss, 2);
    assert.equal(session.challenges.bestScore, 7);
    assert.equal(session.challenges.bestBossTimeMs, 45000);
    assert.equal(session.operations.length, 1);
    assert.equal(session.operations[0].opKey, "add");
    assert.equal(session.operations[0].durationMs, 3600);
    assert.equal(session.operations[0].practice.correct, 3);
    assert.equal(session.operations[0].assessment.missed, 1);
    assert.equal(session.operations[0].challenges.started, 1);
    assert.equal(session.operations[0].challenges.completed, 1);
    assert.equal(session.operations[0].started.readiness, 0);
    assert.equal(session.operations[0].ended.readiness, 11);
    assert.equal(session.operations[0].masteryDelta, 11);
    assert.equal(session.operations[0].levels.length, 1);
    assert.equal(session.operations[0].levels[0].level, 1);
    assert.equal(session.operations[0].levels[0].started.readiness, 0);
    assert.equal(session.operations[0].levels[0].ended.readiness, 11);
  });

  it("decides whether a recent session should resume", () => {
    const now = Date.UTC(2026, 0, 1, 12, 30, 0);
    const session = {
      id: "visit-1",
      startedAt: new Date(now - 60 * 60 * 1000).toISOString(),
      endedAt: new Date(now - 20 * 60 * 1000).toISOString(),
      lastSeenAt: new Date(now - 20 * 60 * 1000).toISOString(),
    };

    assert.equal(shouldResumeSession(session, now, 30 * 60 * 1000), true);
    assert.equal(shouldResumeSession({ ...session, lastSeenAt: new Date(now - 30 * 60 * 1000).toISOString() }, now, 30 * 60 * 1000), true);
    assert.equal(shouldResumeSession({ ...session, lastSeenAt: new Date(now - 30 * 60 * 1000 - 1).toISOString() }, now, 30 * 60 * 1000), false);
    assert.equal(shouldResumeSession({ ...session, lastSeenAt: "not-a-date" }, now, 30 * 60 * 1000), false);
    assert.equal(shouldResumeSession(null, now, 30 * 60 * 1000), false);
    assert.equal(shouldResumeSession({ ...session, lastSeenAt: new Date(now + 1000).toISOString() }, now, 30 * 60 * 1000), false);
  });

  it("recordSessionStart resumes an existing session id instead of adding a row", () => {
    const profile = createDefaultProfile(Date.UTC(2026, 0, 1));
    const start = Date.UTC(2026, 0, 1, 12, 0, 0);
    recordSessionStart(profile, { id: "visit-1", speed: 30, rate: 3 }, start);
    recordSessionStart(profile, { id: "visit-1", speed: 80, rate: 10 }, start + 5000);

    assert.equal(profile.sessionLog.length, 1);
    assert.equal(profile.sessionLog[0].id, "visit-1");
    assert.equal(profile.sessionLog[0].settings.speed, 30);
    assert.equal(profile.sessionLog[0].lastSeenAt, new Date(start + 5000).toISOString());
  });

  it("tracks idle-capped active session time", () => {
    const profile = createDefaultProfile(Date.UTC(2026, 0, 1));
    const start = Date.UTC(2026, 0, 1, 12, 0, 0);

    recordSessionStart(profile, { id: "visit-1" }, start);
    recordSessionHeartbeat(profile, "visit-1", start + 30_000);
    recordSessionHeartbeat(profile, "visit-1", start + 90_000);
    recordSessionHeartbeat(profile, "visit-1", start + 90_000 + 60 * 60 * 1000);

    const [session] = summarizeSessionLog(profile);
    assert.equal(session.durationMs, 210_000);
    assert.equal(profile.sessionLog[0].activeMs, 210_000);
  });

  it("persists active time and falls legacy duration back to engaged operation time", () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const profile = createDefaultProfile(now);
    profile.sessionLog = [
      {
        id: "active",
        startedAt: new Date(now - 10 * 60 * 1000).toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        endedAt: new Date(now).toISOString(),
        activeMs: 95_000,
        operations: {
          add: { opKey: "add", durationMs: 4_000 },
        },
      },
      {
        id: "legacy",
        startedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        endedAt: new Date(now).toISOString(),
        operations: {
          add: { opKey: "add", durationMs: 4_000 },
          sub: { opKey: "sub", durationMs: 6_000 },
        },
      },
    ];
    const store = {
      version: 1,
      activeUserId: profile.user.id,
      profiles: {
        [profile.user.id]: profile,
      },
    };
    const storage = createMemoryStorage({
      [PROFILE_STORE_KEY]: JSON.stringify(store),
    });

    const loaded = readProfile(storage);
    const sessions = summarizeSessionLog(loaded, 10);

    assert.equal(sessions.find((session) => session.id === "active").durationMs, 95_000);
    assert.equal(sessions.find((session) => session.id === "legacy").durationMs, 10_000);
    assert.equal(loaded.sessionLog.find((session) => session.id === "legacy").activeMs, undefined);

    recordSessionHeartbeat(loaded, "legacy", now + 6 * 60 * 60 * 1000);
    assert.equal(loaded.sessionLog.find((session) => session.id === "legacy").activeMs, 130_000);
    assert.equal(summarizeSessionLog(loaded, 10).find((session) => session.id === "legacy").durationMs, 130_000);
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

  it("stores problem text size as a profile setting", () => {
    const profile = createDefaultProfile();

    syncSettings(profile, { textSize: "huge" });
    assert.equal(profile.settings.textSize, "huge");

    syncSettings(profile, { textSize: "not-a-size" });
    assert.equal(profile.settings.textSize, "normal");

    recordSessionStart(profile, {
      id: "visit-text",
      textSize: "large",
    });
    const [session] = summarizeSessionLog(profile);
    assert.equal(session.settings.textSize, "large");
  });

  it("records mastered level advances separately from boss clears", () => {
    const profile = createDefaultProfile();

    recordLevelAdvance(profile, "add", { level: 1, nowMs: Date.UTC(2026, 0, 1) });
    let summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.unlockedLevel, 1);
    assert.equal(summary.blitzUnlockedLevel, 0);
    assert.equal(summary.bossAttemptedForLevel, false);
    assert.equal(profile.skills.add.bossAttempts.length, 0);
    assert.equal(profile.skills.add.levelAdvances.length, 1);
    assert.equal(profile.skills.add.levelAdvances[0].result, "mastered");

    syncSettings(profile, { difficulties: { add: 2 } });
    summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.currentLevel, 2);
    assert.equal(summary.unlockedLevel, 1);
  });

  it("records blitz attempts for boss-cleared levels", () => {
    const profile = createDefaultProfile();
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 1) });

    let summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.blitzUnlockedLevel, 1);
    assert.equal(summary.blitzBest, null);

    recordBlitzAttempt(profile, "add", {
      level: 1,
      durationMs: 42000,
      speedPercent: 58,
      spawnRate: 6,
      fastestDropSeconds: 3.1,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 2),
    });
    recordBlitzAttempt(profile, "add", {
      level: 1,
      durationMs: 65000,
      speedPercent: 74,
      spawnRate: 8,
      fastestDropSeconds: 2.5,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 3),
    });

    summary = summarizeProfile(profile).skills.add;
    assert.equal(profile.skills.add.blitzAttempts.length, 2);
    assert.equal(summary.blitzBest.score, 65);
    assert.equal(summary.blitzBest.durationMs, 65000);
    assert.equal(summary.blitzBest.fastestDropSeconds, 2.5);
    assert.equal(summary.blitzBest.maxSpeedPercent, 74);
    assert.equal(summary.blitzBest.maxDropLimit, 8);
  });

  it("keeps blitz bests level-specific but reports the best survival time across levels", () => {
    const profile = createDefaultProfile();

    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 1) });
    recordBlitzAttempt(profile, "add", {
      level: 1,
      durationMs: 65000,
      speedPercent: 70,
      spawnRate: 7,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 2),
    });

    syncSettings(profile, { difficulties: { add: 2 } });
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 3) });
    recordBlitzAttempt(profile, "add", {
      level: 2,
      durationMs: 55000,
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
      durationMs: 65000,
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
      durationMs: 82000,
      speedPercent: 92,
      spawnRate: 10,
      cleared: true,
      nowMs: Date.UTC(2026, 0, 6),
    });
    summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.blitzBest.level, 2);
    assert.equal(summary.blitzBest.score, 82);
  });

  it("records challenge bests by natural challenge metric and boss time", () => {
    const profile = createDefaultProfile();
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 1) });

    recordBlitzAttempt(profile, "add", {
      level: 1,
      durationMs: 44000,
      speedPercent: 55,
      spawnRate: 5,
      nowMs: Date.UTC(2026, 0, 2),
    });
    recordChallengeAttempt(profile, "add", {
      type: "wave",
      level: 1,
      maxLoadCleared: 6,
      maxLoadReached: 7,
      clearedCount: 31,
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
    assert.equal(summary.challengeBests.blitz.durationMs, 44000);
    assert.equal(summary.challengeBests.wave.score, 6);
    assert.equal(summary.challengeBests.wave.maxLoadCleared, 6);
    assert.equal(summary.challengeBests.wave.clearedCount, 31);
    assert.equal(summary.challengeBests.boss.durationMs, 72000);

    syncSettings(profile, { difficulties: { add: 2 } });
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 6) });
    recordChallengeAttempt(profile, "add", {
      type: "wave",
      level: 2,
      maxLoadCleared: 6,
      maxLoadReached: 8,
      nowMs: Date.UTC(2026, 0, 7),
    });
    recordChallengeAttempt(profile, "add", {
      type: "blitz",
      level: 2,
      durationMs: 40000,
      nowMs: Date.UTC(2026, 0, 8),
    });

    summary = summarizeProfile(profile).skills.add;
    assert.equal(summary.blitzUnlockedLevel, 2);
    assert.equal(summary.challengeBests.blitz.score, 40);
    assert.equal(summary.challengeBests.wave.level, 2);
    assert.equal(summary.challengeBests.wave.maxLoadReached, 8);
    assert.equal(getChallengeBest(profile.skills.add, "wave", 1).level, 2);
    assert.equal(getChallengeBests(profile.skills.add, 1).boss.durationMs, 72000);
  });

  it("reports per-level challenge bests, carrying better scores down without overwriting", () => {
    const profile = createDefaultProfile();
    // Clear L1 boss, then a strong wave at L1.
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 1) });
    recordChallengeAttempt(profile, "add", { type: "wave", level: 1, maxLoadCleared: 7, clearedCount: 14, nowMs: Date.UTC(2026, 0, 2) });
    // Advance, clear L2 boss, then a weaker wave at L2.
    syncSettings(profile, { difficulties: { add: 2 } });
    recordBossAttempt(profile, "add", { speedPercent: 30, spawnRate: 3, nowMs: Date.UTC(2026, 0, 3) });
    recordChallengeAttempt(profile, "add", { type: "wave", level: 2, maxLoadCleared: 4, clearedCount: 9, nowMs: Date.UTC(2026, 0, 4) });
    // Now working toward L3 (never played).
    syncSettings(profile, { difficulties: { add: 3 } });

    const rows = summarizeProfile(profile).skills.add.challengeBestsByLevel;
    const byLevel = Object.fromEntries(rows.map((row) => [row.level, row]));
    assert.equal(rows.length, 3);
    // L1 keeps its strong score even though a weaker L2 run exists.
    assert.equal(byLevel[1].wave.maxLoadCleared, 7);
    // L2 shows its own (weaker) score.
    assert.equal(byLevel[2].wave.maxLoadCleared, 4);
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

  it("imports a backed-up profile and replaces same-name collisions", () => {
    const storage = createMemoryStorage();
    const now = Date.UTC(2026, 0, 1);
    createStoredProfile("Ada", storage, now);

    const backup = createDefaultProfile(now + 1000);
    backup.version = 2; // older schema should migrate through ensureProfileShape
    backup.user = { ...backup.user, id: "ada-backup", name: "Ada" };
    backup.skills.add.currentLevel = 3;
    backup.skills.add.totals.attempts = 4;

    const restored = importStoredProfile(backup, storage, now + 2000);
    const store = readProfileStore(storage, now + 2000);

    assert.equal(restored.version, 3);
    assert.equal(restored.user.id, "ada");
    assert.equal(restored.user.name, "Ada");
    assert.equal(restored.skills.add.currentLevel, 3);
    assert.equal(restored.skills.add.totals.attempts, 4);
    assert.equal(store.activeUserId, "ada");
    assert.equal(Object.values(store.profiles).filter((profile) => profile.user.name === "Ada").length, 1);

    const grace = createDefaultProfile(now + 3000);
    grace.user = { ...grace.user, id: "grace", name: "Grace" };
    const added = importStoredProfile(grace, storage, now + 4000);
    const nextStore = readProfileStore(storage, now + 4000);

    assert.equal(added.user.id, "grace");
    assert.equal(nextStore.activeUserId, "grace");
    assert.ok(nextStore.profiles.ada);
    assert.ok(nextStore.profiles.grace);
  });

  it("deletes local profiles without leaving the store inactive or empty", () => {
    const storage = createMemoryStorage();
    const now = Date.UTC(2026, 0, 1);
    createStoredProfile("Ada", storage, now);
    deleteStoredProfile("local-default", storage, now + 500);
    createStoredProfile("Ben", storage, now + 1000);
    switchStoredProfile("ada", storage, now + 2000);

    let active = deleteStoredProfile("ben", storage, now + 3000);
    let store = readProfileStore(storage, now + 3000);
    assert.equal(active.user.id, "ada");
    assert.equal(store.activeUserId, "ada");
    assert.equal(store.profiles.ben, undefined);
    assert.deepEqual(Object.keys(store.profiles), ["ada"]);

    createStoredProfile("Cara", storage, now + 4000);
    active = deleteStoredProfile("cara", storage, now + 5000);
    store = readProfileStore(storage, now + 5000);
    assert.equal(active.user.id, "ada");
    assert.equal(store.activeUserId, "ada");
    assert.equal(store.profiles.cara, undefined);

    active = deleteStoredProfile("ada", storage, now + 6000);
    store = readProfileStore(storage, now + 6000);
    assert.equal(active.user.id, "local-default");
    assert.equal(active.user.name, "Local Player");
    assert.equal(store.activeUserId, "local-default");
    assert.equal(Object.keys(store.profiles).length, 1);
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

  it("marks placed-out problems as mastered without inventing attempts", () => {
    const profile = createDefaultProfile(Date.UTC(2026, 0, 1));
    syncSettings(profile, { difficulties: { add: 2 } });
    const universe = getSkillUniverseProblems("add", 2);

    recordPlacementCredit(profile, "add", { level: 3, source: "test-me" }, Date.UTC(2026, 0, 1, 0, 1));

    const skill = profile.skills.add;
    const first = skill.problems[universe[0].statsKey];
    const summary = computeSkillReadiness(skill);

    assert.equal(skill.placementCredits.length, 1);
    assert.equal(skill.placementCredits[0].placedOutThrough, 2);
    assert.deepEqual(skill.levelAdvances.map((advance) => advance.level), [1, 2]);
    assert.deepEqual(skill.levelAdvances.map((advance) => advance.result), ["placed-out", "placed-out"]);
    assert.equal(first.attempts, 0);
    assert.equal(first.correct, 0);
    assert.equal(isPlacementPlacedOut(first), true);
    assert.equal(problemCurrentAccuracy(first), 1);
    assert.equal(problemMastery(first), 100);
    assert.equal(isBossMasteredProblem(first), true);
    assert.equal(summary.attempts, 0);
    assert.equal(summary.masteredCount, universe.length);
    assert.equal(summary.readiness, 100);
    assert.equal(summary.bossReady, true);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      recordProgressEvent(profile, {
        opKey: "add",
        statsKey: universe[0].statsKey,
        text: universe[0].text,
        outcome: "wrong",
        responseMs: 900,
      });
    }

    const updated = skill.problems[universe[0].statsKey];
    const updatedSummary = computeSkillReadiness(skill);
    assert.equal(isPlacementPlacedOut(updated), false);
    assert.equal(updated.placementStatus, "superseded");
    assert.equal(problemCurrentAccuracy(updated), 0);
    assert.equal(isBossMasteredProblem(updated), false);
    assert.equal(updatedSummary.masteredCount, universe.length - 1);
    assert.ok(updatedSummary.readiness < 100);
  });

  it("does not activate placed-out display for facts that already have enough attempts", () => {
    const profile = createDefaultProfile(Date.UTC(2026, 0, 1));
    syncSettings(profile, { difficulties: { add: 2 } });
    const [problem] = getSkillUniverseProblems("add", 2);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      recordProgressEvent(profile, {
        opKey: "add",
        statsKey: problem.statsKey,
        text: problem.text,
        outcome: "wrong",
        responseMs: 900,
      });
    }

    recordPlacementCredit(profile, "add", { level: 3, source: "test-me" }, Date.UTC(2026, 0, 1, 0, 1));

    const stored = profile.skills.add.problems[problem.statsKey];
    assert.equal(stored.attempts, 3);
    assert.equal(stored.placementStatus, "superseded");
    assert.equal(isPlacementPlacedOut(stored), false);
    assert.equal(problemCurrentAccuracy(stored), 0);
    assert.equal(problemMastery(stored), 0);
    assert.equal(isBossMasteredProblem(stored), false);
  });

  it("uses recent weighted accuracy so old misses can be overcome", () => {
    const profile = createDefaultProfile();

    for (let attempt = 0; attempt < 1000; attempt += 1) {
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
    assert.ok(problem.correct / problem.attempts < 0.02);
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

  it("focuses remaining practice at 80 percent but unlocks boss only at 100 percent", () => {
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

    assert.equal(BOSS_READY_SCORE, 100);
    assert.equal(summary.masteredCount, 39);
    assert.equal(summary.readiness, 80);
    assert.equal(summary.bossReady, false);

    const finishProblems = getFinishLevelPracticeProblems(profile.skills.add);
    assert.equal(finishProblems.length, 10);
    assert.deepEqual(finishProblems[0], {
      statsKey: "6,5",
      text: "6 + 5",
      attempts: 0,
      mastery: 0,
      currentAccuracy: 0,
      kind: "new",
    });
  });

  it("mirrors durable profile stats into legacy problemStats", () => {
    const profile = createDefaultProfile();
    const target = createProblemStats();
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

  it("builds the stats-cell hover tooltip from a problem record", () => {
    // no record yet, falls back to asked/correct and reports no attempts
    assert.equal(
      buildStatsTooltip(null, { label: "2 + 3 = 5", asked: 0, correct: 0 }),
      "2 + 3 = 5\nNo attempts yet\nCorrect: 0"
    );

    // a real record expands into the full multi-line breakdown
    const tip = buildStatsTooltip(
      { attempts: 4, correct: 3, wrong: 1, missed: 0, helped: 0 },
      { label: "6 × 7 = 42" }
    );
    const lines = tip.split("\n");
    assert.equal(lines[0], "6 × 7 = 42");
    assert.ok(lines.includes("Attempts: 4"));
    assert.ok(lines.includes("Correct: 3"));
    assert.ok(lines.includes("Wrong: 1"));
    assert.ok(lines.some((l) => l.startsWith("Lifetime accuracy: ")));
    assert.ok(lines.some((l) => l.startsWith("Boss mastered: ")));

    // "Helped" only appears when there were helped attempts
    assert.ok(
      !buildStatsTooltip({ attempts: 2, correct: 2, wrong: 0, missed: 0, helped: 0 }, {
        label: "x",
      }).includes("Helped")
    );
    assert.ok(
      buildStatsTooltip({ attempts: 3, correct: 2, wrong: 0, missed: 1, helped: 2 }, {
        label: "x",
      }).includes("Helped: 2")
    );
  });
});
