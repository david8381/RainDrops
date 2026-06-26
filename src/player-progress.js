(() => {
const STORAGE_KEY = "rainMath.profile.v1";
const PROFILE_STORE_KEY = "rainMath.profiles.v1";
const PROFILE_VERSION = 3;
const PROFILE_STORE_VERSION = 1;
const RECENT_LIMIT = 20;
const SESSION_LOG_LIMIT = 50;
const SESSION_RESPONSE_MS_CAP = 60000;
const BOSS_READY_SCORE = 100;
const FINISH_LEVEL_FOCUS_SCORE = 80;
const DEFAULT_START_LEVEL = 1;
const LEGACY_START_LEVEL = 3;
const MIGRATED_USER_ID = "david";
const MIGRATED_USER_NAME = "david";
const TEXT_SIZE_OPTIONS = ["normal", "large", "huge"];
const MIN_ATTEMPTS_FOR_READY = 25;
const MIN_COVERAGE_FOR_READY = 0.75;
const MIN_MASTERED_FOR_READY = 0.65;
const MIN_RECENT_ACCURACY_FOR_READY = 0.85;
const MIN_ACCURACY_FOR_READY = 0.85;
const BOSS_MASTERY_MIN_ATTEMPTS = 3;
const BOSS_MASTERY_MIN_ACCURACY = 0.9;
const PLACEMENT_STATUS_PLACED_OUT = "placed-out";
const PLACEMENT_STATUS_SUPERSEDED = "superseded";
const RECENT_ACCURACY_BLEND = 0.9;
const RECENT_ACCURACY_WEIGHTS = [0.3, 0.2, 0.15, 0.1, 0.08, 0.06, 0.04, 0.03, 0.02, 0.02];
const PROBLEM_MASTERY_THRESHOLD = 80;
const PRESSURE_TIERS = [
  {
    key: "calm",
    label: "Calm",
    min: 0,
    max: 20,
    speed: 15,
    rate: 1,
    maxActiveDrops: 4,
    waveMaxActive: 3,
    waveDelayMinMs: 700,
    waveDelayMaxMs: 1200,
    bossSpeedMultiplier: 0.55,
    bombIntervalMultiplier: 1.25,
  },
  {
    key: "steady",
    label: "Steady",
    min: 21,
    max: 45,
    speed: 30,
    rate: 3,
    maxActiveDrops: 7,
    waveMaxActive: 5,
    waveDelayMinMs: 500,
    waveDelayMaxMs: 900,
    bossSpeedMultiplier: 0.8,
    bombIntervalMultiplier: 1,
  },
  {
    key: "quick",
    label: "Quick",
    min: 46,
    max: 70,
    speed: 55,
    rate: 6,
    maxActiveDrops: 10,
    waveMaxActive: 7,
    waveDelayMinMs: 350,
    waveDelayMaxMs: 700,
    bossSpeedMultiplier: 1.08,
    bombIntervalMultiplier: 0.85,
  },
  {
    key: "blitz",
    label: "Blitz",
    min: 71,
    max: 100,
    speed: 80,
    rate: 8,
    maxActiveDrops: 13,
    waveMaxActive: 9,
    waveDelayMinMs: 250,
    waveDelayMaxMs: 550,
    bossSpeedMultiplier: 1.3,
    bombIntervalMultiplier: 0.72,
  },
];

const {
  expDiffToConversion,
  getDifficultyRange,
  getF10Universe,
  getFactorUniverse,
  getShapesUniverse,
  getPowUniverse,
  getSIPrefixesForDifficulty,
  operationDefaults,
  clamp,
} = globalThis.RainMathCore;

const OUTCOME_WEIGHTS = {
  correct: 1,
  wrong: 0,
  missed: 0,
  helped: 0.25,
};

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function normalizeSpeedPercent(value) {
  return clamp(0, 100, Math.round(Number.isFinite(value) ? value : 30));
}

function normalizeLoad(value) {
  return clamp(0, 10, Math.round(Number.isFinite(value) ? value : 3));
}

function normalizeTextSize(value) {
  return TEXT_SIZE_OPTIONS.includes(value) ? value : "normal";
}

function getPressureTierForSpeed(speedPercent = 30) {
  const speed = normalizeSpeedPercent(speedPercent);
  return PRESSURE_TIERS.find((tier) => speed >= tier.min && speed <= tier.max) || PRESSURE_TIERS[1];
}

function getPressureTier(value = "steady") {
  if (value && typeof value === "object" && value.key) return getPressureTier(value.key);
  if (typeof value === "number") return getPressureTierForSpeed(value);
  const key = String(value || "steady");
  return PRESSURE_TIERS.find((tier) => tier.key === key) || getPressureTierForSpeed(Number(value));
}

function getPressureTierIndex(key) {
  return Math.max(0, PRESSURE_TIERS.findIndex((tier) => tier.key === getPressureTier(key).key));
}

function createPressureTierStats() {
  return {
    attempts: 0,
    correct: 0,
    wrong: 0,
    missed: 0,
    helped: 0,
    totalResponseMs: 0,
    responseCount: 0,
  };
}

function createPressureTierStatsMap(raw = {}) {
  return Object.fromEntries(
    PRESSURE_TIERS.map((tier) => [
      tier.key,
      {
        ...createPressureTierStats(),
        ...(raw[tier.key] || {}),
      },
    ])
  );
}

function createSessionStats(raw = {}) {
  return {
    attempts: Math.max(0, Math.round(Number.isFinite(raw.attempts) ? raw.attempts : 0)),
    correct: Math.max(0, Math.round(Number.isFinite(raw.correct) ? raw.correct : 0)),
    wrong: Math.max(0, Math.round(Number.isFinite(raw.wrong) ? raw.wrong : 0)),
    missed: Math.max(0, Math.round(Number.isFinite(raw.missed) ? raw.missed : 0)),
    helped: Math.max(0, Math.round(Number.isFinite(raw.helped) ? raw.helped : 0)),
    totalResponseMs: Math.max(0, Math.round(Number.isFinite(raw.totalResponseMs) ? raw.totalResponseMs : 0)),
    responseCount: Math.max(0, Math.round(Number.isFinite(raw.responseCount) ? raw.responseCount : 0)),
  };
}

function createSessionChallengeStats(raw = {}) {
  return {
    started: Math.max(0, Math.round(Number.isFinite(raw.started) ? raw.started : 0)),
    completed: Math.max(0, Math.round(Number.isFinite(raw.completed) ? raw.completed : 0)),
    cleared: Math.max(0, Math.round(Number.isFinite(raw.cleared) ? raw.cleared : 0)),
    blitz: Math.max(0, Math.round(Number.isFinite(raw.blitz) ? raw.blitz : 0)),
    wave: Math.max(0, Math.round(Number.isFinite(raw.wave) ? raw.wave : 0)),
    boss: Math.max(0, Math.round(Number.isFinite(raw.boss) ? raw.boss : 0)),
    bestScore: Math.max(0, Math.round(Number.isFinite(raw.bestScore) ? raw.bestScore : 0)),
    bestBossTimeMs: Number.isFinite(raw.bestBossTimeMs) ? Math.max(0, Math.round(raw.bestBossTimeMs)) : null,
  };
}

function normalizeSessionResponseMs(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.min(SESSION_RESPONSE_MS_CAP, Math.round(value));
}

function createSessionLevelSnapshot(raw = {}, fallbackLevel = raw.level) {
  return {
    level: clamp(1, 10, Math.round(Number.isFinite(raw.level) ? raw.level : fallbackLevel || 1)),
    readiness: clamp(0, 100, Math.round(Number.isFinite(raw.readiness) ? raw.readiness : 0)),
    masteredCount: Math.max(0, Math.round(Number.isFinite(raw.masteredCount) ? raw.masteredCount : 0)),
    universeCount: Math.max(0, Math.round(Number.isFinite(raw.universeCount) ? raw.universeCount : 0)),
    attempts: Math.max(0, Math.round(Number.isFinite(raw.attempts) ? raw.attempts : 0)),
    distinct: Math.max(0, Math.round(Number.isFinite(raw.distinct) ? raw.distinct : 0)),
  };
}

function normalizeSessionLevelSnapshots(raw = {}) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, value]) => value && typeof value === "object")
      .map(([level, value]) => {
        const normalizedLevel = clamp(1, 10, Math.round(Number(level) || value.level || 1));
        return [String(normalizedLevel), createSessionLevelSnapshot(value, normalizedLevel)];
      })
  );
}

function createSessionMasterySnapshot(raw = {}) {
  return {
    ...createSessionLevelSnapshot(raw),
    levels: normalizeSessionLevelSnapshots(raw.levels),
  };
}

function createSessionOperation(raw = {}, opKey = raw.opKey || "unknown") {
  const started = createSessionMasterySnapshot(raw.started || raw.start || {});
  return {
    opKey,
    durationMs: Math.max(0, Math.round(Number.isFinite(raw.durationMs) ? raw.durationMs : 0)),
    practice: createSessionStats(raw.practice),
    assessment: createSessionStats(raw.assessment),
    challenges: createSessionChallengeStats(raw.challenges),
    started,
    ended: createSessionMasterySnapshot(raw.ended || raw.end || started),
  };
}

function normalizeSessionOperations(raw = {}) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, value]) => value && typeof value === "object")
      .map(([opKey, value]) => [opKey, createSessionOperation(value, opKey)])
  );
}

function normalizeSessionEntry(raw = {}, nowMs = Date.now()) {
  const at = nowIso(nowMs);
  const id = String(raw.id || `session-${nowMs}`);
  const startedAt = raw.startedAt || raw.createdAt || at;
  const lastSeenAt = raw.lastSeenAt || raw.endedAt || startedAt;
  return {
    id,
    startedAt,
    lastSeenAt,
    endedAt: raw.endedAt || lastSeenAt,
    userAgent: typeof raw.userAgent === "string" ? raw.userAgent.slice(0, 180) : "",
    settings: {
      speed: normalizeSpeedPercent(raw.settings?.speed),
      rate: normalizeLoad(raw.settings?.rate),
      pressureTier: getPressureTier(raw.settings?.pressureTier || raw.settings?.speed).key,
      textSize: normalizeTextSize(raw.settings?.textSize),
    },
    practice: createSessionStats(raw.practice),
    assessment: createSessionStats(raw.assessment),
    challenges: createSessionChallengeStats(raw.challenges),
    operations: normalizeSessionOperations(raw.operations),
  };
}

function normalizeSessionLog(log = [], nowMs = Date.now()) {
  if (!Array.isArray(log)) return [];
  return log
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => normalizeSessionEntry(entry, nowMs))
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, SESSION_LOG_LIMIT);
}

// Backward-compatible aliases for profiles created while this axis was named "speed".
const SPEED_TIERS = PRESSURE_TIERS;
const getSpeedTier = getPressureTierForSpeed;

function makeUserId(name, existingIds = []) {
  const base = String(name || "player")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "player";
  const existing = new Set(existingIds);
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function createEmptySkill(opKey, nowMs = Date.now()) {
  return {
    opKey,
    currentLevel: DEFAULT_START_LEVEL,
    readiness: 0,
    bossReady: false,
    bossThreshold: BOSS_READY_SCORE,
    bossAttempts: [],
    levelAdvances: [],
    totals: {
      attempts: 0,
      correct: 0,
      wrong: 0,
      missed: 0,
      helped: 0,
      distinct: 0,
      currentStreak: 0,
      bestStreak: 0,
      totalResponseMs: 0,
      responseCount: 0,
    },
    recent: [],
    problems: {},
    placementCredits: [],
    pressureTiers: createPressureTierStatsMap(),
    blitzAttempts: [],
    challengeAttempts: [],
    createdAt: nowIso(nowMs),
    updatedAt: nowIso(nowMs),
  };
}

function getSkillUniverseSize(opKey, level) {
  const range = getDifficultyRange(opKey, level);
  const count = Math.max(0, range.max - range.min + 1);

  if (opKey === "add" || opKey === "mul" || opKey === "div") {
    return count * count;
  }

  if (opKey === "sub") {
    return (count * (count + 1)) / 2;
  }

  if (opKey === "shapes") {
    return getShapesUniverse(level).length;
  }

  if (opKey === "pow") {
    return getPowUniverse(level).length;
  }

  if (opKey === "si") {
    const prefixes = getSIPrefixesForDifficulty(level);
    return prefixes.length * Math.max(0, prefixes.length - 1);
  }

  if (opKey === "factor") {
    return getFactorUniverse(level).length;
  }

  if (opKey === "f10") {
    return getF10Universe(level).length;
  }

  return Math.max(1, count);
}

function getSkillUniverseProblems(opKey, level) {
  const range = getDifficultyRange(opKey, level);
  const problems = [];

  if (opKey === "add" || opKey === "sub" || opKey === "mul" || opKey === "div") {
    const symbols = { add: "+", sub: "-", mul: "×", div: "÷" };
    for (let a = range.min; a <= range.max; a += 1) {
      for (let b = range.min; b <= range.max; b += 1) {
        if (opKey === "sub" && b > a) continue;
        const left = opKey === "div" ? a * b : a;
        const statsKey = `${a},${b}`;
        problems.push({
          statsKey,
          text: `${left} ${symbols[opKey]} ${b}`,
        });
      }
    }
    return problems;
  }

  if (opKey === "shapes") {
    return getShapesUniverse(level).map((problem) => ({ statsKey: problem.statsKey, text: problem.text }));
  }

  if (opKey === "pow") {
    return getPowUniverse(level).map((problem) => ({ statsKey: problem.statsKey, text: problem.text }));
  }

  if (opKey === "f10") {
    return getF10Universe(level);
  }

  if (opKey === "si") {
    const prefixes = getSIPrefixesForDifficulty(level);
    for (const from of prefixes) {
      for (const to of prefixes) {
        if (from === to) continue;
        const statsKey = `${from.sym || "base"},${to.sym || "base"}`;
        problems.push({
          statsKey,
          text: `${from.sym}m → ${to.sym}m`,
          answerText: expDiffToConversion(from.exp - to.exp),
        });
      }
    }
    return problems;
  }

  if (opKey === "factor") {
    return getFactorUniverse(level);
  }

  return [];
}

function getRequiredAttemptsForReady(universeCount) {
  return Math.max(MIN_ATTEMPTS_FOR_READY, Math.ceil(universeCount * 1.25));
}

function createDefaultProfile(nowMs = Date.now()) {
  const skills = {};
  for (const opKey of Object.keys(operationDefaults)) {
    skills[opKey] = createEmptySkill(opKey, nowMs);
  }
  return {
    version: PROFILE_VERSION,
    user: {
      id: "local-default",
      name: "Local Player",
      createdAt: nowIso(nowMs),
      updatedAt: nowIso(nowMs),
    },
    settings: {
      speed: 30,
      rate: 3,
      pressureTier: getPressureTierForSpeed(30).key,
      textSize: "normal",
      difficulties: Object.fromEntries(
        Object.entries(operationDefaults).map(([key, value]) => [key, value.difficulty])
      ),
    },
    skills,
    sessionLog: [],
  };
}

function createProfileForUser(name, nowMs = Date.now(), existingIds = []) {
  const profile = createDefaultProfile(nowMs);
  const userName = String(name || "").trim() || "Player";
  const userId = makeUserId(userName, existingIds);
  profile.user = {
    id: userId,
    name: userName,
    createdAt: nowIso(nowMs),
    updatedAt: nowIso(nowMs),
  };
  return profile;
}

function isDefaultLocalUser(user) {
  if (!user) return true;
  const id = user.id || "";
  const name = user.name || "";
  return (!id || id === "local-default") && (!name || name === "Local Player");
}

function normalizeMigratedProfile(profile, nowMs = Date.now()) {
  const next = ensureProfileShape(profile, nowMs);
  if (isDefaultLocalUser(next.user)) {
    next.user = {
      ...next.user,
      id: MIGRATED_USER_ID,
      name: MIGRATED_USER_NAME,
      updatedAt: nowIso(nowMs),
    };
  }
  return next;
}

function normalizeBossAttempts(attempts = []) {
  if (!Array.isArray(attempts)) return [];
  return attempts.map((attempt) => {
    const pressure = getPressureTier(
      attempt.pressureTier
        || attempt.pressureKey
        || attempt.speedTier
        || attempt.speedPercent
    );
    return {
      ...attempt,
      pressureTier: pressure.key,
      pressureTierLabel: pressure.label,
      speedPercent: Number.isFinite(attempt.speedPercent) ? attempt.speedPercent : pressure.speed,
      spawnRate: Number.isFinite(attempt.spawnRate) ? attempt.spawnRate : pressure.rate,
    };
  });
}

function normalizeLevelAdvances(advances = []) {
  if (!Array.isArray(advances)) return [];
  return advances
    .filter((advance) => advance && typeof advance === "object")
    .map((advance) => ({
      ...advance,
      level: clamp(1, 10, Math.round(Number.isFinite(advance.level) ? advance.level : 1)),
      readiness: clamp(0, 100, Math.round(Number.isFinite(advance.readiness) ? advance.readiness : 0)),
      result: advance.result || "mastered",
      inferred: Boolean(advance.inferred),
    }));
}

function normalizeBlitzAttempts(attempts = []) {
  if (!Array.isArray(attempts)) return [];
  return attempts.map((attempt) => {
    const speedPercent = normalizeSpeedPercent(attempt.speedPercent ?? attempt.maxSpeedPercent ?? attempt.score);
    const load = normalizeLoad(attempt.load ?? attempt.spawnRate ?? attempt.maxDropLimit);
    const durationMs = Number.isFinite(attempt.durationMs)
      ? Math.max(0, Math.round(attempt.durationMs))
      : null;
    const fastestDropSeconds = Number.isFinite(attempt.fastestDropSeconds)
      ? Math.max(0.1, Math.round(attempt.fastestDropSeconds * 10) / 10)
      : null;
    const scoreFallback = durationMs !== null ? Math.round(durationMs / 1000) : speedPercent;
    return {
      ...attempt,
      level: clamp(1, 10, Math.round(Number.isFinite(attempt.level) ? attempt.level : 1)),
      score: clamp(0, 999999, Math.round(Number.isFinite(attempt.score) ? attempt.score : scoreFallback)),
      durationMs,
      speedPercent,
      maxSpeedPercent: speedPercent,
      fastestDropSeconds,
      spawnRate: load,
      maxDropLimit: load,
      clearedCount: Math.max(0, Math.round(Number.isFinite(attempt.clearedCount) ? attempt.clearedCount : 0)),
      result: attempt.result || "survived",
    };
  });
}

function normalizeChallengeAttempts(attempts = []) {
  if (!Array.isArray(attempts)) return [];
  return attempts
    .filter((attempt) => attempt && typeof attempt === "object")
    .map((attempt) => {
      const type = ["blitz", "wave", "boss"].includes(attempt.type) ? attempt.type : "blitz";
      const durationMs = Number.isFinite(attempt.durationMs)
        ? Math.max(0, Math.round(attempt.durationMs))
        : null;
      const fastestDropSeconds = Number.isFinite(attempt.fastestDropSeconds)
        ? Math.max(0.1, Math.round(attempt.fastestDropSeconds * 10) / 10)
        : null;
      const maxLoadCleared = Number.isFinite(attempt.maxLoadCleared)
        ? Math.max(0, Math.round(attempt.maxLoadCleared))
        : null;
      const maxLoadReached = Number.isFinite(attempt.maxLoadReached)
        ? Math.max(0, Math.round(attempt.maxLoadReached))
        : null;
      const scoreFallback = type === "wave" && maxLoadCleared !== null
        ? maxLoadCleared
        : durationMs !== null
          ? Math.round(durationMs / 1000)
          : 0;
      const score = Number.isFinite(attempt.score)
        ? clamp(0, 999999, Math.round(attempt.score))
        : scoreFallback;
      return {
        ...attempt,
        type,
        level: clamp(1, 10, Math.round(Number.isFinite(attempt.level) ? attempt.level : 1)),
        score,
        durationMs,
        fastestDropSeconds,
        maxSpeedPercent: Number.isFinite(attempt.maxSpeedPercent)
          ? Math.max(0, Math.round(attempt.maxSpeedPercent))
          : null,
        maxDropLimit: Number.isFinite(attempt.maxDropLimit)
          ? Math.max(0, Math.round(attempt.maxDropLimit))
          : null,
        maxLoadCleared,
        maxLoadReached,
        cleared: Boolean(attempt.cleared),
        result: attempt.result || (attempt.cleared ? "cleared" : "survived"),
        clearedCount: Math.max(0, Math.round(Number.isFinite(attempt.clearedCount) ? attempt.clearedCount : 0)),
      };
    });
}

function normalizePlacementCredits(credits = []) {
  if (!Array.isArray(credits)) return [];
  return credits
    .filter((credit) => credit && typeof credit === "object")
    .map((credit) => ({
      ...credit,
      level: clamp(1, 10, Math.round(Number.isFinite(credit.level) ? credit.level : 1)),
      placedOutThrough: clamp(0, 10, Math.round(Number.isFinite(credit.placedOutThrough) ? credit.placedOutThrough : 0)),
      problemCount: Math.max(0, Math.round(Number.isFinite(credit.problemCount) ? credit.problemCount : 0)),
      result: credit.result || "placed-out",
    }));
}

function ensureProfileShape(profile, nowMs = Date.now()) {
  if (!profile || typeof profile !== "object") return createDefaultProfile(nowMs);
  const defaultProfile = createDefaultProfile(nowMs);
  const rawSettings = profile.settings || {};
  const speed = normalizeSpeedPercent(rawSettings.speed ?? getPressureTier(rawSettings.pressureTier ?? rawSettings.pressureKey).speed);
  const load = normalizeLoad(rawSettings.rate ?? rawSettings.maxActiveDrops ?? rawSettings.dropLimit);
  const textSize = normalizeTextSize(rawSettings.textSize);
  const pressure = getPressureTier(speed);
  const sourceVersion = Number(profile.version || 0);
  const next = {
    ...defaultProfile,
    ...profile,
    user: { ...defaultProfile.user, ...(profile.user || {}) },
    settings: {
      ...defaultProfile.settings,
      ...rawSettings,
      pressureTier: pressure.key,
      speed,
      rate: load,
      textSize,
    },
    sessionLog: normalizeSessionLog(profile.sessionLog, nowMs),
    // Only canonical operations are kept; skills for removed ops (e.g. legacy
    // rect/circ) are dropped rather than carried forward as orphans.
    skills: {},
  };
  next.version = PROFILE_VERSION;
  const priorSkills = profile.skills || {};
  for (const opKey of Object.keys(operationDefaults)) {
    const rawSkill = priorSkills[opKey] || {};
    const nextSkill = {
      ...createEmptySkill(opKey, nowMs),
      ...rawSkill,
      opKey,
      totals: {
        ...createEmptySkill(opKey, nowMs).totals,
        ...(rawSkill.totals || {}),
      },
      problems: { ...(rawSkill.problems || {}) },
      placementCredits: normalizePlacementCredits(rawSkill.placementCredits),
      recent: Array.isArray(rawSkill.recent) ? rawSkill.recent : [],
      bossAttempts: normalizeBossAttempts(rawSkill.bossAttempts),
      levelAdvances: normalizeLevelAdvances(rawSkill.levelAdvances),
      blitzAttempts: normalizeBlitzAttempts(rawSkill.blitzAttempts),
      challengeAttempts: normalizeChallengeAttempts(
        Array.isArray(rawSkill.challengeAttempts) && rawSkill.challengeAttempts.length > 0
          ? rawSkill.challengeAttempts
          : (rawSkill.blitzAttempts || []).map((attempt) => ({
            ...attempt,
            type: "blitz",
          }))
      ),
      pressureTiers: createPressureTierStatsMap(rawSkill.pressureTiers || rawSkill.speedTiers),
    };
    const hasPractice = nextSkill.totals.attempts > 0 || Object.keys(nextSkill.problems).length > 0;
    if (sourceVersion < PROFILE_VERSION && !hasPractice && nextSkill.currentLevel === LEGACY_START_LEVEL) {
      nextSkill.currentLevel = DEFAULT_START_LEVEL;
      if (next.settings.difficulties?.[opKey] === LEGACY_START_LEVEL) {
        next.settings.difficulties[opKey] = DEFAULT_START_LEVEL;
      }
    }
    next.skills[opKey] = nextSkill;
  }
  return next;
}

function readProfile(storage = globalThis.localStorage, nowMs = Date.now()) {
  if (!storage) return createDefaultProfile(nowMs);
  const store = readProfileStore(storage, nowMs);
  if (store.profiles[store.activeUserId]) {
    return ensureProfileShape(store.profiles[store.activeUserId], nowMs);
  }
  return createDefaultProfile(nowMs);
}

function readLegacyProfile(storage = globalThis.localStorage, nowMs = Date.now()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return ensureProfileShape(JSON.parse(raw), nowMs);
  } catch {
    return null;
  }
}

function createProfileStore(profile, nowMs = Date.now(), { migrateDefaultUser = false } = {}) {
  const rawProfile = profile || createDefaultProfile(nowMs);
  const activeProfile = migrateDefaultUser
    ? normalizeMigratedProfile(rawProfile, nowMs)
    : ensureProfileShape(rawProfile, nowMs);
  return {
    version: PROFILE_STORE_VERSION,
    activeUserId: activeProfile.user.id,
    profiles: {
      [activeProfile.user.id]: activeProfile,
    },
    createdAt: nowIso(nowMs),
    updatedAt: nowIso(nowMs),
  };
}

function ensureProfileStoreShape(store, nowMs = Date.now()) {
  if (!store || typeof store !== "object") {
    return createProfileStore(createDefaultProfile(nowMs), nowMs);
  }
  const profiles = {};
  for (const [fallbackId, rawProfile] of Object.entries(store.profiles || {})) {
    const profile = ensureProfileShape(rawProfile, nowMs);
    if (!profile.user.id) profile.user.id = fallbackId;
    profiles[profile.user.id] = profile;
  }
  if (Object.keys(profiles).length === 0) {
    return createProfileStore(createDefaultProfile(nowMs), nowMs);
  }
  const activeUserId = profiles[store.activeUserId] ? store.activeUserId : Object.keys(profiles)[0];
  return {
    version: PROFILE_STORE_VERSION,
    activeUserId,
    profiles,
    createdAt: store.createdAt || nowIso(nowMs),
    updatedAt: store.updatedAt || nowIso(nowMs),
  };
}

function readProfileStore(storage = globalThis.localStorage, nowMs = Date.now()) {
  if (!storage) return createProfileStore(createDefaultProfile(nowMs), nowMs);
  try {
    const raw = storage.getItem(PROFILE_STORE_KEY);
    if (raw) return ensureProfileStoreShape(JSON.parse(raw), nowMs);
  } catch {
    // Fall through to legacy migration/default profile.
  }
  const legacyProfile = readLegacyProfile(storage, nowMs);
  if (legacyProfile) {
    return createProfileStore(legacyProfile, nowMs, { migrateDefaultUser: true });
  }
  return createProfileStore(createDefaultProfile(nowMs), nowMs);
}

function persistProfileStore(store, storage = globalThis.localStorage, nowMs = Date.now()) {
  if (!storage) return store;
  const next = ensureProfileStoreShape({
    ...store,
    updatedAt: nowIso(nowMs),
  }, nowMs);
  try {
    storage.setItem(PROFILE_STORE_KEY, JSON.stringify(next));
    const activeProfile = next.profiles[next.activeUserId];
    if (activeProfile) storage.setItem(STORAGE_KEY, JSON.stringify(activeProfile));
  } catch {
    // Storage is best-effort; gameplay should continue if persistence is unavailable.
  }
  return next;
}

function saveProfile(profile, storage = globalThis.localStorage, nowMs = Date.now()) {
  if (!storage) return profile;
  const nextProfile = ensureProfileShape(profile, nowMs);
  const store = readProfileStore(storage, nowMs);
  store.profiles[nextProfile.user.id] = nextProfile;
  store.activeUserId = nextProfile.user.id;
  persistProfileStore(store, storage, nowMs);
  return nextProfile;
}

function resetStoredProfile(storage = globalThis.localStorage, nowMs = Date.now()) {
  const currentProfile = readProfile(storage, nowMs);
  const profile = createDefaultProfile(nowMs);
  profile.user = {
    ...profile.user,
    ...currentProfile.user,
    updatedAt: nowIso(nowMs),
  };
  saveProfile(profile, storage, nowMs);
  return profile;
}

function getProfileList(storage = globalThis.localStorage, nowMs = Date.now()) {
  const store = readProfileStore(storage, nowMs);
  return Object.values(store.profiles)
    .map((profile) => ({
      id: profile.user.id,
      name: profile.user.name,
      active: profile.user.id === store.activeUserId,
      updatedAt: profile.user.updatedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function createStoredProfile(name, storage = globalThis.localStorage, nowMs = Date.now()) {
  const store = readProfileStore(storage, nowMs);
  const profile = createProfileForUser(name, nowMs, Object.keys(store.profiles));
  store.profiles[profile.user.id] = profile;
  store.activeUserId = profile.user.id;
  persistProfileStore(store, storage, nowMs);
  return profile;
}

function switchStoredProfile(userId, storage = globalThis.localStorage, nowMs = Date.now()) {
  const store = readProfileStore(storage, nowMs);
  if (!store.profiles[userId]) return readProfile(storage, nowMs);
  store.activeUserId = userId;
  persistProfileStore(store, storage, nowMs);
  return ensureProfileShape(store.profiles[userId], nowMs);
}

function findSession(profile, sessionId) {
  if (!profile.sessionLog) profile.sessionLog = [];
  return profile.sessionLog.find((entry) => entry.id === sessionId) || null;
}

function getSkillSessionSnapshot(profile, opKey) {
  const skill = profile.skills?.[opKey];
  if (!skill) return createSessionMasterySnapshot();
  const summary = computeSkillReadiness(skill);
  return createSessionMasterySnapshot({
    level: skill.currentLevel,
    readiness: summary.readiness,
    masteredCount: summary.masteredCount,
    universeCount: summary.universeCount,
    attempts: summary.attempts,
    distinct: summary.distinct,
    levels: getSkillSessionLevelSnapshots(profile, opKey),
  });
}

function computeSkillReadinessForLevel(skill, level) {
  if (!skill) return computeSkillReadiness(skill);
  if (skill.currentLevel === level) return computeSkillReadiness(skill);
  return computeSkillReadiness({
    ...skill,
    currentLevel: level,
  });
}

function getSkillSessionLevelSnapshots(profile, opKey) {
  const skill = profile.skills?.[opKey];
  if (!skill) return {};
  const highestLevel = clamp(1, 10, Math.max(1, Math.round(skill.currentLevel || 1)));
  const levels = {};
  for (let level = 1; level <= highestLevel; level += 1) {
    const summary = computeSkillReadinessForLevel(skill, level);
    levels[String(level)] = createSessionLevelSnapshot({
      level,
      readiness: summary.readiness,
      masteredCount: summary.masteredCount,
      universeCount: summary.universeCount,
      attempts: summary.attempts,
      distinct: summary.distinct,
    }, level);
  }
  return levels;
}

function createSessionOperationFromProfile(profile, opKey) {
  const snapshot = getSkillSessionSnapshot(profile, opKey);
  return createSessionOperation({
    opKey,
    started: snapshot,
    ended: snapshot,
  }, opKey);
}

function createSessionOperations(profile) {
  return Object.fromEntries(
    Object.keys(operationDefaults).map((opKey) => [opKey, createSessionOperationFromProfile(profile, opKey)])
  );
}

function getSessionOperation(profile, session, opKey) {
  if (!opKey || !profile.skills?.[opKey]) return null;
  if (!session.operations) session.operations = {};
  if (!session.operations[opKey]) {
    session.operations[opKey] = createSessionOperationFromProfile(profile, opKey);
  }
  return session.operations[opKey];
}

function updateSessionOperationSnapshot(profile, session, opKey) {
  const operation = getSessionOperation(profile, session, opKey);
  if (!operation) return null;
  operation.ended = getSkillSessionSnapshot(profile, opKey);
  return operation;
}

function updateAllSessionOperationSnapshots(profile, session) {
  if (!session.operations) session.operations = {};
  for (const opKey of Object.keys(session.operations)) {
    updateSessionOperationSnapshot(profile, session, opKey);
  }
}

function touchSession(profile, session, nowMs = Date.now()) {
  const at = nowIso(nowMs);
  updateAllSessionOperationSnapshots(profile, session);
  session.lastSeenAt = at;
  session.endedAt = at;
  profile.user.updatedAt = at;
  return session;
}

function recordSessionStart(profile, options = {}, nowMs = Date.now()) {
  if (!profile || typeof profile !== "object") return profile;
  profile.sessionLog = normalizeSessionLog(profile.sessionLog, nowMs);
  const id = String(options.id || `session-${nowMs}`);
  const existing = findSession(profile, id);
  if (existing) {
    touchSession(profile, existing, nowMs);
    return profile;
  }
  const speed = normalizeSpeedPercent(options.speed ?? profile.settings?.speed);
  const rate = normalizeLoad(options.rate ?? options.spawnRate ?? profile.settings?.rate);
  const textSize = normalizeTextSize(options.textSize ?? profile.settings?.textSize);
  const pressure = getPressureTier(options.pressureTier || speed);
  const session = normalizeSessionEntry({
    id,
    userAgent: options.userAgent || "",
    settings: {
      speed,
      rate,
      pressureTier: pressure.key,
      textSize,
    },
  }, nowMs);
  session.operations = createSessionOperations(profile);
  profile.sessionLog.unshift(session);
  if (profile.sessionLog.length > SESSION_LOG_LIMIT) {
    profile.sessionLog.splice(SESSION_LOG_LIMIT);
  }
  profile.user.updatedAt = session.startedAt;
  return profile;
}

function recordSessionHeartbeat(profile, sessionId, nowMs = Date.now()) {
  const session = findSession(profile, sessionId);
  if (!session) return profile;
  touchSession(profile, session, nowMs);
  return profile;
}

function recordSessionEvent(profile, sessionId, event = {}, nowMs = Date.now()) {
  const session = findSession(profile, sessionId);
  if (!session) return profile;
  const outcome = normalizeOutcome(event.outcome);
  const responseMs = normalizeSessionResponseMs(event.responseMs);
  const bucket = event.assessment ? session.assessment : session.practice;
  bucket.attempts += 1;
  bucket[outcome] += 1;
  if (responseMs !== null) {
    bucket.totalResponseMs += responseMs;
    bucket.responseCount += 1;
  }
  const operation = getSessionOperation(profile, session, event.opKey);
  if (operation) {
    const opBucket = event.assessment ? operation.assessment : operation.practice;
    opBucket.attempts += 1;
    opBucket[outcome] += 1;
    if (responseMs !== null) {
      opBucket.totalResponseMs += responseMs;
      opBucket.responseCount += 1;
      operation.durationMs += responseMs;
    }
    operation.ended = getSkillSessionSnapshot(profile, event.opKey);
  }
  touchSession(profile, session, nowMs);
  return profile;
}

function recordSessionChallenge(profile, sessionId, event = {}, nowMs = Date.now()) {
  const session = findSession(profile, sessionId);
  if (!session) return profile;
  const challenges = session.challenges;
  const type = ["blitz", "wave", "boss", "full"].includes(event.type) ? event.type : "boss";
  const normalizedType = type === "full" ? "boss" : type;
  const updateChallengeStats = (target) => {
    if (event.action === "start") {
      target.started += 1;
    } else {
      target.completed += 1;
    }
    if (Object.hasOwn(target, normalizedType)) {
      target[normalizedType] += 1;
    }
    if (event.cleared) target.cleared += 1;
    if (Number.isFinite(event.score)) {
      target.bestScore = Math.max(target.bestScore, Math.round(event.score));
    }
    if (Number.isFinite(event.durationMs)) {
      const duration = Math.max(0, Math.round(event.durationMs));
      target.bestBossTimeMs = target.bestBossTimeMs === null
        ? duration
        : Math.min(target.bestBossTimeMs, duration);
    }
  };
  updateChallengeStats(challenges);
  const operation = getSessionOperation(profile, session, event.opKey);
  if (operation) {
    updateChallengeStats(operation.challenges);
    operation.ended = getSkillSessionSnapshot(profile, event.opKey);
  }
  touchSession(profile, session, nowMs);
  return profile;
}

function hasBossAttemptForLevel(skill, level = skill?.currentLevel) {
  if (!skill || !Array.isArray(skill.bossAttempts)) return false;
  return skill.bossAttempts.some((attempt) => attempt.level === level);
}

function hasLevelAdvanceForLevel(skill, level = skill?.currentLevel) {
  if (!skill || !Array.isArray(skill.levelAdvances)) return false;
  return skill.levelAdvances.some((advance) => advance.level === level);
}

function hasBossAttemptForPressureTier(skill, level = skill?.currentLevel, pressureTierKey = "calm") {
  if (!skill || !Array.isArray(skill.bossAttempts)) return false;
  const key = getPressureTier(pressureTierKey).key;
  return skill.bossAttempts.some((attempt) => attempt.level === level && attempt.pressureTier === key);
}

function getBossPressureTierClears(skill, level = skill?.currentLevel) {
  if (!skill || !Array.isArray(skill.bossAttempts)) return [];
  const cleared = new Set(
    skill.bossAttempts
      .filter((attempt) => attempt.level === level && attempt.pressureTier)
      .map((attempt) => attempt.pressureTier)
  );
  return PRESSURE_TIERS.map((tier) => ({
    ...tier,
    cleared: cleared.has(tier.key),
  }));
}

function parseBossAttemptOptions(profile, optionsOrNowMs) {
  if (typeof optionsOrNowMs === "number") {
    const speedPercent = normalizeSpeedPercent(profile.settings?.speed);
    const pressure = getPressureTier(speedPercent);
    return {
      nowMs: optionsOrNowMs,
      pressure,
      speedPercent,
      spawnRate: normalizeLoad(profile.settings?.rate),
    };
  }
  const options = optionsOrNowMs && typeof optionsOrNowMs === "object" ? optionsOrNowMs : {};
  const speedPercent = normalizeSpeedPercent(options.speedPercent ?? profile.settings?.speed);
  const pressure = getPressureTier(
    options.pressureTier
      || options.pressureKey
      || profile.settings?.pressureTier
      || speedPercent
  );
  return {
    nowMs: Number.isFinite(options.nowMs) ? options.nowMs : Date.now(),
    pressure,
    speedPercent,
    spawnRate: normalizeLoad(options.spawnRate ?? profile.settings?.rate),
  };
}

function recordBossAttempt(profile, opKey, optionsOrNowMs = Date.now()) {
  const skill = profile.skills?.[opKey];
  if (!skill) return profile;
  if (!Array.isArray(skill.bossAttempts)) skill.bossAttempts = [];
  const { nowMs, pressure, speedPercent, spawnRate } = parseBossAttemptOptions(profile, optionsOrNowMs);
  const level = skill.currentLevel;
  const at = nowIso(nowMs);
  const summary = computeSkillReadiness(skill);
  const pressureIndex = getPressureTierIndex(pressure.key);
  for (let clearedLevel = 1; clearedLevel <= level; clearedLevel += 1) {
    for (let i = 0; i <= pressureIndex; i += 1) {
      const clearedPressure = PRESSURE_TIERS[i];
      if (hasBossAttemptForPressureTier(skill, clearedLevel, clearedPressure.key)) continue;
      const inferred = !(clearedLevel === level && clearedPressure.key === pressure.key);
      skill.bossAttempts.push({
        level: clearedLevel,
        readiness: summary.readiness,
        pressureTier: clearedPressure.key,
        pressureTierLabel: clearedPressure.label,
        speedPercent: inferred ? clearedPressure.speed : speedPercent,
        spawnRate: inferred ? clearedPressure.rate : spawnRate,
        at,
        result: "cleared",
        temporary: false,
        inferred,
        clearedByLevel: level,
        clearedByPressureTier: pressure.key,
      });
    }
  }
  skill.updatedAt = at;
  profile.user.updatedAt = at;
  return profile;
}

function recordLevelAdvance(profile, opKey, options = {}) {
  const skill = profile.skills?.[opKey];
  if (!skill) return profile;
  if (!Array.isArray(skill.levelAdvances)) skill.levelAdvances = [];
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const level = clamp(1, 10, Math.round(Number.isFinite(options.level) ? options.level : skill.currentLevel));
  const at = nowIso(nowMs);
  for (let clearedLevel = 1; clearedLevel <= level; clearedLevel += 1) {
    if (hasLevelAdvanceForLevel(skill, clearedLevel)) continue;
    const summary = computeSkillReadinessForLevel(skill, clearedLevel);
    skill.levelAdvances.push({
      level: clearedLevel,
      readiness: summary.readiness,
      masteredCount: summary.masteredCount,
      universeCount: summary.universeCount,
      at,
      result: options.result || "mastered",
      inferred: clearedLevel !== level,
      advancedByLevel: level,
    });
  }
  skill.updatedAt = at;
  profile.user.updatedAt = at;
  return profile;
}

const hasBossAttemptForSpeedTier = hasBossAttemptForPressureTier;
const getBossSpeedTierClears = getBossPressureTierClears;

function getBlitzUnlockedLevel(skill) {
  if (!skill || !Array.isArray(skill.bossAttempts) || skill.bossAttempts.length === 0) return 0;
  return Math.max(0, ...skill.bossAttempts
    .filter((attempt) => attempt.result === "cleared")
    .map((attempt) => attempt.level || 0));
}

function getLevelAdvanceUnlockedLevel(skill) {
  if (!skill || !Array.isArray(skill.levelAdvances) || skill.levelAdvances.length === 0) return 0;
  return Math.max(0, ...skill.levelAdvances.map((advance) => advance.level || 0));
}

function getUnlockedLevel(skill) {
  return Math.max(getBlitzUnlockedLevel(skill), getLevelAdvanceUnlockedLevel(skill));
}

function hasModernChallengeMetric(attempt, type) {
  if (!attempt) return false;
  if (type === "blitz") return Number.isFinite(attempt.durationMs);
  if (type === "wave") return Number.isFinite(attempt.maxLoadCleared);
  return true;
}

function getChallengeScoreMetric(attempt, type) {
  if (!attempt) return 0;
  if (type === "blitz") {
    return Number.isFinite(attempt.durationMs)
      ? attempt.durationMs
      : (attempt.score || 0) * 1000;
  }
  if (type === "wave") {
    return Number.isFinite(attempt.maxLoadCleared)
      ? attempt.maxLoadCleared
      : attempt.score || 0;
  }
  return attempt.score || 0;
}

function isBetterScoreAttempt(candidate, best, type = "score") {
  if (!best) return true;
  const candidateScore = getChallengeScoreMetric(candidate, type);
  const bestScore = getChallengeScoreMetric(best, type);
  if (candidateScore !== bestScore) return candidateScore > bestScore;
  if (type === "blitz") {
    const candidateDropSeconds = Number.isFinite(candidate.fastestDropSeconds) ? candidate.fastestDropSeconds : Infinity;
    const bestDropSeconds = Number.isFinite(best.fastestDropSeconds) ? best.fastestDropSeconds : Infinity;
    if (candidateDropSeconds !== bestDropSeconds) return candidateDropSeconds < bestDropSeconds;
  }
  if (type === "wave") {
    const candidateReached = Number.isFinite(candidate.maxLoadReached) ? candidate.maxLoadReached : 0;
    const bestReached = Number.isFinite(best.maxLoadReached) ? best.maxLoadReached : 0;
    if (candidateReached !== bestReached) return candidateReached > bestReached;
  }
  const candidateCleared = candidate.clearedCount || 0;
  const bestCleared = best.clearedCount || 0;
  if (candidateCleared !== bestCleared) return candidateCleared > bestCleared;
  const candidateLevel = candidate.level || 0;
  const bestLevel = best.level || 0;
  if (candidateLevel !== bestLevel) return candidateLevel > bestLevel;
  return String(candidate.at || "") > String(best.at || "");
}

function isBetterTimeAttempt(candidate, best) {
  if (!best) return true;
  const candidateDuration = Number.isFinite(candidate.durationMs) ? candidate.durationMs : Infinity;
  const bestDuration = Number.isFinite(best.durationMs) ? best.durationMs : Infinity;
  if (candidateDuration !== bestDuration) return candidateDuration < bestDuration;
  const candidateLevel = candidate.level || 0;
  const bestLevel = best.level || 0;
  if (candidateLevel !== bestLevel) return candidateLevel > bestLevel;
  return String(candidate.at || "") > String(best.at || "");
}

function getBlitzBest(skill, level = null) {
  if (!skill || !Array.isArray(skill.blitzAttempts)) return null;
  const hasLevelFilter = Number.isFinite(level) && level > 0;
  // A level's best includes equal-or-higher (harder) levels, so a strong run at
  // an earlier level is never hidden once you advance.
  const attempts = hasLevelFilter
    ? skill.blitzAttempts.filter((attempt) => (attempt.level || 0) >= level)
    : skill.blitzAttempts;
  const modernAttempts = attempts.filter((attempt) => hasModernChallengeMetric(attempt, "blitz"));
  const candidates = modernAttempts.length > 0 ? modernAttempts : attempts;
  if (candidates.length === 0) return null;
  return candidates.reduce((best, attempt) => {
    if (isBetterScoreAttempt(attempt, best, "blitz")) return attempt;
    return best;
  }, null);
}

function getChallengeBest(skill, type, level = null) {
  if (!skill || !Array.isArray(skill.challengeAttempts)) return null;
  const hasLevelFilter = Number.isFinite(level) && level > 0;
  const attempts = skill.challengeAttempts.filter((attempt) => (
    attempt.type === type
    && (!hasLevelFilter || attempt.level >= level)
  ));
  const modernAttempts = attempts.filter((attempt) => hasModernChallengeMetric(attempt, type));
  const candidates = modernAttempts.length > 0 ? modernAttempts : attempts;
  if (candidates.length === 0) return null;
  return candidates.reduce((best, attempt) => {
    const better = type === "boss"
      ? isBetterTimeAttempt(attempt, best)
      : isBetterScoreAttempt(attempt, best, type);
    return better ? attempt : best;
  }, null);
}

function getChallengeBests(skill, level = getBlitzUnlockedLevel(skill)) {
  return {
    blitz: getChallengeBest(skill, "blitz", level),
    wave: getChallengeBest(skill, "wave", level),
    boss: getChallengeBest(skill, "boss", level),
  };
}

// Per-level challenge bests for levels 1..currentLevel. Each level shows its own
// best (or a better equal-or-higher level's), and null when never played.
function getChallengeBestsByLevel(skill) {
  const maxLevel = clamp(1, 10, Math.max(
    Math.round(skill?.currentLevel || 1),
    getUnlockedLevel(skill) + 1
  ));
  const rows = [];
  for (let level = 1; level <= maxLevel; level += 1) {
    rows.push({
      level,
      blitz: getBlitzBest(skill, level),
      wave: getChallengeBest(skill, "wave", level),
      boss: getChallengeBest(skill, "boss", level),
    });
  }
  return rows;
}

function recordChallengeAttempt(profile, opKey, options = {}) {
  const skill = profile.skills?.[opKey];
  if (!skill) return profile;
  if (!Array.isArray(skill.challengeAttempts)) skill.challengeAttempts = [];
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const at = nowIso(nowMs);
  const type = ["blitz", "wave", "boss"].includes(options.type) ? options.type : "blitz";
  const level = clamp(1, 10, Math.round(Number.isFinite(options.level) ? options.level : getBlitzUnlockedLevel(skill) || skill.currentLevel));
  const durationMs = Number.isFinite(options.durationMs) ? Math.max(0, Math.round(options.durationMs)) : null;
  const fastestDropSeconds = Number.isFinite(options.fastestDropSeconds)
    ? Math.max(0.1, Math.round(options.fastestDropSeconds * 10) / 10)
    : null;
  const maxLoadCleared = Number.isFinite(options.maxLoadCleared)
    ? Math.max(0, Math.round(options.maxLoadCleared))
    : null;
  const maxLoadReached = Number.isFinite(options.maxLoadReached)
    ? Math.max(0, Math.round(options.maxLoadReached))
    : null;
  const scoreFallback = type === "wave" && maxLoadCleared !== null
    ? maxLoadCleared
    : durationMs !== null
      ? Math.round(durationMs / 1000)
      : 0;
  skill.challengeAttempts.push({
    type,
    level,
    score: clamp(0, 999999, Math.round(Number.isFinite(options.score) ? options.score : scoreFallback)),
    durationMs,
    fastestDropSeconds,
    maxSpeedPercent: Number.isFinite(options.maxSpeedPercent)
      ? Math.max(0, Math.round(options.maxSpeedPercent))
      : null,
    maxDropLimit: Number.isFinite(options.maxDropLimit ?? options.spawnRate)
      ? Math.max(0, Math.round(options.maxDropLimit ?? options.spawnRate))
      : null,
    maxLoadCleared,
    maxLoadReached,
    cleared: Boolean(options.cleared),
    result: options.result || (options.cleared ? "cleared" : "survived"),
    clearedCount: Math.max(0, Math.round(Number.isFinite(options.clearedCount) ? options.clearedCount : 0)),
    at,
  });
  skill.updatedAt = at;
  profile.user.updatedAt = at;
  return profile;
}

function recordBlitzAttempt(profile, opKey, options = {}) {
  const skill = profile.skills?.[opKey];
  if (!skill) return profile;
  if (!Array.isArray(skill.blitzAttempts)) skill.blitzAttempts = [];
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const at = nowIso(nowMs);
  const level = clamp(1, 10, Math.round(Number.isFinite(options.level) ? options.level : getBlitzUnlockedLevel(skill) || skill.currentLevel));
  const speedPercent = normalizeSpeedPercent(options.speedPercent ?? options.maxSpeedPercent ?? profile.settings?.speed);
  const load = normalizeLoad(options.spawnRate ?? options.maxDropLimit ?? profile.settings?.rate);
  const durationMs = Number.isFinite(options.durationMs) ? Math.max(0, Math.round(options.durationMs)) : null;
  const fastestDropSeconds = Number.isFinite(options.fastestDropSeconds)
    ? Math.max(0.1, Math.round(options.fastestDropSeconds * 10) / 10)
    : null;
  const scoreFallback = durationMs !== null ? Math.round(durationMs / 1000) : speedPercent;
  skill.blitzAttempts.push({
    level,
    score: clamp(0, 999999, Math.round(Number.isFinite(options.score) ? options.score : scoreFallback)),
    durationMs,
    speedPercent,
    maxSpeedPercent: speedPercent,
    fastestDropSeconds,
    spawnRate: load,
    maxDropLimit: load,
    cleared: Boolean(options.cleared),
    result: options.result || (options.cleared ? "boss-cleared" : "survived"),
    clearedCount: Math.max(0, Math.round(Number.isFinite(options.clearedCount) ? options.clearedCount : 0)),
    at,
  });
  skill.updatedAt = at;
  profile.user.updatedAt = at;
  recordChallengeAttempt(profile, opKey, {
    ...options,
    type: "blitz",
    level,
    score: clamp(0, 999999, Math.round(Number.isFinite(options.score) ? options.score : scoreFallback)),
    durationMs,
    fastestDropSeconds,
    maxSpeedPercent: speedPercent,
    maxDropLimit: load,
    result: options.result || (options.cleared ? "boss-cleared" : "survived"),
    nowMs,
  });
  return profile;
}

function getProblemEntry(skill, statsKey, text) {
  if (!skill.problems[statsKey]) {
    skill.problems[statsKey] = {
      statsKey,
      text: text || statsKey,
      attempts: 0,
      correct: 0,
      wrong: 0,
      missed: 0,
      helped: 0,
      currentStreak: 0,
      bestStreak: 0,
      totalResponseMs: 0,
      responseCount: 0,
      lastOutcome: null,
      lastSeenAt: null,
      lastCorrectAt: null,
      recent: [],
      pressureTiers: createPressureTierStatsMap(),
    };
    skill.totals.distinct = Object.keys(skill.problems).length;
  }
  skill.problems[statsKey] = {
    statsKey,
    text: text || skill.problems[statsKey].text || statsKey,
    attempts: 0,
    correct: 0,
    wrong: 0,
    missed: 0,
    helped: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalResponseMs: 0,
    responseCount: 0,
    lastOutcome: null,
    lastSeenAt: null,
    lastCorrectAt: null,
    recent: [],
    pressureTiers: createPressureTierStatsMap(skill.problems[statsKey].pressureTiers || skill.problems[statsKey].speedTiers),
    ...skill.problems[statsKey],
  };
  skill.problems[statsKey].pressureTiers = createPressureTierStatsMap(
    skill.problems[statsKey].pressureTiers || skill.problems[statsKey].speedTiers
  );
  return skill.problems[statsKey];
}

function normalizeOutcome(outcome) {
  return Object.hasOwn(OUTCOME_WEIGHTS, outcome) ? outcome : "wrong";
}

function recordRecent(target, entry) {
  target.recent.push(entry);
  if (target.recent.length > RECENT_LIMIT) {
    target.recent.splice(0, target.recent.length - RECENT_LIMIT);
  }
}

function recordPressureTierStats(target, pressureTierKey, outcome, responseMs) {
  if (!target.pressureTiers) target.pressureTiers = createPressureTierStatsMap(target.speedTiers);
  const key = getPressureTier(pressureTierKey).key;
  if (!target.pressureTiers[key]) target.pressureTiers[key] = createPressureTierStats();
  const bucket = target.pressureTiers[key];
  bucket.attempts += 1;
  bucket[outcome] += 1;
  if (responseMs !== null) {
    bucket.totalResponseMs += responseMs;
    bucket.responseCount += 1;
  }
}

function recordProgressEvent(profile, event, nowMs = Date.now()) {
  const opKey = event.opKey;
  if (!opKey || !profile.skills[opKey]) return profile;
  const outcome = normalizeOutcome(event.outcome);
  const skill = profile.skills[opKey];
  const statsKey = event.statsKey || event.text || "unknown";
  const problem = getProblemEntry(skill, statsKey, event.text);
  const responseMs = Number.isFinite(event.responseMs) && event.responseMs >= 0
    ? Math.round(event.responseMs)
    : null;
  const pressure = getPressureTier(
    event.pressureTier
      || event.pressureKey
      || profile.settings?.pressureTier
      || event.speedPercent
      || profile.settings?.speed
  );
  const speedPercent = normalizeSpeedPercent(event.speedPercent ?? pressure.speed);
  const spawnRate = normalizeLoad(event.spawnRate ?? profile.settings?.rate);
  const at = nowIso(nowMs);
  const recentEntry = { outcome, statsKey, at, speedPercent, spawnRate, pressureTier: pressure.key };

  skill.totals.attempts += 1;
  problem.attempts += 1;
  skill.totals[outcome] += 1;
  problem[outcome] += 1;
  skill.totals.distinct = Object.keys(skill.problems).length;

  if (outcome === "correct") {
    problem.lastCorrectAt = at;
    skill.totals.currentStreak += 1;
    problem.currentStreak += 1;
    skill.totals.bestStreak = Math.max(skill.totals.bestStreak, skill.totals.currentStreak);
    problem.bestStreak = Math.max(problem.bestStreak, problem.currentStreak);
  } else {
    skill.totals.currentStreak = 0;
    problem.currentStreak = 0;
  }

  if (responseMs !== null) {
    skill.totals.totalResponseMs += responseMs;
    skill.totals.responseCount += 1;
    problem.totalResponseMs += responseMs;
    problem.responseCount += 1;
    recentEntry.responseMs = responseMs;
  }

  recordPressureTierStats(skill, pressure.key, outcome, responseMs);
  recordPressureTierStats(problem, pressure.key, outcome, responseMs);

  problem.lastOutcome = outcome;
  problem.lastSeenAt = at;
  supersedePlacementCreditIfReady(problem, at);
  skill.updatedAt = at;
  profile.user.updatedAt = at;

  recordRecent(skill, recentEntry);
  recordRecent(problem, { outcome, at, responseMs, speedPercent, spawnRate, pressureTier: pressure.key });
  updateSkillReadiness(skill);
  return profile;
}

function recordPlacementCredit(profile, opKey, options = {}, nowMs = Date.now()) {
  if (!profile?.skills?.[opKey]) return profile;
  const skill = profile.skills[opKey];
  const level = clamp(1, 10, Math.round(Number.isFinite(options.level) ? options.level : skill.currentLevel || 1));
  const placedOutThrough = clamp(
    0,
    10,
    Math.round(Number.isFinite(options.placedOutThrough) ? options.placedOutThrough : level - 1)
  );
  const source = options.source || "test-me";
  const at = nowIso(nowMs);
  const entries = placedOutThrough > 0 ? getSkillUniverseProblems(opKey, placedOutThrough) : [];

  for (const entry of entries) {
    const problem = getProblemEntry(skill, entry.statsKey, entry.text);
    problem.placementStatus = hasEnoughPracticeEvidence(problem)
      ? PLACEMENT_STATUS_SUPERSEDED
      : PLACEMENT_STATUS_PLACED_OUT;
    problem.placementLevel = level;
    problem.placementPlacedOutThrough = placedOutThrough;
    problem.placementSource = source;
    problem.placementAt = at;
    if (problem.placementStatus === PLACEMENT_STATUS_SUPERSEDED) {
      problem.placementSupersededAt = at;
    } else {
      delete problem.placementSupersededAt;
    }
  }

  if (!Array.isArray(skill.placementCredits)) skill.placementCredits = [];
  skill.placementCredits.push({
    level,
    placedOutThrough,
    problemCount: entries.length,
    result: PLACEMENT_STATUS_PLACED_OUT,
    source,
    at,
  });
  skill.placementCredits = normalizePlacementCredits(skill.placementCredits).slice(-20);
  if (placedOutThrough > 0) {
    recordLevelAdvance(profile, opKey, {
      level: placedOutThrough,
      result: "placed-out",
      nowMs,
    });
  }
  skill.totals.distinct = Object.keys(skill.problems).length;
  skill.updatedAt = at;
  profile.user.updatedAt = at;
  updateSkillReadiness(skill);
  return profile;
}

function hasEnoughPracticeEvidence(problem) {
  return (problem?.attempts || 0) >= BOSS_MASTERY_MIN_ATTEMPTS;
}

function supersedePlacementCreditIfReady(problem, at = nowIso()) {
  if (problem?.placementStatus !== PLACEMENT_STATUS_PLACED_OUT) return false;
  if (!hasEnoughPracticeEvidence(problem)) return false;
  problem.placementStatus = PLACEMENT_STATUS_SUPERSEDED;
  problem.placementSupersededAt = at;
  return true;
}

function isPlacementPlacedOut(problem) {
  return problem?.placementStatus === PLACEMENT_STATUS_PLACED_OUT && !hasEnoughPracticeEvidence(problem);
}

function problemMastery(problem) {
  if (isPlacementPlacedOut(problem) && (!problem || problem.attempts < BOSS_MASTERY_MIN_ATTEMPTS)) return 100;
  if (!problem || problem.attempts === 0) return 0;
  const accuracy = problemCurrentAccuracy(problem);
  const attemptScore = Math.min(problem.attempts, BOSS_MASTERY_MIN_ATTEMPTS) / BOSS_MASTERY_MIN_ATTEMPTS;
  const accuracyScore = Math.min(1, accuracy / BOSS_MASTERY_MIN_ACCURACY);
  const score = Math.round(attemptScore * accuracyScore * 100);
  return isBossMasteredProblem(problem) ? 100 : Math.min(79, score);
}

function weightedRecentProblemAccuracy(problem) {
  const recent = Array.isArray(problem?.recent) ? problem.recent.slice(-RECENT_ACCURACY_WEIGHTS.length).reverse() : [];
  if (recent.length === 0) return null;
  let total = 0;
  let weightTotal = 0;
  recent.forEach((entry, index) => {
    const weight = RECENT_ACCURACY_WEIGHTS[index] || 0;
    if (weight <= 0) return;
    total += (normalizeOutcome(entry.outcome) === "correct" ? 1 : 0) * weight;
    weightTotal += weight;
  });
  return weightTotal > 0 ? total / weightTotal : null;
}

function problemCurrentAccuracy(problem) {
  if (isPlacementPlacedOut(problem) && (!problem || problem.attempts <= 0)) return 1;
  if (!problem || problem.attempts <= 0) return 0;
  const lifetime = problem.correct / problem.attempts;
  const recent = weightedRecentProblemAccuracy(problem);
  if (recent === null) return lifetime;
  return clamp(0, 1, recent * RECENT_ACCURACY_BLEND + lifetime * (1 - RECENT_ACCURACY_BLEND));
}

function isBossMasteredProblem(problem) {
  if (isPlacementPlacedOut(problem) && (!problem || problem.attempts < BOSS_MASTERY_MIN_ATTEMPTS)) return true;
  if (!problem || problem.attempts < BOSS_MASTERY_MIN_ATTEMPTS) return false;
  return problemCurrentAccuracy(problem) >= BOSS_MASTERY_MIN_ACCURACY;
}

function recentAccuracy(recent) {
  if (!recent || recent.length === 0) return 0;
  const score = recent.reduce((sum, entry) => sum + OUTCOME_WEIGHTS[normalizeOutcome(entry.outcome)], 0);
  return score / recent.length;
}

function summarizePressureTierStats(pressureTiers = {}) {
  return PRESSURE_TIERS.map((tier) => {
    const stats = {
      ...createPressureTierStats(),
      ...(pressureTiers[tier.key] || {}),
    };
    const weightedCorrect = stats.correct + stats.helped * OUTCOME_WEIGHTS.helped;
    return {
      ...tier,
      attempts: stats.attempts,
      correct: stats.correct,
      wrong: stats.wrong,
      missed: stats.missed,
      helped: stats.helped,
      accuracy: stats.attempts > 0 ? weightedCorrect / stats.attempts : 0,
      averageResponseMs: stats.responseCount > 0
        ? Math.round(stats.totalResponseMs / stats.responseCount)
        : null,
    };
  });
}

const summarizeSpeedTierStats = summarizePressureTierStats;

function computeSkillReadiness(skill) {
  const problems = Object.values(skill.problems);
  const attempts = skill.totals.attempts;
  const universeCount = getSkillUniverseSize(skill.opKey, skill.currentLevel);
  const requiredAttempts = getRequiredAttemptsForReady(universeCount);
  const universeProblems = getSkillUniverseProblems(skill.opKey, skill.currentLevel);
  const hasEnumerableUniverse = universeProblems.length > 0;
  const readinessDenominator = hasEnumerableUniverse
    ? universeProblems.length
    : Math.max(universeCount, problems.length);
  if (problems.length === 0) {
    return {
      readiness: 0,
      bossReady: false,
      bossThreshold: BOSS_READY_SCORE,
      attempts,
      distinct: problems.length,
      universeCount,
      requiredAttempts,
      masteredCount: 0,
      accuracy: 0,
      recentAccuracy: 0,
      coverageScore: 0,
      masteryCoverage: 0,
      averageMastery: 0,
      fluencyScore: 0,
      weakProblems: [],
      practiceSuggestions: [],
      bossAttemptedForLevel: hasBossAttemptForLevel(skill, skill.currentLevel),
      levelAdvancedForLevel: hasLevelAdvanceForLevel(skill, skill.currentLevel),
      bossPressureTiers: getBossPressureTierClears(skill, skill.currentLevel),
      pressureTierStats: summarizePressureTierStats(skill.pressureTiers || skill.speedTiers),
      unlockedLevel: getUnlockedLevel(skill),
      blitzUnlockedLevel: getBlitzUnlockedLevel(skill),
      blitzBest: getBlitzBest(skill),
      challengeBests: getChallengeBests(skill),
      challengeBestsByLevel: getChallengeBestsByLevel(skill),
      averageResponseMs: null,
    };
  }

  const weightedCorrect = skill.totals.correct + skill.totals.helped * OUTCOME_WEIGHTS.helped;
  const accuracy = attempts > 0 ? weightedCorrect / attempts : 0;
  const recent = attempts > 0 ? recentAccuracy(skill.recent) : 0;
  const problemMasteries = problems.map(problemMastery);
  const masteredCount = hasEnumerableUniverse
    ? universeProblems.filter((problem) => isBossMasteredProblem(skill.problems[problem.statsKey])).length
    : problems.filter(isBossMasteredProblem).length;
  const coverageScore = readinessDenominator > 0 ? Math.min(1, problems.length / readinessDenominator) : 0;
  const masteryCoverage = readinessDenominator > 0 ? Math.min(1, masteredCount / readinessDenominator) : 0;
  const averageMastery = readinessDenominator > 0
    ? problemMasteries.reduce((sum, mastery) => sum + mastery, 0) / readinessDenominator / 100
    : 0;
  const averageResponseMs = skill.totals.responseCount > 0
    ? Math.round(skill.totals.totalResponseMs / skill.totals.responseCount)
    : null;
  const fluencyScore = averageResponseMs === null
    ? 0.5
    : clamp(0, 1, (8000 - averageResponseMs) / 6000);

  const readiness = readinessDenominator > 0
    ? clamp(0, 100, Math.round((masteredCount / readinessDenominator) * 100))
    : 0;
  const bossReady = readiness >= BOSS_READY_SCORE;

  return {
    readiness,
    bossReady,
    bossThreshold: BOSS_READY_SCORE,
    attempts,
    distinct: problems.length,
    universeCount,
    requiredAttempts,
    masteredCount,
    accuracy,
    recentAccuracy: recent,
    coverageScore,
    masteryCoverage,
    averageMastery,
    fluencyScore,
    weakProblems: getWeakProblems(skill, 4),
    practiceSuggestions: getPracticeSuggestions(skill, 4),
    bossAttemptedForLevel: hasBossAttemptForLevel(skill, skill.currentLevel),
    levelAdvancedForLevel: hasLevelAdvanceForLevel(skill, skill.currentLevel),
    bossPressureTiers: getBossPressureTierClears(skill, skill.currentLevel),
    pressureTierStats: summarizePressureTierStats(skill.pressureTiers || skill.speedTiers),
    unlockedLevel: getUnlockedLevel(skill),
    blitzUnlockedLevel: getBlitzUnlockedLevel(skill),
    blitzBest: getBlitzBest(skill),
    challengeBests: getChallengeBests(skill),
    challengeBestsByLevel: getChallengeBestsByLevel(skill),
    averageResponseMs,
  };
}

function updateSkillReadiness(skill) {
  const summary = computeSkillReadiness(skill);
  skill.readiness = summary.readiness;
  skill.bossReady = summary.bossReady;
  skill.bossThreshold = summary.bossThreshold;
  return summary;
}

function getWeakProblems(skill, limit = 4) {
  return Object.values(skill.problems)
    .map((problem) => ({
      statsKey: problem.statsKey,
      text: problem.text,
      attempts: problem.attempts,
      correct: problem.correct,
      mastery: problemMastery(problem),
      lastOutcome: problem.lastOutcome,
    }))
    .sort((a, b) => a.mastery - b.mastery || b.attempts - a.attempts || a.text.localeCompare(b.text))
    .slice(0, limit);
}

function getUnseenProblems(skill, limit = 4) {
  const seen = new Set(Object.keys(skill.problems));
  return getSkillUniverseProblems(skill.opKey, skill.currentLevel)
    .filter((problem) => !seen.has(problem.statsKey))
    .slice(0, limit)
    .map((problem) => ({
      ...problem,
      mastery: 0,
      kind: "new",
    }));
}

function getPracticeSuggestions(skill, limit = 4) {
  const reviewQuota = Math.max(1, Math.round(limit * 0.6));
  const review = getWeakProblems(skill, limit)
    .filter((problem) => problem.mastery < PROBLEM_MASTERY_THRESHOLD)
    .slice(0, reviewQuota)
    .map((problem) => ({ ...problem, kind: "review" }));

  const suggestions = [...review];
  const used = new Set(suggestions.map((problem) => problem.statsKey));
  const unseenNeeded = limit - suggestions.length;
  for (const problem of getUnseenProblems(skill, unseenNeeded + reviewQuota)) {
    if (suggestions.length >= limit) break;
    if (used.has(problem.statsKey)) continue;
    suggestions.push(problem);
    used.add(problem.statsKey);
  }

  if (suggestions.length < limit) {
    for (const problem of getWeakProblems(skill, limit)) {
      if (suggestions.length >= limit) break;
      if (used.has(problem.statsKey)) continue;
      suggestions.push({ ...problem, kind: "review" });
      used.add(problem.statsKey);
    }
  }

  return suggestions;
}

function getFinishLevelPracticeProblems(skill) {
  if (!skill) return [];
  const summary = computeSkillReadiness(skill);
  if (summary.readiness < FINISH_LEVEL_FOCUS_SCORE || summary.readiness >= BOSS_READY_SCORE) {
    return [];
  }
  return getSkillUniverseProblems(skill.opKey, skill.currentLevel)
    .map((problem) => {
      const stored = skill.problems[problem.statsKey];
      return {
        ...problem,
        attempts: stored?.attempts || 0,
        mastery: stored ? problemMastery(stored) : 0,
        currentAccuracy: stored ? problemCurrentAccuracy(stored) : 0,
        kind: stored ? "review" : "new",
      };
    })
    .filter((problem) => !isBossMasteredProblem(skill.problems[problem.statsKey]))
    .sort((a, b) => a.mastery - b.mastery || b.attempts - a.attempts || a.statsKey.localeCompare(b.statsKey));
}

function getSessionDurationMs(session) {
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt || session.lastSeenAt || session.startedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

function summarizeSessionStats(stats = createSessionStats()) {
  const weightedCorrect = stats.correct + stats.helped * OUTCOME_WEIGHTS.helped;
  return {
    ...stats,
    accuracy: stats.attempts > 0 ? weightedCorrect / stats.attempts : 0,
    averageResponseMs: stats.responseCount > 0
      ? Math.round(stats.totalResponseMs / stats.responseCount)
      : null,
  };
}

function summarizeSessionOperation(operation) {
  const normalized = createSessionOperation(operation, operation?.opKey);
  const practice = summarizeSessionStats(normalized.practice);
  const assessment = summarizeSessionStats(normalized.assessment);
  const levels = summarizeSessionOperationLevels(normalized);
  return {
    opKey: normalized.opKey,
    durationMs: normalized.durationMs,
    practice,
    assessment,
    totalAttempts: practice.attempts + assessment.attempts,
    totalSolved: practice.correct + assessment.correct,
    challenges: { ...normalized.challenges },
    started: { ...normalized.started },
    ended: { ...normalized.ended },
    levels,
    masteryDelta: normalized.ended.readiness - normalized.started.readiness,
    levelDelta: normalized.ended.level - normalized.started.level,
  };
}

function summarizeSessionOperationLevels(operation) {
  const startLevels = operation.started?.levels || {};
  const endLevels = operation.ended?.levels || {};
  const levels = new Set([...Object.keys(startLevels), ...Object.keys(endLevels)]);
  levels.add(String(operation.started.level));
  levels.add(String(operation.ended.level));
  return [...levels]
    .map((levelKey) => {
      const level = clamp(1, 10, Math.round(Number(levelKey) || 1));
      const started = createSessionLevelSnapshot(startLevels[levelKey] || (
        operation.started.level === level ? operation.started : { level }
      ), level);
      const ended = createSessionLevelSnapshot(endLevels[levelKey] || (
        operation.ended.level === level ? operation.ended : { level }
      ), level);
      return {
        level,
        started,
        ended,
        masteryDelta: ended.readiness - started.readiness,
        masteredDelta: ended.masteredCount - started.masteredCount,
        attemptsDelta: ended.attempts - started.attempts,
      };
    })
    .filter((entry) => (
      entry.masteryDelta !== 0
      || entry.masteredDelta !== 0
      || entry.attemptsDelta !== 0
      || entry.level === operation.started.level
      || entry.level === operation.ended.level
    ))
    .sort((a, b) => a.level - b.level);
}

function summarizeSessionLog(profile, limit = SESSION_LOG_LIMIT) {
  return normalizeSessionLog(profile?.sessionLog || [])
    .slice(0, Math.max(0, Math.round(Number.isFinite(limit) ? limit : SESSION_LOG_LIMIT)))
    .map((session) => {
      const practice = summarizeSessionStats(session.practice);
      const assessment = summarizeSessionStats(session.assessment);
      const operations = Object.values(session.operations || {})
        .map(summarizeSessionOperation)
        .filter((operation) => (
          operation.totalAttempts > 0
          || operation.durationMs > 0
          || operation.challenges.started > 0
          || operation.challenges.completed > 0
          || operation.masteryDelta !== 0
          || operation.levelDelta !== 0
        ))
        .sort((a, b) => {
          const order = Object.keys(operationDefaults);
          return order.indexOf(a.opKey) - order.indexOf(b.opKey);
        });
      return {
        id: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        lastSeenAt: session.lastSeenAt,
        durationMs: getSessionDurationMs(session),
        settings: { ...session.settings },
        practice,
        assessment,
        totalAttempts: practice.attempts + assessment.attempts,
        totalSolved: practice.correct + assessment.correct,
        challenges: { ...session.challenges },
        operations,
      };
    });
}

function summarizeProfile(profile) {
  const skills = {};
  const currentSpeedPercent = normalizeSpeedPercent(profile.settings?.speed);
  const currentSpawnRate = normalizeLoad(profile.settings?.rate);
  const currentPressureTier = getPressureTier(currentSpeedPercent);
  for (const [opKey, skill] of Object.entries(profile.skills)) {
    const readiness = computeSkillReadiness(skill);
    skills[opKey] = {
      ...readiness,
      opKey,
      currentLevel: skill.currentLevel,
      currentPressureTier: { ...currentPressureTier },
      currentSpeedPercent,
      currentSpawnRate,
      bossClearedCurrentPressureTier: hasBossAttemptForPressureTier(skill, skill.currentLevel, currentPressureTier.key),
      totals: { ...skill.totals },
    };
  }
  const skillList = Object.values(skills);
  const practiced = skillList.filter((skill) => skill.attempts > 0);
  const overallReadiness = practiced.length
    ? Math.round(practiced.reduce((sum, skill) => sum + skill.readiness, 0) / practiced.length)
    : 0;
  return {
    user: { ...profile.user },
    overallReadiness,
    practicedCount: practiced.length,
    skills,
  };
}

function syncSettings(profile, settings = {}, nowMs = Date.now()) {
  const speed = normalizeSpeedPercent(settings.speed ?? profile.settings?.speed);
  const load = normalizeLoad(settings.rate ?? settings.maxActiveDrops ?? profile.settings?.rate);
  const textSize = normalizeTextSize(settings.textSize ?? profile.settings?.textSize);
  const pressure = getPressureTier(settings.pressureTier ?? settings.pressureKey ?? speed);
  profile.settings = {
    ...profile.settings,
    ...settings,
    pressureTier: pressure.key,
    speed,
    rate: load,
    textSize,
    difficulties: {
      ...(profile.settings?.difficulties || {}),
      ...(settings.difficulties || {}),
    },
  };
  if (settings.difficulties) {
    for (const [opKey, level] of Object.entries(settings.difficulties)) {
      if (profile.skills[opKey]) {
        profile.skills[opKey].currentLevel = level;
      }
    }
  }
  profile.user.updatedAt = nowIso(nowMs);
  return profile;
}

function mirrorLegacyProblemStats(profile, targetStats) {
  for (const opKey of Object.keys(operationDefaults)) {
    targetStats[opKey] = {};
    const skill = profile.skills[opKey];
    if (!skill) continue;
    for (const [statsKey, problem] of Object.entries(skill.problems)) {
      targetStats[opKey][statsKey] = {
        asked: problem.attempts,
        correct: problem.correct,
      };
    }
  }
  return targetStats;
}

globalThis.RainMathProgress = {
  BOSS_READY_SCORE,
  MIN_ACCURACY_FOR_READY,
  MIN_ATTEMPTS_FOR_READY,
  MIN_COVERAGE_FOR_READY,
  MIN_MASTERED_FOR_READY,
  MIN_RECENT_ACCURACY_FOR_READY,
  PROFILE_VERSION,
  PROFILE_STORE_KEY,
  PROFILE_STORE_VERSION,
  DEFAULT_START_LEVEL,
  FINISH_LEVEL_FOCUS_SCORE,
  PROBLEM_MASTERY_THRESHOLD,
  PRESSURE_TIERS,
  RECENT_LIMIT,
  SESSION_LOG_LIMIT,
  SPEED_TIERS,
  STORAGE_KEY,
  PLACEMENT_STATUS_PLACED_OUT,
  computeSkillReadiness,
  createDefaultProfile,
  createEmptySkill,
  createProfileForUser,
  createStoredProfile,
  ensureProfileShape,
  getProfileList,
  getBossSpeedTierClears,
  getBossPressureTierClears,
  getChallengeBest,
  getChallengeBests,
  getBlitzBest,
  getBlitzUnlockedLevel,
  getUnlockedLevel,
  getRequiredAttemptsForReady,
  getPressureTier,
  getPressureTierForSpeed,
  getSpeedTier,
  getSkillUniverseSize,
  getSkillUniverseProblems,
  getFinishLevelPracticeProblems,
  getPracticeSuggestions,
  getUnseenProblems,
  getWeakProblems,
  hasBossAttemptForPressureTier,
  hasBossAttemptForSpeedTier,
  hasBossAttemptForLevel,
  hasLevelAdvanceForLevel,
  mirrorLegacyProblemStats,
  problemCurrentAccuracy,
  problemMastery,
  isBossMasteredProblem,
  isPlacementPlacedOut,
  readProfile,
  readProfileStore,
  recordBossAttempt,
  recordLevelAdvance,
  recordBlitzAttempt,
  recordChallengeAttempt,
  recordPlacementCredit,
  recordProgressEvent,
  recordSessionChallenge,
  recordSessionEvent,
  recordSessionHeartbeat,
  recordSessionStart,
  resetStoredProfile,
  saveProfile,
  switchStoredProfile,
  summarizeProfile,
  summarizeSessionLog,
  summarizePressureTierStats,
  summarizeSpeedTierStats,
  syncSettings,
};
})();
