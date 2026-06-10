(() => {
const STORAGE_KEY = "rainMath.profile.v1";
const PROFILE_STORE_KEY = "rainMath.profiles.v1";
const PROFILE_VERSION = 2;
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
const PROBLEM_MASTERY_THRESHOLD = 80;

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
      pace: 5,
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

function ensureProfileShape(profile, nowMs = Date.now()) {
  if (!profile || typeof profile !== "object") return createDefaultProfile(nowMs);
  const sourceVersion = Number(profile.version || 0);
  const next = {
    ...createDefaultProfile(nowMs),
    ...profile,
    user: { ...createDefaultProfile(nowMs).user, ...(profile.user || {}) },
    settings: { ...createDefaultProfile(nowMs).settings, ...(profile.settings || {}) },
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
      bossAttempts: Array.isArray(rawSkill.bossAttempts) ? rawSkill.bossAttempts : [],
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

function recordBossAttempt(profile, opKey, nowMs = Date.now()) {
  const skill = profile.skills?.[opKey];
  if (!skill) return profile;
  if (!Array.isArray(skill.bossAttempts)) skill.bossAttempts = [];
  const level = skill.currentLevel;
  const at = nowIso(nowMs);
  if (!hasBossAttemptForLevel(skill, level)) {
    const summary = computeSkillReadiness(skill);
    skill.bossAttempts.push({
      level,
      readiness: summary.readiness,
      at,
      temporary: true,
    });
  }
  skill.updatedAt = at;
  profile.user.updatedAt = at;
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
    ...skill.problems[statsKey],
  };
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
  const at = nowIso(nowMs);
  const recentEntry = { outcome, statsKey, at };

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

  problem.lastOutcome = outcome;
  problem.lastSeenAt = at;
  skill.updatedAt = at;
  profile.user.updatedAt = at;

  recordRecent(skill, recentEntry);
  recordRecent(problem, { outcome, at, responseMs });
  updateSkillReadiness(skill);
  return profile;
}

function problemMastery(problem) {
  if (!problem || problem.attempts === 0) return 0;
  const weightedCorrect = problem.correct + problem.helped * OUTCOME_WEIGHTS.helped;
  const accuracy = weightedCorrect / problem.attempts;
  const correctConfidence = Math.min(problem.correct, 3) / 3;
  const attemptConfidence = Math.min(problem.attempts, 4) / 4;
  const streakConfidence = Math.min(problem.currentStreak, 2) / 2;
  const averageResponseMs = problem.responseCount > 0
    ? problem.totalResponseMs / problem.responseCount
    : null;
  const fluency = averageResponseMs === null
    ? 0.5
    : clamp(0, 1, (8000 - averageResponseMs) / 6000);
  const confidence =
    correctConfidence * 0.65 +
    attemptConfidence * 0.2 +
    streakConfidence * 0.1 +
    fluency * 0.05;
  return clamp(0, 100, Math.round(accuracy * confidence * 100));
}

function recentAccuracy(recent) {
  if (!recent || recent.length === 0) return 0;
  const score = recent.reduce((sum, entry) => sum + OUTCOME_WEIGHTS[normalizeOutcome(entry.outcome)], 0);
  return score / recent.length;
}

function computeSkillReadiness(skill) {
  const problems = Object.values(skill.problems);
  const attempts = skill.totals.attempts;
  const universeCount = getSkillUniverseSize(skill.opKey, skill.currentLevel);
  const requiredAttempts = getRequiredAttemptsForReady(universeCount);
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
      averageResponseMs: null,
    };
  }

  const weightedCorrect = skill.totals.correct + skill.totals.helped * OUTCOME_WEIGHTS.helped;
  const accuracy = weightedCorrect / attempts;
  const recent = recentAccuracy(skill.recent);
  const problemMasteries = problems.map(problemMastery);
  const masteredCount = problemMasteries.filter((mastery) => mastery >= PROBLEM_MASTERY_THRESHOLD).length;
  const coverageScore = universeCount > 0 ? Math.min(1, problems.length / universeCount) : 0;
  const masteryCoverage = universeCount > 0 ? Math.min(1, masteredCount / universeCount) : 0;
  const averageMastery = universeCount > 0
    ? problemMasteries.reduce((sum, mastery) => sum + mastery, 0) / universeCount / 100
    : 0;
  const averageResponseMs = skill.totals.responseCount > 0
    ? Math.round(skill.totals.totalResponseMs / skill.totals.responseCount)
    : null;
  const fluencyScore = averageResponseMs === null
    ? 0.5
    : clamp(0, 1, (8000 - averageResponseMs) / 6000);

  const readiness = clamp(
    0,
    100,
    Math.round(
      (
        averageMastery * 0.55 +
        coverageScore * 0.25 +
        masteryCoverage * 0.1 +
        recent * 0.04 +
        accuracy * 0.03 +
        fluencyScore * 0.03
      ) * 100
    )
  );
  const bossReady =
    readiness >= BOSS_READY_SCORE &&
    attempts >= requiredAttempts &&
    coverageScore >= MIN_COVERAGE_FOR_READY &&
    masteryCoverage >= MIN_MASTERED_FOR_READY &&
    recent >= MIN_RECENT_ACCURACY_FOR_READY &&
    accuracy >= MIN_ACCURACY_FOR_READY;

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
  for (const [opKey, skill] of Object.entries(profile.skills)) {
    skills[opKey] = {
      ...computeSkillReadiness(skill),
      opKey,
      currentLevel: skill.currentLevel,
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
  profile.settings = {
    ...profile.settings,
    ...settings,
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
  RECENT_LIMIT,
  STORAGE_KEY,
  computeSkillReadiness,
  createDefaultProfile,
  createEmptySkill,
  createProfileForUser,
  createStoredProfile,
  ensureProfileShape,
  getProfileList,
  getRequiredAttemptsForReady,
  getSkillUniverseSize,
  getSkillUniverseProblems,
  getPracticeSuggestions,
  getUnseenProblems,
  getWeakProblems,
  hasBossAttemptForLevel,
  mirrorLegacyProblemStats,
  problemMastery,
  readProfile,
  readProfileStore,
  recordBossAttempt,
  recordProgressEvent,
  resetStoredProfile,
  saveProfile,
  switchStoredProfile,
  summarizeProfile,
  syncSettings,
};
})();
