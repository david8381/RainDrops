(() => {
const STORAGE_KEY = "rainMath.profile.v1";
const PROFILE_STORE_KEY = "rainMath.profiles.v1";
const PROFILE_VERSION = 3;
const PROFILE_STORE_VERSION = 1;
const RECENT_LIMIT = 20;
const BOSS_READY_SCORE = 80;
const DEFAULT_START_LEVEL = 1;
const LEGACY_START_LEVEL = 3;
const MIGRATED_USER_ID = "david";
const MIGRATED_USER_NAME = "david";
const MIN_ATTEMPTS_FOR_READY = 25;
const MIN_COVERAGE_FOR_READY = 0.75;
const MIN_MASTERED_FOR_READY = 0.65;
const MIN_RECENT_ACCURACY_FOR_READY = 0.85;
const MIN_ACCURACY_FOR_READY = 0.85;
const BOSS_MASTERY_MIN_ATTEMPTS = 3;
const BOSS_MASTERY_MIN_ACCURACY = 0.9;
const RECENT_ACCURACY_BLEND = 0.7;
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
  getSIPrefixesForDifficulty,
  isComposite,
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
    pressureTiers: createPressureTierStatsMap(),
    blitzAttempts: [],
    challengeAttempts: [],
    createdAt: nowIso(nowMs),
    updatedAt: nowIso(nowMs),
  };
}

function getFactorPowersForDifficulty(difficulty) {
  if (difficulty <= 3) return [1];
  if (difficulty <= 6) return [1, 2];
  return [1, 2, 3];
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

  if (opKey === "rect") {
    return count * count * 2;
  }

  if (opKey === "circ") {
    return count * 4;
  }

  if (opKey === "si") {
    const prefixes = getSIPrefixesForDifficulty(level);
    return prefixes.length * Math.max(0, prefixes.length - 1);
  }

  if (opKey === "factor") {
    let composites = 0;
    for (let n = range.min; n <= range.max; n += 1) {
      if (isComposite(n)) composites += 1;
    }
    return composites;
  }

  if (opKey === "f10") {
    return Math.max(30, count * getFactorPowersForDifficulty(level).length * 2);
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

  if (opKey === "rect") {
    for (let l = range.min; l <= range.max; l += 1) {
      for (let w = range.min; w <= range.max; w += 1) {
        problems.push({ statsKey: `P,${l},${w}`, text: `P▭ ${l}×${w}` });
        problems.push({ statsKey: `A,${l},${w}`, text: `A▭ ${l}×${w}` });
      }
    }
    return problems;
  }

  if (opKey === "circ") {
    for (let value = range.min; value <= range.max; value += 1) {
      problems.push({ statsKey: `Cr,${value}`, text: `C○ r=${value} =?π` });
      problems.push({ statsKey: `Cd,${value}`, text: `C○ d=${value} =?π` });
      problems.push({ statsKey: `Ar,${value}`, text: `A○ r=${value} =?π` });
      problems.push({ statsKey: `Ad,${value}`, text: `A○ d=${value} =?π` });
    }
    return problems;
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
    for (let n = range.min; n <= range.max; n += 1) {
      if (!isComposite(n)) continue;
      problems.push({ statsKey: String(n), text: String(n) });
    }
    return problems;
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
      difficulties: Object.fromEntries(
        Object.entries(operationDefaults).map(([key, value]) => [key, value.difficulty])
      ),
    },
    skills,
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

function normalizeBlitzAttempts(attempts = []) {
  if (!Array.isArray(attempts)) return [];
  return attempts.map((attempt) => {
    const speedPercent = normalizeSpeedPercent(attempt.speedPercent ?? attempt.maxSpeedPercent ?? attempt.score);
    const load = normalizeLoad(attempt.load ?? attempt.spawnRate ?? attempt.maxDropLimit);
    return {
      ...attempt,
      level: clamp(1, 10, Math.round(Number.isFinite(attempt.level) ? attempt.level : 1)),
      score: clamp(0, 100, Math.round(Number.isFinite(attempt.score) ? attempt.score : speedPercent)),
      speedPercent,
      maxSpeedPercent: speedPercent,
      spawnRate: load,
      maxDropLimit: load,
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
      const score = Number.isFinite(attempt.score)
        ? clamp(0, 999, Math.round(attempt.score))
        : 0;
      const durationMs = Number.isFinite(attempt.durationMs)
        ? Math.max(0, Math.round(attempt.durationMs))
        : null;
      return {
        ...attempt,
        type,
        level: clamp(1, 10, Math.round(Number.isFinite(attempt.level) ? attempt.level : 1)),
        score,
        durationMs,
        cleared: Boolean(attempt.cleared),
        result: attempt.result || (attempt.cleared ? "cleared" : "survived"),
      };
    });
}

function ensureProfileShape(profile, nowMs = Date.now()) {
  if (!profile || typeof profile !== "object") return createDefaultProfile(nowMs);
  const defaultProfile = createDefaultProfile(nowMs);
  const rawSettings = profile.settings || {};
  const speed = normalizeSpeedPercent(rawSettings.speed ?? getPressureTier(rawSettings.pressureTier ?? rawSettings.pressureKey).speed);
  const load = normalizeLoad(rawSettings.rate ?? rawSettings.maxActiveDrops ?? rawSettings.dropLimit);
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
    },
    skills: { ...(profile.skills || {}) },
  };
  next.version = PROFILE_VERSION;
  for (const opKey of Object.keys(operationDefaults)) {
    const rawSkill = next.skills[opKey] || {};
    const nextSkill = {
      ...createEmptySkill(opKey, nowMs),
      ...rawSkill,
      opKey,
      totals: {
        ...createEmptySkill(opKey, nowMs).totals,
        ...(rawSkill.totals || {}),
      },
      problems: { ...(rawSkill.problems || {}) },
      recent: Array.isArray(rawSkill.recent) ? rawSkill.recent : [],
      bossAttempts: normalizeBossAttempts(rawSkill.bossAttempts),
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

function hasBossAttemptForLevel(skill, level = skill?.currentLevel) {
  if (!skill || !Array.isArray(skill.bossAttempts)) return false;
  return skill.bossAttempts.some((attempt) => attempt.level === level);
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

const hasBossAttemptForSpeedTier = hasBossAttemptForPressureTier;
const getBossSpeedTierClears = getBossPressureTierClears;

function getBlitzUnlockedLevel(skill) {
  if (!skill || !Array.isArray(skill.bossAttempts) || skill.bossAttempts.length === 0) return 0;
  return Math.max(0, ...skill.bossAttempts
    .filter((attempt) => attempt.result === "cleared")
    .map((attempt) => attempt.level || 0));
}

function isBetterScoreAttempt(candidate, best) {
  if (!best) return true;
  const candidateScore = candidate.score || 0;
  const bestScore = best.score || 0;
  if (candidateScore !== bestScore) return candidateScore > bestScore;
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
  const attempts = hasLevelFilter
    ? skill.blitzAttempts.filter((attempt) => attempt.level === level)
    : skill.blitzAttempts;
  if (attempts.length === 0) return null;
  return attempts.reduce((best, attempt) => {
    if (isBetterScoreAttempt(attempt, best)) return attempt;
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
  if (attempts.length === 0) return null;
  return attempts.reduce((best, attempt) => {
    const better = type === "boss"
      ? isBetterTimeAttempt(attempt, best)
      : isBetterScoreAttempt(attempt, best);
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

function recordChallengeAttempt(profile, opKey, options = {}) {
  const skill = profile.skills?.[opKey];
  if (!skill) return profile;
  if (!Array.isArray(skill.challengeAttempts)) skill.challengeAttempts = [];
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const at = nowIso(nowMs);
  const type = ["blitz", "wave", "boss"].includes(options.type) ? options.type : "blitz";
  const level = clamp(1, 10, Math.round(Number.isFinite(options.level) ? options.level : getBlitzUnlockedLevel(skill) || skill.currentLevel));
  skill.challengeAttempts.push({
    type,
    level,
    score: clamp(0, 999, Math.round(Number.isFinite(options.score) ? options.score : 0)),
    durationMs: Number.isFinite(options.durationMs) ? Math.max(0, Math.round(options.durationMs)) : null,
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
  skill.blitzAttempts.push({
    level,
    score: clamp(0, 100, Math.round(Number.isFinite(options.score) ? options.score : speedPercent)),
    speedPercent,
    maxSpeedPercent: speedPercent,
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
    score: clamp(0, 100, Math.round(Number.isFinite(options.score) ? options.score : speedPercent)),
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
  skill.updatedAt = at;
  profile.user.updatedAt = at;

  recordRecent(skill, recentEntry);
  recordRecent(problem, { outcome, at, responseMs, speedPercent, spawnRate, pressureTier: pressure.key });
  updateSkillReadiness(skill);
  return profile;
}

function problemMastery(problem) {
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
  if (!problem || problem.attempts <= 0) return 0;
  const lifetime = problem.correct / problem.attempts;
  const recent = weightedRecentProblemAccuracy(problem);
  if (recent === null) return lifetime;
  return clamp(0, 1, recent * RECENT_ACCURACY_BLEND + lifetime * (1 - RECENT_ACCURACY_BLEND));
}

function isBossMasteredProblem(problem) {
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
  if (attempts === 0 || problems.length === 0) {
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
      bossPressureTiers: getBossPressureTierClears(skill, skill.currentLevel),
    pressureTierStats: summarizePressureTierStats(skill.pressureTiers || skill.speedTiers),
    blitzUnlockedLevel: getBlitzUnlockedLevel(skill),
    blitzBest: getBlitzBest(skill),
    challengeBests: getChallengeBests(skill),
    averageResponseMs: null,
    };
  }

  const weightedCorrect = skill.totals.correct + skill.totals.helped * OUTCOME_WEIGHTS.helped;
  const accuracy = weightedCorrect / attempts;
  const recent = recentAccuracy(skill.recent);
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
    bossPressureTiers: getBossPressureTierClears(skill, skill.currentLevel),
    pressureTierStats: summarizePressureTierStats(skill.pressureTiers || skill.speedTiers),
    blitzUnlockedLevel: getBlitzUnlockedLevel(skill),
    blitzBest: getBlitzBest(skill),
    challengeBests: getChallengeBests(skill),
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
  const pressure = getPressureTier(settings.pressureTier ?? settings.pressureKey ?? speed);
  profile.settings = {
    ...profile.settings,
    ...settings,
    pressureTier: pressure.key,
    speed,
    rate: load,
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
  PROBLEM_MASTERY_THRESHOLD,
  PRESSURE_TIERS,
  RECENT_LIMIT,
  SPEED_TIERS,
  STORAGE_KEY,
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
  getRequiredAttemptsForReady,
  getPressureTier,
  getPressureTierForSpeed,
  getSpeedTier,
  getSkillUniverseSize,
  getSkillUniverseProblems,
  getPracticeSuggestions,
  getUnseenProblems,
  getWeakProblems,
  hasBossAttemptForPressureTier,
  hasBossAttemptForSpeedTier,
  hasBossAttemptForLevel,
  mirrorLegacyProblemStats,
  problemCurrentAccuracy,
  problemMastery,
  isBossMasteredProblem,
  readProfile,
  readProfileStore,
  recordBossAttempt,
  recordBlitzAttempt,
  recordChallengeAttempt,
  recordProgressEvent,
  resetStoredProfile,
  saveProfile,
  switchStoredProfile,
  summarizeProfile,
  summarizePressureTierStats,
  summarizeSpeedTierStats,
  syncSettings,
};
})();
