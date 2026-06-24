const {
  advanceFactorDrop: advanceFactorDropCore,
  clamp,
  createDefaultOpConfig,
  createProblemStats,
  expDiffToConversion,
  makeShapeProblemFromKey,
  makeF10ProblemFromKey,
  formatF10StatsKey,
  generateWeightedProblem: generateCoreWeightedProblem,
  getDifficultyRange,
  getFactorRemainingText,
  getFullFactorization,
  getSIPrefixesForDifficulty,
  matchesFactorDrop,
  normalizeTypedValue,
  operators,
  randInt,
  recordProblemResult: recordProblemResultCore,
  resetProblemStats,
  lerp,
} = globalThis.RainMathCore;

const {
  createStoredProfile,
  getPressureTier,
  getProfileList,
  getSkillUniverseProblems,
  isBossMasteredProblem,
  mirrorLegacyProblemStats,
  problemCurrentAccuracy,
  problemMastery: getProgressProblemMastery,
  readProfile,
  recordBlitzAttempt,
  recordBossAttempt,
  recordChallengeAttempt,
  recordProgressEvent,
  recordSessionChallenge,
  recordSessionEvent,
  recordSessionHeartbeat,
  recordSessionStart,
  resetStoredProfile,
  saveProfile,
  summarizeProfile,
  summarizeSessionLog,
  switchStoredProfile,
  syncSettings,
} = globalThis.RainMathProgress;

const TEXT = globalThis.RainMathText || {};

// ============================================================
// 1. Constants and State
// ============================================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const scoreLabelEl = document.querySelector(".stats .label");
const answerInput = document.getElementById("answer");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const speedSlider = document.getElementById("speedSlider");
const speedValueEl = document.getElementById("speedValue");
const dropLimitSlider = document.getElementById("dropLimitSlider");
const dropLimitValueEl = document.getElementById("dropLimitValue");
const bossHudEl = document.getElementById("bossHud");
const bossHudTitleEl = document.getElementById("bossHudTitle");
const bossHudStatusEl = document.getElementById("bossHudStatus");
const bossHudMetaEl = document.getElementById("bossHudMeta");
const breatherHudEl = document.getElementById("breatherHud");

const opConfig = createDefaultOpConfig();

const BOSS_ANNOUNCE_MS = 1300;
const BOSS_STUN_MS = 1400;
const BOSS_VICTORY_MS = 1800;
const DEFAULT_MAX_FALL_TIME_SEC = 10;
const BLITZ_RAMP_MS = 70000;
const BLITZ_START_SPEED = 20;
const BLITZ_START_DROPS = 2;
const BLITZ_MAX_DROPS = 10;
const WAVE_TWO_BASE_SPEED = 42;
const CHALLENGE_TRANSITION_MS = 1800;
const BOSS_HUD_FRESH_MS = 2400;
const BLITZ_SHIELD_START = 20;
const BLITZ_SHIELD_MAX = 30;
const BLITZ_CORRECT_SHIELD_GAIN = 1;
const BLITZ_MISTAKE_SHIELD_LOSS = 5;
const BLITZ_SHIELD_PULSE_MS = 260;
const BLITZ_SHIELD_HIT_MS = 360;
const WAVE_TWO_SPAWN_STAGGER_MS = 340;
const WAVE_TWO_ROUND_GAP_MS = 700;
const WAVE_TWO_MAX_LOAD = 25;
const FACT_SHEET_CAP = 50;
const MAX_VISIBLE_BOSS_NODES = 6;
const PLAYER_SHIP_IDLE_ANGLE = 0;
const PLAYER_SHIP_NOSE_LENGTH = 31;
const PLAYER_SHIP_FIRE_PULSE_MS = 190;
const PLAYER_SHIP_RECOIL_MS = 150;
const PLAYER_SHIP_TURN_MS = 90;
const PLAYER_SHIP_RETURN_MS = 280;
const WELCOME_SEEN_KEY = "rainMath.welcomeSeen.v1";
const SUPPORT_URL = "https://ko-fi.com/davidedaniels";
const NUMPAD_INPUT_BY_CODE = {
  Numpad0: "0",
  Numpad1: "1",
  Numpad2: "2",
  Numpad3: "3",
  Numpad4: "4",
  Numpad5: "5",
  Numpad6: "6",
  Numpad7: "7",
  Numpad8: "8",
  Numpad9: "9",
  NumpadDecimal: ".",
  NumpadMultiply: "*",
  NumpadDivide: "/",
  NumpadSubtract: "-",
  NumpadAdd: "+",
};
const LOCK_AND_MODIFIER_KEYS = new Set([
  "Alt",
  "AltGraph",
  "CapsLock",
  "ContextMenu",
  "Control",
  "Fn",
  "FnLock",
  "Hyper",
  "Meta",
  "NumLock",
  "OS",
  "ScrollLock",
  "Shift",
  "Super",
  "Symbol",
  "SymbolLock",
]);
const LOCK_KEY_CODES = new Set(["CapsLock", "NumLock", "ScrollLock"]);
const BOSS_PART_DEFS = [
  { id: "shield", name: "Shields", kind: "shield", problemCount: 3, quartile: 0 },
  { id: "guns", name: "Guns", kind: "cannon", problemCount: 4, quartile: 1 },
  { id: "wings", name: "Wings", kind: "wing", problemCount: 4, quartile: 2 },
  { id: "core", name: "Core", kind: "core", problemCount: 4, quartile: 3 },
];

let drops = [];
let splashes = [];
let score = 0;
let gameSpeed = 30;
let dropLimit = 3;
let spawnTimer = 0;
let lastTime = 0;
let isPaused = false;
let isBreatherMode = false;
let audioCtx = null;
let nextDropId = 0;
let canvasW = 0;
let canvasH = 0;
let groundFlash = 0;
let currentInput = "";
let gameTime = 0;
let laser = null;
const playerShip = {
  angle: PLAYER_SHIP_IDLE_ANGLE,
  targetAngle: PLAYER_SHIP_IDLE_ANGLE,
  firePulseMs: 0,
  recoilMs: 0,
  lastTarget: null,
};
let ambiguousTimer = null;
let canvasDpr = 1;
const AMBIGUOUS_DELAY_MS = 400;
// Tracks `${opKey}:${level}` we have already offered a boss for, so the unlock
// toast appears once per op/level rather than on every subsequent correct answer.
const bossOfferShown = new Set();
// Parallax stars for the boss backdrop (lazily seeded once the canvas is sized).
let starfield = [];
// Captures the just-completed full-boss run for the victory summary popup.
let lastBossVictory = null;
let factorTargetId = null; // id of the targeted factor drop, or null
let bossMode = null;
let tutorialStepIndex = 0;
let tutorialFromWelcome = false;
let activeSessionId = null;

const TUTORIAL_STEPS = Array.isArray(TEXT.tutorial?.steps) ? TEXT.tutorial.steps : [];

// Problem stats: tracks every problem ever seen.
// For add/sub/mul/div: keyed by "a,b" (for div: "quotient,divisor").
// For f10: keyed by problem text.
// Each entry: { asked: number, correct: number }
const problemStats = createProblemStats();
let progressProfile = readProfile();

function createSessionId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `session-${Date.now()}-${random}`;
}

function startVisitSession({ persist = true } = {}) {
  activeSessionId = createSessionId();
  progressProfile = recordSessionStart(progressProfile, {
    id: activeSessionId,
    speed: gameSpeed,
    rate: dropLimit,
    userAgent: navigator.userAgent || "",
  });
  if (persist) saveProfile(progressProfile);
}

function recordActiveSessionOutcome(drop, outcome) {
  if (!activeSessionId || !drop?.opKey) return false;
  progressProfile = recordSessionEvent(progressProfile, activeSessionId, {
    outcome,
    opKey: drop.opKey,
    statsKey: drop.statsKey || drop.text,
    text: drop.text,
    assessment: isBossActive() || isAssessmentTarget(drop),
    responseMs: getDropResponseMs(drop),
  });
  return true;
}

function recordActiveSessionChallenge(event = {}) {
  if (!activeSessionId) return false;
  progressProfile = recordSessionChallenge(progressProfile, activeSessionId, event);
  return true;
}

function heartbeatActiveSession({ persist = false } = {}) {
  if (!activeSessionId) return;
  progressProfile = recordSessionHeartbeat(progressProfile, activeSessionId);
  if (persist) saveProfile(progressProfile);
}

function applyProfileSettingsToControls() {
  const settings = progressProfile.settings || {};
  const savedDifficulties = settings.difficulties || {};
  const summary = summarizeProfile(progressProfile);
  for (const opKey of Object.keys(opConfig)) {
    const savedLevel = savedDifficulties[opKey] ?? progressProfile.skills?.[opKey]?.currentLevel;
    // Resume at least at the level after the highest cleared boss, so a
    // temporarily lowered selector (e.g. to replay a cleared level) does not
    // strand the player below their actual progress on reload.
    const clearedNext = (summary.skills[opKey]?.blitzUnlockedLevel || 0) + 1;
    const resume = Math.max(Number.isFinite(savedLevel) ? savedLevel : 1, clearedNext);
    opConfig[opKey].difficulty = clamp(1, 10, Math.round(resume));
  }
  gameSpeed = clamp(0, 100, Math.round(Number.isFinite(settings.speed) ? settings.speed : 30));
  dropLimit = clamp(0, 10, Math.round(Number.isFinite(settings.rate) ? settings.rate : 3));
}

applyProfileSettingsToControls();
mirrorLegacyProblemStats(progressProfile, problemStats);

function resetPlayerShipVisuals() {
  playerShip.angle = PLAYER_SHIP_IDLE_ANGLE;
  playerShip.targetAngle = PLAYER_SHIP_IDLE_ANGLE;
  playerShip.firePulseMs = 0;
  playerShip.recoilMs = 0;
  playerShip.lastTarget = null;
}

function resetRunState({ resume = true, focus = true } = {}) {
  clearAmbiguousTimer();
  bossMode = null;
  isBreatherMode = false;
  factorTargetId = null;
  drops = [];
  splashes = [];
  laser = null;
  resetPlayerShipVisuals();
  score = 0;
  spawnTimer = 0;
  lastTime = 0;
  gameTime = 0;
  groundFlash = 0;
  currentInput = "";
  answerInput.value = "";
  updateScoreDisplay();
  updateKpDisplay();
  updateBossHud();
  updateBreatherHud();
  if (resume && isPaused) {
    togglePause();
  }
  if (focus) answerInput.focus();
}

function activateProfile(nextProfile, { resetRun = true } = {}) {
  progressProfile = nextProfile;
  bossOfferShown.clear();
  closeBossOffer();
  applyProfileSettingsToControls();
  startVisitSession();
  resetProblemStats(problemStats);
  mirrorLegacyProblemStats(progressProfile, problemStats);
  if (resetRun) resetRunState({ focus: false });
  updateOpChits();
  updateDifficultyDisplays();
  updateControlDisplay();
  updateScoreDisplay();
  updateReadinessDisplays();
  updateLoginLink();
  drawDrops();
}

function recordProblemResult(drop, correct) {
  recordProblemResultCore(problemStats, drop, correct);
}

function isAssessmentTarget(drop) {
  return Boolean(drop?.bossKind || drop?.targetType === "bossProblem");
}

function getDropResponseMs(drop) {
  if (!drop || !Number.isFinite(drop.createdAtMs)) return null;
  return Math.max(0, performance.now() - drop.createdAtMs);
}

function recordLearningResult(drop, outcome) {
  if (!drop || !drop.opKey) return;
  if (isBossActive() || isAssessmentTarget(drop)) {
    const sessionChanged = recordActiveSessionOutcome(drop, outcome);
    if (sessionChanged) saveProfile(progressProfile);
    return;
  }
  recordProblemResult(drop, outcome === "correct");
  progressProfile = recordProgressEvent(progressProfile, {
    opKey: drop.opKey,
    statsKey: drop.statsKey || drop.text,
    text: drop.text,
    outcome,
    responseMs: getDropResponseMs(drop),
    pressureTier: getActivePressure().key,
    speedPercent: getActivePressure().speed,
    spawnRate: getActivePressure().rate,
  });
  recordActiveSessionOutcome(drop, outcome);
  saveProfile(progressProfile);
  updateReadinessDisplays();
  maybeOfferBoss(drop.opKey);
}

function getUnclearedDrops() {
  return drops.filter((drop) => isDropVisible(drop) && !drop.revealed);
}

function updateBreatherHud() {
  if (!breatherHudEl) return;
  breatherHudEl.classList.toggle("hidden", !isBreatherMode);
  if (isBreatherMode) {
    const remaining = getUnclearedDrops().length;
    breatherHudEl.textContent = remaining > 0
      ? `Breather: clear ${remaining} to resume`
      : "Breather cleared";
  }
}

function maybeExitBreatherMode() {
  if (!isBreatherMode) return;
  if (getUnclearedDrops().length > 0) {
    updateBreatherHud();
    return;
  }
  isBreatherMode = false;
  spawnTimer = 0;
  lastTime = 0;
  updateBreatherHud();
}

function enterBreatherMode() {
  if (isPaused || isBossActive() || isBreatherMode || getUnclearedDrops().length === 0) return false;
  isBreatherMode = true;
  clearAmbiguousTimer();
  answerInput.focus();
  updateBreatherHud();
  return true;
}

function exitBreatherMode() {
  if (!isBreatherMode) return;
  isBreatherMode = false;
  updateBreatherHud();
}

function syncProgressSettings({ persist = true } = {}) {
  const difficulties = Object.fromEntries(
    Object.entries(opConfig).map(([opKey, config]) => [opKey, config.difficulty])
  );
  progressProfile = syncSettings(progressProfile, {
    pressureTier: getPressureTier(gameSpeed).key,
    speed: gameSpeed,
    rate: dropLimit,
    difficulties,
  });
  if (persist) saveProfile(progressProfile);
}

// ============================================================
// 2. Utility Functions
// ============================================================

function getSearchParams() {
  return new URLSearchParams(window.location.search);
}

function isTestMode() {
  return getSearchParams().has("test");
}

function storageGet(key) {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // LocalStorage can be unavailable in privacy modes; the menu still works.
  }
}

function storageRemove(key) {
  try {
    window.localStorage?.removeItem(key);
  } catch {
    // Ignore unavailable localStorage.
  }
}

function getText(path, fallback = path) {
  const value = path.split(".").reduce((node, key) => (
    node && Object.prototype.hasOwnProperty.call(node, key) ? node[key] : undefined
  ), TEXT);
  return typeof value === "string" ? value : fallback;
}

function formatText(template, values = {}) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function shouldShowWelcomeOnLoad() {
  const params = getSearchParams();
  if (params.has("welcome")) return true;
  if (params.has("test")) return false;
  return storageGet(WELCOME_SEEN_KEY) !== "1";
}

function markWelcomeSeen() {
  storageSet(WELCOME_SEEN_KEY, "1");
}

function clearWelcomeSeenFlag() {
  storageRemove(WELCOME_SEEN_KEY);
}

function isLockOrModifierKey(event) {
  return LOCK_AND_MODIFIER_KEYS.has(event.key) || LOCK_KEY_CODES.has(event.code);
}

function isNumLockKey(event) {
  return event.key === "NumLock" || event.code === "NumLock";
}

function refocusAnswerInputSoon() {
  if (document.getElementById("welcomeOverlay") || document.getElementById("tutorialOverlay")) return;
  setTimeout(() => {
    if (!isPaused && !isBossStunned()) answerInput.focus();
  }, 0);
}

function getKeyboardText(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return "";
  if (NUMPAD_INPUT_BY_CODE[event.code]) return NUMPAD_INPUT_BY_CODE[event.code];
  return event.key && event.key.length === 1 ? event.key : "";
}

function getNumpadTextForLockedState(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return "";
  if (!NUMPAD_INPUT_BY_CODE[event.code]) return "";
  return event.key && event.key.length === 1 ? "" : NUMPAD_INPUT_BY_CODE[event.code];
}

function appendTypedText(text) {
  if (!text || isPaused || isBossStunned()) return;
  answerInput.focus();
  answerInput.value = currentInput + text;
  currentInput = answerInput.value;
  processInput(currentInput);
  updateKpDisplay();
}

// ============================================================
// 3. Practice Controls
// ============================================================

function getCurrentPressure() {
  const tier = getPressureTier(gameSpeed);
  const speedRatio = gameSpeed / 100;
  return {
    ...tier,
    key: tier.key,
    label: tier.label,
    speed: gameSpeed,
    rate: dropLimit,
    maxActiveDrops: dropLimit,
    waveMaxActive: clamp(1, 10, Math.max(1, dropLimit)),
    waveDelayMinMs: Math.round(lerp(900, 260, speedRatio)),
    waveDelayMaxMs: Math.round(lerp(1400, 560, speedRatio)),
    bossSpeedMultiplier: lerp(0.55, 1.35, speedRatio),
    bombIntervalMultiplier: lerp(1.35, 0.7, speedRatio),
  };
}

function getActivePressure() {
  return bossMode?.pressure || getCurrentPressure();
}

function setPracticeControls({ speed = gameSpeed, drops = dropLimit } = {}, { persist = true } = {}) {
  gameSpeed = clamp(0, 100, Math.round(Number.isFinite(speed) ? speed : gameSpeed));
  dropLimit = clamp(0, 10, Math.round(Number.isFinite(drops) ? drops : dropLimit));
  if (persist) syncProgressSettings();
  updateControlDisplay();
  updateReadinessDisplays();
}

// Drop fall time model:
//   Each normal drop gets a random fall time between 3s and a fixed max.
//   baseSpeed (px/sec) = canvasH / fallTime, then Speed applies as a multiplier.
function getMaxFallTime() {
  return DEFAULT_MAX_FALL_TIME_SEC;
}

function getRandomBaseSpeed() {
  const maxTime = getMaxFallTime();
  // Random fall time between 3s and maxTime
  const fallTimeSec = maxTime <= 3 ? 3 : 3 + Math.random() * (maxTime - 3);
  return canvasH / fallTimeSec;
}

function getSpeedMultiplier() {
  return gameSpeed / 100;
}

function getBossSpeedMultiplier() {
  return 1;
}

function getSpawnInterval() {
  if (dropLimit === 0) return Infinity;
  return lerp(2200, 500, gameSpeed / 100);
}

function getMaxDrops() {
  return dropLimit;
}

function getBossWaveMaxActive() {
  return getActivePressure().waveMaxActive;
}

function getBossWaveDelayMs() {
  const pressure = getActivePressure();
  return randInt(pressure.waveDelayMinMs, pressure.waveDelayMaxMs);
}

// ============================================================
// 4. Difficulty Mapping
// ============================================================

// ============================================================
// 5. Operation Toggle Functions
// ============================================================

function getEnabledOps() {
  return Object.keys(opConfig).filter((key) => opConfig[key].enabled);
}

// Operations are grouped into compatible "sets". Ops in the same set can be
// practiced together; turning on an op from a different set turns off the
// incompatible ones so wildly different answer formats never share the board.
const OP_SETS = {
  add: "arithmetic",
  sub: "arithmetic",
  mul: "arithmetic",
  div: "arithmetic",
  f10: "arithmetic",
  shapes: "shapes",
  si: "si",
  factor: "factor",
};

function getOpSet(opKey) {
  return OP_SETS[opKey] || opKey;
}

function toggleOp(opKey) {
  if (!opConfig[opKey]) return;
  const turningOn = !opConfig[opKey].enabled;
  opConfig[opKey].enabled = turningOn;
  if (turningOn) {
    // Disable any enabled op from a different set.
    const set = getOpSet(opKey);
    for (const key of Object.keys(opConfig)) {
      if (key !== opKey && opConfig[key].enabled && getOpSet(key) !== set) {
        opConfig[key].enabled = false;
      }
    }
  }
  // Clear any on-screen drops whose operation is no longer enabled (we are not
  // mixing across sets), but leave boss/challenge drops alone.
  if (!isBossActive()) {
    drops = drops.filter((drop) => opConfig[drop.opKey]?.enabled);
    if (factorTargetId !== null && !drops.some((drop) => drop.id === factorTargetId)) {
      factorTargetId = null;
    }
  }
  updateOpChits();
}

function getProgressSkill(opKey) {
  return summarizeProfile(progressProfile).skills[opKey];
}

function showReadyRequired(opKey) {
  const labels = document.querySelectorAll(`.diff-ready[data-op="${opKey}"], .kp-diff-ready[data-op="${opKey}"]`);
  labels.forEach((label) => {
    label.classList.add("needs-ready");
    label.textContent = "Beat Boss first";
  });
  window.setTimeout(updateReadinessDisplays, 1200);
}

function showBossLocked(opKey) {
  const labels = document.querySelectorAll(`.diff-ready[data-op="${opKey}"], .kp-diff-ready[data-op="${opKey}"]`);
  labels.forEach((label) => {
    label.classList.add("needs-ready");
    label.textContent = "Reach 80% mastery";
  });
  window.setTimeout(updateReadinessDisplays, 1400);
}

function canAdvanceDifficulty(opKey, nextLevel) {
  const currentLevel = opConfig[opKey].difficulty;
  if (nextLevel <= currentLevel) return true;
  return Boolean(getProgressSkill(opKey)?.bossAttemptedForLevel);
}

function markReadyForBoss(opKey) {
  if (!progressProfile.skills?.[opKey]) return;
  const pressure = getCurrentPressure();
  progressProfile = recordBossAttempt(progressProfile, opKey, {
    pressureTier: pressure.key,
    speedPercent: pressure.speed,
    spawnRate: pressure.rate,
  });
  saveProfile(progressProfile);
  updateReadinessDisplays();
}

function setDifficulty(opKey, level, { force = false } = {}) {
  if (!opConfig[opKey]) return;
  const nextLevel = clamp(1, 10, level);
  if (!force && !canAdvanceDifficulty(opKey, nextLevel)) {
    showReadyRequired(opKey);
    return;
  }
  opConfig[opKey].difficulty = nextLevel;
  syncProgressSettings();
  updateDifficultyDisplays();
}

// ============================================================
// 6. Problem Generation
// ============================================================

function getProfileMasteryForGeneration(opKey, statsKey) {
  const problem = progressProfile.skills?.[opKey]?.problems?.[statsKey];
  return problem ? getProgressProblemMastery(problem) / 100 : null;
}

function generateWeightedProblem(opKey) {
  return generateCoreWeightedProblem(opKey, opConfig, problemStats, Math.random, getProfileMasteryForGeneration);
}

function pickRandomEnabledOp() {
  const enabled = getEnabledOps();
  if (enabled.length === 0) return null;
  return enabled[Math.floor(Math.random() * enabled.length)];
}

// ============================================================
// 6b. Boss Mode
// ============================================================

function isBossActive() {
  return Boolean(bossMode?.active);
}

function isBossStunned() {
  return Boolean(bossMode?.active && bossMode.stunMs > 0);
}

function copyProblemToTarget(problem, target) {
  target.text = problem.text;
  target.answer = problem.answer;
  target.answerText = problem.answerText || String(problem.answer);
  target.opKey = problem.opKey;
  target.statsKey = problem.statsKey || problem.text;
  target.createdAtMs = performance.now();
  if (problem.opKey === "factor") {
    target.answer = null;
    target.answerText = null;
    target.factorOriginal = problem.factorOriginal;
    target.factorRemaining = problem.factorRemaining;
    target.factorCollected = { ...problem.factorCollected };
    target.factorLastPrime = null;
    target.factorComplete = false;
  }
  return target;
}

function getProblemAnswerKey(problem) {
  if (problem.opKey === "factor") return `factor:${problem.factorOriginal}`;
  return String(problem.answerText || problem.answer);
}

function getProblemIdentityKey(problem) {
  if (problem.opKey === "factor") return `factor:${problem.factorOriginal}`;
  return problem.statsKey || problem.text || getProblemAnswerKey(problem);
}

function makeProblemFromUniverseEntry(opKey, entry, level = opConfig[opKey]?.difficulty) {
  if (!entry) return null;
  const statsKey = entry.statsKey;
  if (["add", "sub", "mul", "div"].includes(opKey)) {
    const [a, b] = statsKey.split(",").map(Number);
    const op = operators[opKey];
    const left = opKey === "div" ? a * b : a;
    const answer = opKey === "div" ? a : op.fn(a, b);
    return {
      text: `${left} ${op.symbol} ${b}`,
      answer,
      answerText: String(answer),
      opKey,
      statsKey,
    };
  }
  if (opKey === "shapes") {
    return makeShapeProblemFromKey(statsKey);
  }
  if (opKey === "f10") {
    return makeF10ProblemFromKey(statsKey);
  }
  if (opKey === "si") {
    const [fromSym, toSym] = statsKey.split(",");
    const prefixes = getSIPrefixesForDifficulty(level);
    const from = prefixes.find((prefix) => (prefix.sym || "base") === fromSym);
    const to = prefixes.find((prefix) => (prefix.sym || "base") === toSym);
    if (!from || !to) return null;
    const baseUnit = "m";
    const answerText = entry.answerText || expDiffToConversion(from.exp - to.exp);
    return {
      text: `${from.sym}${baseUnit} → ${to.sym}${baseUnit}`,
      answer: answerText,
      answerText,
      opKey,
      statsKey,
    };
  }
  if (opKey === "factor") {
    const n = Number(statsKey);
    return {
      text: String(n),
      answer: null,
      answerText: null,
      opKey,
      statsKey: String(n),
      factorOriginal: n,
      factorRemaining: n,
      factorCollected: {},
      factorLastPrime: null,
    };
  }
  return null;
}

function getRankedLevelProblems(opKey, level) {
  return getSkillUniverseProblems(opKey, level)
    .map((entry) => {
      const problem = getProgressProblem(opKey, entry.statsKey);
      const mastery = problem ? getProgressProblemMastery(problem) : 0;
      return {
        ...entry,
        mastery,
        attempts: problem?.attempts || 0,
      };
    })
    .sort((a, b) => b.mastery - a.mastery || b.attempts - a.attempts || a.statsKey.localeCompare(b.statsKey));
}

function getBossProblemPool(opKey, level, quartile = 3) {
  const ranked = getRankedLevelProblems(opKey, level);
  if (ranked.length === 0) return [];
  const bucketSize = Math.max(1, Math.ceil(ranked.length / 4));
  const start = Math.min(ranked.length - 1, Math.max(0, quartile) * bucketSize);
  const end = quartile >= 3 ? ranked.length : Math.min(ranked.length, start + bucketSize);
  return ranked.slice(start, end);
}

function makeBossProblem(opKey, usedKeys = new Set(), getKey = getProblemAnswerKey, level = opConfig[opKey]?.difficulty) {
  let fallback = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const originalLevel = opConfig[opKey]?.difficulty;
    if (Number.isFinite(level)) opConfig[opKey].difficulty = level;
    const problem = generateWeightedProblem(opKey);
    if (Number.isFinite(originalLevel)) opConfig[opKey].difficulty = originalLevel;
    if (!problem) continue;
    fallback = fallback || problem;
    const key = getKey(problem);
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      return problem;
    }
  }
  return fallback;
}

function makeBossProblemFromPool(opKey, pool, usedKeys = new Set(), getKey = getProblemAnswerKey, level = opConfig[opKey]?.difficulty) {
  const candidates = Array.isArray(pool) ? pool : [];
  for (let attempt = 0; attempt < Math.max(24, candidates.length * 2); attempt += 1) {
    const entry = candidates.length ? candidates[randInt(0, candidates.length - 1)] : null;
    const problem = makeProblemFromUniverseEntry(opKey, entry, level);
    if (!problem) break;
    const key = getKey(problem);
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      return problem;
    }
  }
  return makeBossProblem(opKey, usedKeys, getKey, level);
}

function makeBossDrop(problem, bossKind, index = 0, total = 1) {
  const padding = 54;
  const randomX = randInt(padding, Math.max(padding, canvasW - padding));
  const span = Math.max(1, total - 1);
  const evenX = total === 1
    ? canvasW / 2
    : padding + ((canvasW - padding * 2) * index) / span;
  const isWave = bossKind?.startsWith("wave");
  const fallSeconds = bossKind === "bomb"
    ? getBossBombFallSeconds()
    : isWave
      ? randInt(58, 88) / 10
      : 7.5;
  const drop = copyProblemToTarget(problem, {
    id: nextDropId++,
    x: isWave ? randomX : evenX,
    y: isWave ? -30 - randInt(0, 80) : -30 - index * 6,
    baseSpeed: canvasH / fallSeconds,
    bossKind,
  });
  return drop;
}

function shuffleArray(items, rng = Math.random) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function splitIntoGroups(items, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  items.forEach((item, index) => groups[index % groupCount].push(item));
  return groups;
}

// The final mothership is a "fact sheet": it holds the whole current-level
// problem universe (capped at FACT_SHEET_CAP, randomly sampled) split across the
// ship parts. Nodes start hidden and are revealed in small capped batches so the
// player never faces an ambiguous wall of answers. Operations without an
// enumerable universe (e.g. f10) fall back to generated per-part problems.
function buildBossParts(opKey, level = opConfig[opKey]?.difficulty) {
  const universe = getSkillUniverseProblems(opKey, level);
  let groups = null;
  if (universe.length > 0) {
    const selected = shuffleArray(universe).slice(0, FACT_SHEET_CAP);
    const problems = selected
      .map((entry) => makeProblemFromUniverseEntry(opKey, entry, level))
      .filter(Boolean);
    groups = splitIntoGroups(problems, BOSS_PART_DEFS.length);
  }

  const usedProblems = new Set();
  return BOSS_PART_DEFS.map((partDef, partIndex) => {
    const part = {
      id: partDef.id,
      name: partDef.name,
      kind: partDef.kind,
      destroyed: false,
      locked: partDef.id !== "shield",
      x: canvasW / 2,
      y: 90,
      w: 90,
      h: 42,
      problems: [],
    };
    let problemObjs;
    if (groups) {
      problemObjs = groups[partIndex] || [];
    } else {
      const pool = getBossProblemPool(opKey, level, partDef.quartile);
      problemObjs = [];
      for (let i = 0; i < partDef.problemCount; i += 1) {
        problemObjs.push(makeBossProblemFromPool(opKey, pool, usedProblems, getProblemIdentityKey, level));
      }
    }
    part.problems = problemObjs.filter(Boolean).map((problem, i) => copyProblemToTarget(problem, {
      targetType: "bossProblem",
      id: `${partDef.id}-${i}`,
      partId: partDef.id,
      partName: partDef.name,
      partKind: partDef.kind,
      slotIndex: i,
      destroyed: false,
      revealed: false,
      locked: part.locked,
      x: canvasW / 2,
      y: 90,
      w: 62,
      h: 30,
    }));
    return part;
  });
}

// Small universes (e.g. SI/factor at low levels) can leave trailing parts with no
// nodes. An empty part never fires a node-destroyed event, so collapse it here;
// if that empties the core (or every part), the mothership is defeated.
function collapseEmptyBossParts() {
  if (!bossMode?.parts || bossMode.phase !== "boss") return;
  for (const part of bossMode.parts) {
    if (part.destroyed) continue;
    const live = part.problems.filter((problem) => !problem.destroyed).length;
    if (live > 0) break; // only leading/active empties are auto-cleared
    createBossDebris(part);
    part.destroyed = true;
    updateBossPartLocks();
    if (part.id === "core") {
      completeBossVictory();
      return;
    }
  }
}

// Reveal nodes from the active (unlocked) part up to MAX_VISIBLE_BOSS_NODES,
// skipping any whose answer collides with an already-active node or bomb so a
// typed answer can never clear the wrong target.
function refillBossReveals() {
  if (!bossMode?.parts || bossMode.phase !== "boss") return;
  const activePart = bossMode.parts.find((part) => !part.destroyed && !part.locked);
  if (!activePart) return;

  const activeKeys = new Set();
  bossMode.parts.forEach((part) => part.problems.forEach((problem) => {
    if (problem.revealed && !problem.destroyed) activeKeys.add(getProblemAnswerKey(problem));
  }));
  drops.filter((drop) => drop.bossKind === "bomb").forEach((drop) => activeKeys.add(getProblemAnswerKey(drop)));

  let revealedCount = activePart.problems.filter((problem) => problem.revealed && !problem.destroyed).length;
  for (const problem of activePart.problems) {
    if (revealedCount >= MAX_VISIBLE_BOSS_NODES) break;
    if (problem.revealed || problem.destroyed) continue;
    const key = getProblemAnswerKey(problem);
    if (activeKeys.has(key)) continue;
    problem.revealed = true;
    activeKeys.add(key);
    revealedCount += 1;
  }
}

function startBossMode(opKey, { mode = "full", level = opConfig[opKey]?.difficulty, force = false } = {}) {
  if (!opConfig[opKey]) return;
  if (mode === "full" && !force && !getProgressSkill(opKey)?.bossReady) {
    showBossLocked(opKey);
    return false;
  }
  const pressure = getCurrentPressure();
  exitBreatherMode();
  closeStatsPopup();
  closeResultsPopup();
  closeLoginPopup();
  clearAmbiguousTimer();
  drops = [];
  splashes = [];
  laser = null;
  resetPlayerShipVisuals();
  factorTargetId = null;
  currentInput = "";
  answerInput.value = "";
  spawnTimer = 0;
  lastTime = 0;
  gameTime = 0;
  groundFlash = 0;
  score = 0;
  const startsWithChallenge = mode === "full" || mode === "blitz" || mode === "wave";
  bossMode = {
    active: true,
    mode,
    opKey,
    level,
    pressure: { ...pressure },
    phase: startsWithChallenge ? "announce" : "announce",
    announceMs: BOSS_ANNOUNCE_MS,
    nextAction: startsWithChallenge ? "challenge" : "boss",
    message: mode === "wave"
      ? "Wave 2: load ladder"
      : mode === "boss"
        ? "Mothership incoming"
        : mode === "blitz"
          ? "Blitz: shield endurance"
          : "Wave 1: shields up",
    parts: buildBossParts(opKey, level),
    debris: [],
    bombTimerMs: 500,
    stunMs: 0,
    victoryMs: 0,
    transitionMs: 0,
    transitionAction: null,
    burstMs: 0,
    challengeType: mode === "wave" ? "wave" : "blitz",
    challengeElapsedMs: 0,
    challengeLoad: mode === "wave" ? 1 : BLITZ_START_DROPS,
    blitzElapsedMs: 0,
    blitzScore: 0,
    blitzClearedCount: 0,
    blitzShield: BLITZ_SHIELD_START,
    blitzShieldMax: BLITZ_SHIELD_MAX,
    blitzShieldPulseMs: 0,
    blitzShieldHitMs: 0,
    blitzHits: 0,
    blitzFinalScore: 0,
    blitzFinalSpeed: 0,
    blitzFinalDrops: 0,
    blitzFinalShields: BLITZ_SHIELD_START,
    waveTwoSpeedPercent: WAVE_TWO_BASE_SPEED,
    hudFreshMs: BOSS_HUD_FRESH_MS,
    lastHudMessage: null,
    bossStartedAtMs: 0,
  };
  recordActiveSessionChallenge({
    action: "start",
    type: mode,
    opKey,
    level,
  });
  saveProfile(progressProfile);
  updateBossPartLocks();
  updateScoreDisplay();
  updateKpDisplay();
  updateBossHud();
  updateControlDisplay();
  answerInput.focus();
  drawDrops();
  return true;
}

function getBlitzUnlockedLevel(opKey) {
  return summarizeProfile(progressProfile).skills[opKey]?.blitzUnlockedLevel || 0;
}

function startBlitzMode(opKey) {
  const level = getBlitzUnlockedLevel(opKey);
  if (level <= 0) return false;
  startBossMode(opKey, { mode: "blitz", level });
  return true;
}

function startWaveMode(opKey) {
  const level = getBlitzUnlockedLevel(opKey);
  if (level <= 0) return false;
  startBossMode(opKey, { mode: "wave", level });
  return true;
}

function startBossReplayMode(opKey) {
  const level = getBlitzUnlockedLevel(opKey);
  if (level <= 0) return false;
  startBossMode(opKey, { mode: "boss", level, force: true });
  return true;
}

function startBossAnnouncement(message, nextAction = "boss") {
  bossMode.phase = "announce";
  bossMode.message = message;
  bossMode.announceMs = BOSS_ANNOUNCE_MS;
  bossMode.nextAction = nextAction;
  updateBossHud();
}

function startChallenge(type = "blitz") {
  drops = [];
  bossMode.phase = "challenge";
  bossMode.challengeType = type === "wave" ? "wave" : "blitz";
  bossMode.message = bossMode.challengeType === "wave"
    ? "Wave 2: load ladder"
    : bossMode.mode === "blitz"
      ? "Blitz: shield endurance"
      : "Wave 1: shield endurance";
  bossMode.challengeElapsedMs = 0;
  bossMode.blitzElapsedMs = 0;
  bossMode.blitzScore = 0;
  bossMode.blitzClearedCount = 0;
  bossMode.blitzShield = BLITZ_SHIELD_START;
  bossMode.blitzShieldPulseMs = 0;
  bossMode.blitzShieldHitMs = 0;
  bossMode.blitzHits = 0;
  bossMode.blitzFinalScore = 0;
  bossMode.challengeLoad = bossMode.challengeType === "wave" ? 1 : BLITZ_START_DROPS;
  bossMode.waveRoundSpawned = 0;
  bossMode.bombTimerMs = 250;
  if (bossMode.challengeType === "wave" && !Number.isFinite(bossMode.waveTwoSpeedPercent)) {
    bossMode.waveTwoSpeedPercent = WAVE_TWO_BASE_SPEED;
  }
  updateBossHud();
}

function startBossFight() {
  drops = [];
  bossMode.phase = "boss";
  bossMode.message = "Take down the mothership";
  bossMode.bombTimerMs = 900;
  bossMode.bossStartedAtMs = performance.now();
  updateBossPartLocks();
  collapseEmptyBossParts();
  refillBossReveals();
  updateBossHud();
}

function updateBossPartLocks() {
  if (!bossMode?.parts) return;
  const order = ["shield", "guns", "wings", "core"];
  let locked = false;
  for (const id of order) {
    const part = bossMode.parts.find((candidate) => candidate.id === id);
    if (!part) continue;
    part.locked = locked;
    part.problems.forEach((problem) => {
      problem.locked = locked;
    });
    if (!part.destroyed) locked = true;
  }
}

function updateBossPartPositions() {
  if (!bossMode?.parts) return;
  const shipW = Math.min(560, Math.max(340, canvasW * 0.74));
  const shipH = Math.min(185, Math.max(138, canvasH * 0.32));
  const left = (canvasW - shipW) / 2;
  const top = 48;
  const positions = {
    shield: { x: left + shipW * 0.5, y: top + shipH * 0.2, w: 220, h: 54 },
    guns: { x: left + shipW * 0.5, y: top + shipH * 0.45, w: 250, h: 52 },
    wings: { x: left + shipW * 0.5, y: top + shipH * 0.66, w: shipW * 0.78, h: 58 },
    core: { x: left + shipW * 0.5, y: top + shipH * 0.52, w: 154, h: 62 },
  };
  bossMode.shipBounds = { left, top, w: shipW, h: shipH };
  for (const part of bossMode.parts) {
    Object.assign(part, positions[part.id] || positions.core);
    positionBossProblems(part);
  }
}

function positionBossProblems(part) {
  // Only revealed nodes are answerable/drawn; lay them out in a centered grid so
  // the capped batch (<= MAX_VISIBLE_BOSS_NODES) reads like a small worksheet.
  const liveProblems = part.problems.filter((problem) => !problem.destroyed && problem.revealed);
  const count = liveProblems.length;
  if (count === 0) return;

  const wide = ["si", "shapes"].includes(bossMode?.opKey);
  const nodeW = wide ? 86 : 56;
  const nodeH = 26;
  const gapX = 8;
  const gapY = 6;
  const cols = Math.min(wide ? 2 : 3, count);
  const rows = Math.ceil(count / cols);
  const gridW = cols * nodeW + (cols - 1) * gapX;
  const gridH = rows * nodeH + (rows - 1) * gapY;
  const startX = part.x - gridW / 2 + nodeW / 2;
  const startY = part.y - gridH / 2 + nodeH / 2;

  liveProblems.forEach((problem, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    problem.w = nodeW;
    problem.h = nodeH;
    problem.x = startX + col * (nodeW + gapX);
    problem.y = startY + row * (nodeH + gapY);
    problem.locked = part.locked;
  });
}

function getActiveBossParts() {
  if (!bossMode?.active || bossMode.phase !== "boss") return [];
  updateBossPartLocks();
  updateBossPartPositions();
  return bossMode.parts
    .filter((part) => !part.destroyed && !part.locked)
    .flatMap((part) => part.problems.filter((problem) => !problem.destroyed && !problem.locked && problem.revealed));
}

function getBlitzProgress() {
  if (!bossMode?.active) return 0;
  return clamp(0, 1, (bossMode.challengeElapsedMs || bossMode.blitzElapsedMs || 0) / BLITZ_RAMP_MS);
}

function smoothProgress(value) {
  const t = clamp(0, 1, value);
  return t * t * (3 - 2 * t);
}

function getBlitzRampProgress() {
  return smoothProgress(getBlitzProgress());
}

function getBlitzScore() {
  // Both Wave 1 and Wave 2 score on the number of problems solved.
  return Math.min(999, bossMode?.blitzClearedCount || 0);
}

function getBlitzSpeedPercent() {
  if (bossMode?.challengeType === "wave") {
    return clamp(25, 65, Math.round(Number.isFinite(bossMode.waveTwoSpeedPercent) ? bossMode.waveTwoSpeedPercent : WAVE_TWO_BASE_SPEED));
  }
  return Math.round(lerp(BLITZ_START_SPEED, 85, getBlitzRampProgress()));
}

function getBlitzDropLimit() {
  if (bossMode?.challengeType === "wave") {
    return clamp(1, WAVE_TWO_MAX_LOAD, Math.max(1, bossMode.challengeLoad || 1));
  }
  return BLITZ_START_DROPS;
}

function getBlitzShieldRatio() {
  if (!bossMode?.active || !["challenge", "challengeComplete"].includes(bossMode.phase)) return 0;
  const max = bossMode.blitzShieldMax || BLITZ_SHIELD_MAX;
  const shield = Number.isFinite(bossMode.blitzShield) ? bossMode.blitzShield : BLITZ_SHIELD_START;
  return max > 0 ? clamp(0, 1, shield / max) : 0;
}

function changeBlitzShield(delta, reason = "hit") {
  if (!bossMode?.active || bossMode.phase !== "challenge") return;
  const max = bossMode.blitzShieldMax || BLITZ_SHIELD_MAX;
  const current = Number.isFinite(bossMode.blitzShield) ? bossMode.blitzShield : BLITZ_SHIELD_START;
  const next = clamp(0, max, current + delta);
  bossMode.blitzShield = next;

  if (delta > 0) {
    bossMode.blitzClearedCount += 1;
    bossMode.blitzShieldPulseMs = BLITZ_SHIELD_PULSE_MS;
    bossMode.message = next >= max ? "Shields at maximum" : `Shields reinforced +${delta}`;
  } else if (delta < 0) {
    bossMode.blitzHits += 1;
    bossMode.blitzShieldHitMs = BLITZ_SHIELD_HIT_MS;
    bossMode.message = reason === "wrong"
      ? `Wrong answer: shields ${delta}`
      : `Bomb hit: shields ${delta}`;
  }

  if (next <= 0 && delta < 0) {
    completeChallengeFailure();
  } else {
    updateBossHud();
  }
}

function getBossPartCount() {
  if (!bossMode?.parts) return { remaining: 0, total: 0, problemsRemaining: 0, problemsTotal: 0 };
  const total = bossMode.parts.length;
  const remaining = bossMode.parts.filter((part) => !part.destroyed).length;
  const problemsTotal = bossMode.parts.reduce((sum, part) => sum + part.problems.length, 0);
  const problemsRemaining = bossMode.parts.reduce(
    (sum, part) => sum + part.problems.filter((problem) => !problem.destroyed).length,
    0
  );
  return { remaining, total, problemsRemaining, problemsTotal };
}

function createBossDebris(part) {
  if (!bossMode?.debris) return;
  bossMode.debris.push({
    id: `${part.id}-${Date.now()}-${bossMode.debris.length}`,
    kind: part.kind,
    x: part.x,
    y: part.y,
    w: part.w,
    h: part.h,
    vx: randInt(-45, 45),
    vy: randInt(110, 170),
    rotation: randInt(-20, 20) / 100,
    spin: randInt(-120, 120) / 1000,
    life: 3200,
    maxLife: 3200,
    grounded: false,
  });
}

function updateBossDebris(dt) {
  if (!bossMode?.debris?.length) return;
  const groundY = canvasH - 42;
  bossMode.debris.forEach((piece) => {
    piece.life -= dt;
    if (!piece.grounded) {
      piece.x += (piece.vx * dt) / 1000;
      piece.y += (piece.vy * dt) / 1000;
      piece.vy += (260 * dt) / 1000;
      piece.rotation += piece.spin * dt;
      if (piece.y + piece.h / 2 >= groundY) {
        piece.y = groundY - piece.h / 2;
        piece.vx *= 0.25;
        piece.vy = 0;
        piece.spin *= 0.35;
        piece.grounded = true;
      }
    } else {
      piece.rotation += piece.spin * dt;
    }
  });
  bossMode.debris = bossMode.debris.filter((piece) => piece.life > 0);
}

function getBossBombFallSeconds() {
  if (bossMode?.phase === "challenge") {
    if (bossMode.challengeType === "wave") {
      return lerp(5.4, 3.8, getBlitzSpeedPercent() / 100);
    }
    return lerp(5.4, 2.2, getBlitzRampProgress());
  }
  if (!bossMode?.parts) return 4.8;
  const wingsAlive = bossMode.parts.some((part) => part.id === "wings" && !part.destroyed);
  return wingsAlive ? 4.8 : 6.0;
}

function getBossBombIntervalMs() {
  if (bossMode?.phase === "challenge") {
    if (bossMode.challengeType === "wave") {
      return Math.max(360, 1150 - (getBlitzDropLimit() - 1) * 90);
    }
    return Math.round(lerp(2200, 700, getBlitzRampProgress()));
  }
  if (!bossMode?.parts) return 2200;
  const gunsAlive = bossMode.parts.some((part) => part.id === "guns" && !part.destroyed);
  const wingsAlive = bossMode.parts.some((part) => part.id === "wings" && !part.destroyed);
  if (!gunsAlive) return Infinity;
  const base = Math.max(2200, 3600 - (wingsAlive ? 450 : 0));
  return Math.max(1800, Math.round(base * getActivePressure().bombIntervalMultiplier));
}

function findBossProblemById(partId, problemId) {
  const part = bossMode?.parts?.find((candidate) => candidate.id === partId);
  if (!part) return null;
  return part.problems.find((problem) => problem.id === problemId) || null;
}

function getBossMissileSourceNode(usedAnswers = new Set()) {
  if (!bossMode?.parts || bossMode.phase !== "boss") return null;
  const activePart = bossMode.parts.find((part) => !part.destroyed && !part.locked);
  const allCandidates = bossMode.parts.flatMap((part) => part.problems).filter((problem) => (
    !problem.destroyed
    && !usedAnswers.has(getProblemAnswerKey(problem))
  ));
  const activeCandidates = activePart
    ? allCandidates.filter((problem) => problem.partId === activePart.id)
    : [];
  const pools = [
    activeCandidates.filter((problem) => !problem.revealed),
    allCandidates.filter((problem) => !problem.revealed),
    activeCandidates,
    allCandidates,
  ];
  const pool = pools.find((candidates) => candidates.length > 0) || [];
  if (pool.length === 0) return null;
  return pool[randInt(0, pool.length - 1)];
}

function spawnBossBomb() {
  if (!bossMode?.active || !["boss", "challenge"].includes(bossMode.phase)) return false;
  const interval = getBossBombIntervalMs();
  if (!Number.isFinite(interval)) return false;
  const usedAnswers = new Set([...drops, ...getActiveBossParts()].map((target) => getProblemAnswerKey(target)));
  const sourceNode = bossMode.phase === "boss" ? getBossMissileSourceNode(usedAnswers) : null;
  if (bossMode.phase === "boss" && !sourceNode) return false;
  const problem = sourceNode || makeBossProblem(bossMode.opKey, usedAnswers, getProblemAnswerKey, bossMode.level);
  if (!problem) return false;
  const bomb = makeBossDrop(problem, "bomb", 0, 1);
  if (sourceNode) {
    bomb.bossSourcePartId = sourceNode.partId;
    bomb.bossSourceNodeId = sourceNode.id;
  }
  const source = bossMode.phase === "boss"
    ? bossMode.parts.find((part) => part.id === "guns" && !part.destroyed)
    : null;
  bomb.x = source ? source.x + randInt(-80, 80) : randInt(54, Math.max(54, canvasW - 54));
  // Challenge bombs appear just inside the top so they are readable/answerable
  // immediately; boss missiles launch from the firing gun.
  bomb.y = source ? source.y + 28 : 8;
  bomb.baseSpeed = canvasH / getBossBombFallSeconds();
  drops.push(bomb);
  return true;
}

function recordActiveChallengeAttempt(result = "survived") {
  if (!bossMode?.active) return;
  const type = bossMode.challengeType === "wave" ? "wave" : "blitz";
  bossMode.blitzFinalScore = getBlitzScore();
  bossMode.blitzFinalSpeed = getBlitzSpeedPercent();
  bossMode.blitzFinalDrops = getBlitzDropLimit();
  bossMode.blitzFinalShields = Math.max(0, Math.round(bossMode.blitzShield || 0));
  // Remember each wave's solved count for the end-of-run victory summary.
  bossMode.fullRunScores = bossMode.fullRunScores || {};
  bossMode.fullRunScores[type] = bossMode.blitzFinalScore;
  if (type === "blitz") {
    const progressPct = Math.round(getBlitzProgress() * 100);
    bossMode.waveTwoSpeedPercent = clamp(32, 58, Math.round(34 + progressPct * 0.24));
  }
  if (type === "blitz") {
    progressProfile = recordBlitzAttempt(progressProfile, bossMode.opKey, {
      level: bossMode.level,
      score: bossMode.blitzFinalScore,
      speedPercent: bossMode.blitzFinalSpeed,
      spawnRate: bossMode.blitzFinalDrops,
      clearedCount: bossMode.blitzClearedCount || 0,
      cleared: false,
      result,
    });
  } else {
    progressProfile = recordChallengeAttempt(progressProfile, bossMode.opKey, {
      type,
      level: bossMode.level,
      score: bossMode.blitzFinalScore,
      clearedCount: bossMode.blitzClearedCount || 0,
      cleared: false,
      result,
    });
  }
  if (bossMode.mode !== "full") {
    recordActiveSessionChallenge({
      action: "complete",
      type,
      opKey: bossMode.opKey,
      level: bossMode.level,
      score: bossMode.blitzFinalScore,
      result,
      cleared: false,
    });
  }
  saveProfile(progressProfile);
  updateReadinessDisplays();
}

function completeChallengeFailure() {
  if (!bossMode?.active || bossMode.phase !== "challenge") return;
  const type = bossMode.challengeType === "wave" ? "wave" : "blitz";
  recordActiveChallengeAttempt("shields-down");
  bossMode.phase = "challengeComplete";
  bossMode.burstMs = CHALLENGE_TRANSITION_MS;
  bossMode.transitionMs = CHALLENGE_TRANSITION_MS;
  drops = [];
  if (bossMode.mode === "full" && type === "blitz") {
    bossMode.message = "Shields are down. Super weapon sweeping the sky.";
    bossMode.transitionAction = "wave";
  } else if (bossMode.mode === "full" && type === "wave") {
    bossMode.message = "Backup shields are down. Super weapon clears the path.";
    bossMode.transitionAction = "boss";
  } else {
    bossMode.message = type === "wave"
      ? `Backup shields are down. Wave 2 solved: ${bossMode.blitzFinalScore}`
      : `Shields are down. Blitz solved: ${bossMode.blitzFinalScore}`;
    bossMode.transitionAction = "end";
  }
  updateBossHud();
}

function applyBossStun() {
  if (!bossMode?.active) return;
  if (bossMode.phase === "challenge") {
    changeBlitzShield(-BLITZ_MISTAKE_SHIELD_LOSS, "bomb");
    return;
  }
  bossMode.stunMs = BOSS_STUN_MS;
  bossMode.message = "Bomb hit: stunned";
  answerInput.value = "";
  currentInput = "";
  updateKpDisplay();
  updateBossHud();
}

// Wave 2 is a load ladder gated on clearing each round: spawn N bombs (staggered
// so they are readable), wait until the whole batch is cleared, then step to N+1.
function updateWaveTwoRound(activeBombs) {
  const load = bossMode.challengeLoad;
  if (bossMode.waveRoundSpawned < load) {
    if (bossMode.bombTimerMs <= 0) {
      spawnBossBomb();
      bossMode.waveRoundSpawned += 1;
      bossMode.bombTimerMs = WAVE_TWO_SPAWN_STAGGER_MS;
    }
  } else if (activeBombs === 0 && bossMode.bombTimerMs <= 0) {
    bossMode.challengeLoad = Math.min(WAVE_TWO_MAX_LOAD, load + 1);
    bossMode.waveRoundSpawned = 0;
    bossMode.bombTimerMs = WAVE_TWO_ROUND_GAP_MS;
    bossMode.message = `Wave 2: ${bossMode.challengeLoad} at once`;
  }
}

function updateBossMode(dt) {
  if (!bossMode?.active) return;
  bossMode.hudFreshMs = Math.max(0, (bossMode.hudFreshMs || 0) - dt);
  updateBossDebris(dt);
  if (bossMode.phase === "challenge" || bossMode.phase === "challengeComplete") {
    bossMode.blitzShieldPulseMs = Math.max(0, (bossMode.blitzShieldPulseMs || 0) - dt);
    bossMode.blitzShieldHitMs = Math.max(0, (bossMode.blitzShieldHitMs || 0) - dt);
    bossMode.burstMs = Math.max(0, (bossMode.burstMs || 0) - dt);
  }

  if (bossMode.stunMs > 0) {
    bossMode.stunMs = Math.max(0, bossMode.stunMs - dt);
    if (bossMode.stunMs === 0 && bossMode.phase === "boss") {
      bossMode.message = "Destroy the ship parts";
      bossMode.bombTimerMs = Math.max(bossMode.bombTimerMs, 900);
    }
    updateBossHud();
    return;
  }

  if (bossMode.phase === "announce") {
    bossMode.announceMs -= dt;
    if (bossMode.announceMs <= 0) {
      if (bossMode.nextAction === "challenge") {
        startChallenge(bossMode.challengeType);
      } else {
        startBossFight();
      }
    }
    return;
  }

  if (bossMode.phase === "challenge") {
    bossMode.challengeElapsedMs += dt;
    bossMode.blitzElapsedMs = bossMode.challengeElapsedMs;
    bossMode.blitzScore = getBlitzScore();
    bossMode.bombTimerMs -= dt;
    const activeBombs = drops.filter((drop) => drop.bossKind === "bomb").length;
    if (bossMode.challengeType === "wave") {
      updateWaveTwoRound(activeBombs);
    } else if (bossMode.bombTimerMs <= 0 && activeBombs < getBlitzDropLimit()) {
      spawnBossBomb();
      bossMode.bombTimerMs = getBossBombIntervalMs();
    }
    updateBossHud();
    return;
  }

  if (bossMode.phase === "challengeComplete") {
    bossMode.transitionMs -= dt;
    if (bossMode.transitionMs <= 0) {
      if (bossMode.transitionAction === "wave") {
        startChallenge("wave");
      } else if (bossMode.transitionAction === "boss") {
        startBossFight();
      } else {
        bossMode = null;
        updateBossHud();
        updateControlDisplay();
      }
    } else {
      updateBossHud();
    }
    return;
  }

  if (bossMode.phase === "boss") {
    updateBossPartLocks();
    collapseEmptyBossParts();
    if (bossMode?.phase !== "boss") return;
    refillBossReveals();
    bossMode.bombTimerMs -= dt;
    if (bossMode.bombTimerMs <= 0) {
      spawnBossBomb();
      bossMode.bombTimerMs = getBossBombIntervalMs();
    }
    return;
  }

  if (bossMode.phase === "victory") {
    bossMode.victoryMs -= dt;
    if (bossMode.victoryMs <= 0) {
      // Celebrate a full boss clear with a victory summary of the run.
      const showVictory = bossMode.mode === "full";
      bossMode = null;
      updateBossHud();
      updateControlDisplay();
      if (showVictory) showBossVictoryPopup(lastBossVictory);
    }
  }
}

function handleBossProblemDestroyed(problem) {
  problem.destroyed = true;
  const part = bossMode.parts.find((candidate) => candidate.id === problem.partId);
  if (!part) return;
  const partCleared = part.problems.every((target) => target.destroyed);
  if (partCleared) {
    createBossDebris(part);
    part.destroyed = true;
  }
  updateBossPartLocks();
  if (partCleared && part.id === "core") {
    completeBossVictory();
    return;
  }
  collapseEmptyBossParts();
  if (bossMode?.phase !== "boss") return;
  refillBossReveals();
  const { remaining, problemsRemaining } = getBossPartCount();
  if (partCleared) {
    bossMode.message = remaining === 1 ? "Core exposed" : `${part.name} destroyed`;
  } else {
    bossMode.message = `${problemsRemaining} ship problems left`;
  }
  updateBossHud();
}

function completeBossVictory() {
  if (!bossMode?.active) return;
  const { opKey, level, pressure, mode } = bossMode;
  drops = [];
  const durationMs = bossMode.bossStartedAtMs
    ? Math.max(0, performance.now() - bossMode.bossStartedAtMs)
    : null;
  progressProfile = recordChallengeAttempt(progressProfile, opKey, {
    type: "boss",
    level,
    durationMs,
    score: durationMs ? Math.max(1, Math.round(300000 / Math.max(1000, durationMs))) : 0,
    cleared: true,
    result: "cleared",
  });
  recordActiveSessionChallenge({
    action: "complete",
    type: "boss",
    opKey,
    level,
    durationMs,
    score: durationMs ? Math.max(1, Math.round(300000 / Math.max(1000, durationMs))) : 0,
    cleared: true,
    result: "cleared",
  });
  if (mode === "full") {
    progressProfile = recordBossAttempt(progressProfile, opKey, {
      pressureTier: pressure.key,
      speedPercent: pressure.speed,
      spawnRate: pressure.rate,
    });
    saveProfile(progressProfile);
    if (level < 10) {
      setDifficulty(opKey, level + 1, { force: true });
    } else {
      syncProgressSettings();
    }
  } else {
    saveProfile(progressProfile);
  }
  if (mode === "full") {
    lastBossVictory = {
      opKey,
      level,
      advanced: level < 10,
      wave1: bossMode.fullRunScores?.blitz ?? null,
      wave2: bossMode.fullRunScores?.wave ?? null,
      bossTimeMs: durationMs,
    };
  }
  bossMode.phase = "victory";
  bossMode.message = mode === "full"
    ? level < 10 ? `Boss cleared: Level ${level + 1} unlocked` : "Boss cleared"
    : `Boss time: ${formatDuration(durationMs)}`;
  bossMode.victoryMs = BOSS_VICTORY_MS;
  updateBossHud();
  updateReadinessDisplays();
  updateControlDisplay();
}
function updateBossHud() {
  updateScoreDisplay();
  if (!bossHudEl) return;
  if (!bossMode?.active) {
    bossHudEl.classList.add("hidden");
    bossHudEl.classList.remove("is-quiet", "is-stunned");
    return;
  }
  if (bossMode.lastHudMessage !== bossMode.message) {
    bossMode.lastHudMessage = bossMode.message;
    bossMode.hudFreshMs = BOSS_HUD_FRESH_MS;
  }
  bossHudEl.classList.remove("hidden");
  bossHudEl.classList.toggle("is-stunned", isBossStunned());
  bossHudEl.classList.toggle("is-quiet", !isBossStunned() && (bossMode.hudFreshMs || 0) <= 0);
  const opName = opDisplayNames[bossMode.opKey] || bossMode.opKey;
  const titleMode = bossMode.mode === "wave"
    ? "Wave 2"
    : bossMode.mode === "blitz"
      ? "Blitz"
      : "Boss";
  bossHudTitleEl.textContent = `${opName} ${titleMode} · Level ${bossMode.level}`;
  bossHudStatusEl.textContent = bossMode.message;
  if (isBossStunned()) {
    bossHudMetaEl.textContent = `Stunned ${(bossMode.stunMs / 1000).toFixed(1)}s`;
    return;
  }
  if (bossMode.phase === "challenge") {
    const shield = Math.round(bossMode.blitzShield || 0);
    const shieldMax = bossMode.blitzShieldMax || BLITZ_SHIELD_MAX;
    if (bossMode.challengeType === "wave") {
      bossHudMetaEl.textContent = `Shields ${shield}/${shieldMax} · Solved ${getBlitzScore()} · ${getBlitzDropLimit()} at once · fixed ${getBlitzSpeedPercent()}% speed`;
    } else {
      bossHudMetaEl.textContent = `Shields ${shield}/${shieldMax} · Solved ${getBlitzScore()} · ${getBlitzSpeedPercent()}% speed · ${getBlitzDropLimit()} at once`;
    }
    return;
  }
  if (bossMode.phase === "challengeComplete") {
    bossHudMetaEl.textContent = bossMode.transitionAction === "end"
      ? "Challenge recorded"
      : "Clearing the board";
    return;
  }
  if (bossMode.phase === "boss" || bossMode.phase === "victory") {
    const { remaining, total, problemsRemaining, problemsTotal } = getBossPartCount();
    const bombs = drops.filter((drop) => drop.bossKind === "bomb").length;
    bossHudMetaEl.textContent = `${Math.max(0, remaining)}/${total} parts · ${problemsRemaining}/${problemsTotal} nodes · ${bombs} bombs`;
    return;
  }
  bossHudMetaEl.textContent = "Get ready";
}

// ============================================================
// 7. Drop Management
// ============================================================

function getActiveAnswers() {
  return drops.map((drop) => drop.answer);
}

function getActiveAnswerTexts() {
  return drops.map((drop) => drop.answerText || String(drop.answer));
}

function createDrop() {
  const opKey = pickRandomEnabledOp();
  if (!opKey) return false;

  let problem = null;
  let attempts = 0;
  const activeAnswers = getActiveAnswers();
  const activeFactorNums = drops.filter((d) => d.opKey === "factor").map((d) => d.factorOriginal);
  while (attempts < 16) {
    const candidate = generateWeightedProblem(opKey);
    if (candidate.opKey === "factor") {
      if (!activeFactorNums.includes(candidate.factorOriginal)) {
        problem = candidate;
        break;
      }
    } else if (!activeAnswers.includes(candidate.answer)) {
      problem = candidate;
      break;
    }
    attempts += 1;
  }
  if (!problem) return false;

  const padding = 36;
  const left = padding;
  const right = Math.max(padding + 20, canvasW - padding);
  const x = randInt(left, right);

  const baseSpeed = getRandomBaseSpeed();

  const drop = {
    id: nextDropId++,
    x,
    y: -20,
    baseSpeed,
    text: problem.text,
    answer: problem.answer,
    answerText: problem.answerText || String(problem.answer),
    opKey: problem.opKey,
    statsKey: problem.statsKey || problem.text,
    createdAtMs: performance.now(),
  };
  // Factor-specific fields
  if (problem.opKey === "factor") {
    drop.factorOriginal = problem.factorOriginal;
    drop.factorRemaining = problem.factorRemaining;
    drop.factorCollected = { ...problem.factorCollected };
    drop.factorLastPrime = null;
  }
  drops.push(drop);
  return true;
}

function updateDrops(dt) {
  if (!isBossActive() && gameSpeed === 0) return;

  const mult = isBossActive() ? getBossSpeedMultiplier() : getSpeedMultiplier();
  for (const drop of drops) {
    drop.y += (drop.baseSpeed * mult * dt) / 1000;
  }

  const bottom = canvasH - 30;
  const survived = [];
  let missCount = 0;
  let endedBlitz = false;

  for (const drop of drops) {
    if (drop.y >= bottom) {
      if (!drop.revealed) {
        recordLearningResult(drop, "missed");
        missCount += 1;
        if (drop.bossKind === "bomb") {
          applyBossStun();
          if (bossMode?.phase === "challengeComplete") {
            endedBlitz = true;
            break;
          }
        }
      }
      if (factorTargetId === drop.id) factorTargetId = null;
    } else {
      survived.push(drop);
    }
  }

  if (missCount > 0) {
    groundFlash = 300;
    playMiss();
  }

  if (endedBlitz) {
    drops = [];
    updateBossHud();
    return;
  }

  drops = survived;
  updateBossHud();
}

function getDropStats(drop) {
  if (!drop?.opKey) return null;
  const statsKey = drop.statsKey || drop.text;
  return problemStats[drop.opKey]?.[statsKey] || null;
}

function getDropAccuracyVisual(drop) {
  const entry = getDropStats(drop);
  const asked = entry?.asked || 0;
  const correct = entry?.correct || 0;
  const statsKey = drop.statsKey || drop.text;
  const accuracy = getVisualAccuracy(drop.opKey, statsKey, asked, correct);
  const rgb = getAccuracyRGB(accuracy, asked > 0);

  if (!rgb) {
    return {
      asked,
      correct,
      legendColor: getAccuracyColor(asked, correct, drop.opKey, statsKey),
      fillColor: "rgba(26, 26, 46, 0.92)",
      strokeColor: "rgba(148, 163, 184, 0.82)",
      shadowColor: "rgba(148, 163, 184, 0.34)",
      label: "Never asked",
    };
  }

  const evidence = getEvidenceRatio(asked);
  const fillAlpha = clamp(0.24, 0.9, 0.18 + evidence * 0.72);
  const strokeAlpha = clamp(0.42, 0.96, 0.34 + evidence * 0.62);
  const shadowAlpha = clamp(0.12, 0.42, 0.08 + evidence * 0.34);
  return {
    asked,
    correct,
    legendColor: getAccuracyColor(asked, correct, drop.opKey, statsKey),
    fillColor: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${fillAlpha.toFixed(2)})`,
    strokeColor: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${strokeAlpha.toFixed(2)})`,
    shadowColor: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${shadowAlpha.toFixed(2)})`,
    label: getAccuracyText(asked, correct),
  };
}

function resetCanvasPaintState() {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
}

function clearCanvasFrame() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  resetCanvasPaintState();
}

function drawDrops() {
  clearCanvasFrame();

  drawStarfield();

  // Ground flash on miss
  if (groundFlash > 0) {
    const alpha = Math.min(1, groundFlash / 300) * 0.35;
    ctx.fillStyle = `rgba(248, 113, 113, ${alpha.toFixed(2)})`;
    ctx.fillRect(0, canvasH - 36, canvasW, 36);
  }

  drawSplashes();
  drawLoomingBoss();
  drawBossShip();
  drawChallengeBurst();

  const inputNum = currentInput !== "" ? Number(currentInput) : NaN;
  const hasNumMatch = !Number.isNaN(inputNum);

  for (const drop of drops) {
    ctx.save();
    const dropTop = drop.y - 26;
    const dropBottom = drop.y + 22;
    const dropRadius = 22;
    const isFactor = drop.opKey === "factor";
    const factorComplete = isFactor && drop.factorComplete;
    const isTargeted = isFactor && factorTargetId === drop.id;
    const isHighlighted = !drop.revealed && !isFactor && (drop.opKey === "si"
      ? currentInput === drop.answerText
      : hasNumMatch && drop.answer === inputNum);

    let fillColor, strokeColor, masteryShadowColor;
    if (drop.revealed) {
      fillColor = "rgba(148, 163, 184, 0.35)";
      strokeColor = "rgba(148, 163, 184, 0.25)";
    } else if (isFactor && factorComplete) {
      fillColor = "rgba(52, 211, 153, 0.88)";
      strokeColor = "rgba(110, 231, 183, 0.9)";
    } else {
      const visual = getDropAccuracyVisual(drop);
      fillColor = visual.fillColor;
      strokeColor = visual.strokeColor;
      masteryShadowColor = visual.shadowColor;
    }

    if (isHighlighted || isTargeted) {
      ctx.shadowColor = isFactor
        ? "rgba(192, 160, 255, 0.9)"
        : masteryShadowColor || "rgba(125, 211, 252, 0.8)";
      ctx.shadowBlur = isTargeted ? 24 : 18;
    }

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = isTargeted ? "rgba(255, 255, 255, 0.95)" : strokeColor;
    ctx.lineWidth = (isHighlighted || isTargeted) ? 3 : 2;

    // Teardrop shape with bezier curves
    ctx.beginPath();
    ctx.moveTo(drop.x, dropTop);
    ctx.bezierCurveTo(
      drop.x - dropRadius,
      drop.y - 12,
      drop.x - dropRadius,
      drop.y + 6,
      drop.x,
      dropBottom
    );
    ctx.bezierCurveTo(
      drop.x + dropRadius,
      drop.y + 6,
      drop.x + dropRadius,
      drop.y - 12,
      drop.x,
      dropTop
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (isHighlighted || isTargeted) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    // Problem text (or answer if revealed)
    let displayText;
    if (drop.revealed && isFactor) {
      displayText = `${drop.factorOriginal}=${getFullFactorization(drop.factorOriginal)}`;
    } else if (drop.revealed) {
      displayText = drop.answerText;
    } else {
      displayText = drop.text;
    }
    const fontSize = (drop.revealed || isFactor) ? 14 : 17;
    ctx.font = `700 ${fontSize}px Space Grotesk`;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";

    // Factor drops in progress: draw main text + remaining in accent color
    const remainingText = isFactor && !drop.revealed ? getFactorRemainingText(drop) : null;
    if (remainingText) {
      // Measure widths to position the two parts
      const mainWidth = ctx.measureText(displayText).width;
      const remWidth = ctx.measureText(remainingText).width;
      const totalWidth = mainWidth + remWidth;
      const startX = drop.x - totalWidth / 2;

      // Main part (white)
      ctx.textAlign = "left";
      ctx.fillStyle = "#f8fafc";
      ctx.strokeText(displayText, startX, drop.y + 2);
      ctx.fillText(displayText, startX, drop.y + 2);

      // Remaining part (bright accent — the thing to factor)
      ctx.fillStyle = "#fbbf24";
      ctx.strokeText(remainingText, startX + mainWidth, drop.y + 2);
      ctx.fillText(remainingText, startX + mainWidth, drop.y + 2);
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = drop.revealed ? "#94a3b8" : "#f8fafc";
      ctx.strokeText(displayText, drop.x, drop.y + 2);
      ctx.fillText(displayText, drop.x, drop.y + 2);
    }
    ctx.restore();
  }

  drawLaser();
  drawPlayerShip();
  drawChallengeStatus();
  drawBossStunOverlay();
}

// Compact shield + solved readout shown on the player ship during Wave 1/Wave 2.
function drawChallengeStatus() {
  if (!bossMode?.active || bossMode.phase !== "challenge") return;
  const shield = Math.max(0, Math.round(bossMode.blitzShield || 0));
  const shieldMax = bossMode.blitzShieldMax || BLITZ_SHIELD_MAX;
  const solved = getBlitzScore();
  const isWave = bossMode.challengeType === "wave";
  const lines = [
    `🛡 ${shield}/${shieldMax}`,
    isWave ? `Solved ${solved} · ${bossMode.challengeLoad} at once` : `Solved ${solved}`,
  ];

  ctx.save();
  ctx.font = "700 13px Space Grotesk";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const padX = 12;
  const lineH = 17;
  const boxW = widest + padX * 2;
  const boxH = lineH * lines.length + 10;
  const cx = canvasW / 2;
  const boxTop = canvasH - 20 - 44 - boxH;
  const low = getBlitzShieldRatio() <= 0.28;

  ctx.fillStyle = "rgba(10, 14, 26, 0.74)";
  ctx.strokeStyle = low ? "rgba(248, 113, 113, 0.6)" : "rgba(96, 180, 240, 0.4)";
  ctx.lineWidth = 1.5;
  fillRoundRect(cx - boxW / 2, boxTop, boxW, boxH, 9);
  strokeRoundRect(cx - boxW / 2, boxTop, boxW, boxH, 9);

  lines.forEach((line, index) => {
    ctx.fillStyle = index === 0
      ? (low ? "#fca5a5" : "#7dd3fc")
      : "#e2e8f0";
    ctx.fillText(line, cx, boxTop + 13 + index * lineH);
  });
  ctx.restore();
}

function fillRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
}

function strokeRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.stroke();
}

// A parallax starfield shown during boss mode: stars drift downward at varied
// speeds so it reads as flying forward toward the mothership between waves.
function ensureStarfield() {
  if (starfield.length) return;
  for (let i = 0; i < 70; i += 1) {
    starfield.push({
      x: Math.random() * canvasW,
      y: Math.random() * canvasH,
      r: 0.5 + Math.random() * 1.6,
      speed: 20 + Math.random() * 90,
    });
  }
}

function updateStarfield(dt) {
  if (!isBossActive() || !starfield.length) return;
  const sec = dt / 1000;
  for (const star of starfield) {
    star.y += star.speed * sec;
    if (star.y > canvasH) {
      star.y = 0;
      star.x = Math.random() * canvasW;
    }
  }
}

function drawStarfield() {
  if (!isBossActive()) return;
  ensureStarfield();
  ctx.save();
  ctx.fillStyle = "#cbd5e1";
  for (const star of starfield) {
    ctx.globalAlpha = 0.2 + (star.speed / 110) * 0.5;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// During the full-boss lead-up (Wave 1 and Wave 2) the mothership looms overhead,
// peeking a little further onto the screen each wave before it drops into full
// position for the fight. It is purely cosmetic — the idea is that the boss is
// the one launching the waves.
function drawLoomingBoss() {
  if (!bossMode?.active || bossMode.mode !== "full") return;
  if (!["announce", "challenge", "challengeComplete"].includes(bossMode.phase)) return;

  // Wave 1 barely shows the underside; Wave 2 comes noticeably closer.
  const reveal = bossMode.challengeType === "wave" ? 0.34 : 0.14;
  const w = Math.min(560, Math.max(340, canvasW * 0.74));
  const h = Math.min(185, Math.max(138, canvasH * 0.32));
  const left = (canvasW - w) / 2;
  const top = -h * (1 - reveal) + Math.sin(gameTime / 700) * 6;

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.shadowColor = "rgba(96, 180, 240, 0.18)";
  ctx.shadowBlur = 22;
  const hull = ctx.createLinearGradient(left, top, left, top + h);
  hull.addColorStop(0, "rgba(40, 52, 86, 0.9)");
  hull.addColorStop(1, "rgba(9, 14, 28, 0.9)");
  ctx.fillStyle = hull;
  ctx.strokeStyle = "rgba(125, 211, 252, 0.3)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(left + w * 0.5, top);
  ctx.lineTo(left + w * 0.93, top + h * 0.48);
  ctx.lineTo(left + w * 0.78, top + h * 0.82);
  ctx.lineTo(left + w * 0.61, top + h * 0.94);
  ctx.lineTo(left + w * 0.39, top + h * 0.94);
  ctx.lineTo(left + w * 0.22, top + h * 0.82);
  ctx.lineTo(left + w * 0.07, top + h * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Menacing underside lights.
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(240, 96, 96, 0.55)";
  for (const fx of [0.3, 0.5, 0.7]) {
    ctx.beginPath();
    ctx.arc(left + w * fx, top + h * 0.88, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBossShip() {
  if (!bossMode?.active || !["boss", "victory"].includes(bossMode.phase)) return;
  updateBossPartPositions();
  const { left, top, w, h } = bossMode.shipBounds;
  const cx = left + w * 0.5;
  const pulse = 0.5 + Math.sin(gameTime / 420) * 0.5;

  ctx.save();
  ctx.shadowColor = "rgba(96, 180, 240, 0.28)";
  ctx.shadowBlur = 24;
  const hull = ctx.createLinearGradient(left, top, left, top + h);
  hull.addColorStop(0, "rgba(71, 85, 130, 0.98)");
  hull.addColorStop(0.34, "rgba(30, 41, 74, 0.98)");
  hull.addColorStop(0.72, "rgba(15, 23, 42, 0.98)");
  hull.addColorStop(1, "rgba(2, 6, 23, 0.98)");
  ctx.fillStyle = hull;
  ctx.strokeStyle = "rgba(186, 230, 253, 0.46)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.bezierCurveTo(left + w * 0.68, top + h * 0.08, left + w * 0.88, top + h * 0.32, left + w * 0.96, top + h * 0.5);
  ctx.lineTo(left + w * 0.78, top + h * 0.82);
  ctx.lineTo(left + w * 0.6, top + h * 0.95);
  ctx.quadraticCurveTo(cx, top + h * 1.03, left + w * 0.4, top + h * 0.95);
  ctx.lineTo(left + w * 0.22, top + h * 0.82);
  ctx.lineTo(left + w * 0.04, top + h * 0.5);
  ctx.bezierCurveTo(left + w * 0.12, top + h * 0.32, left + w * 0.32, top + h * 0.08, cx, top);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  const canopy = ctx.createRadialGradient(cx, top + h * 0.34, 4, cx, top + h * 0.34, w * 0.16);
  canopy.addColorStop(0, `rgba(125, 211, 252, ${(0.34 + pulse * 0.16).toFixed(2)})`);
  canopy.addColorStop(0.64, "rgba(30, 64, 175, 0.18)");
  canopy.addColorStop(1, "rgba(15, 23, 42, 0)");
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.ellipse(cx, top + h * 0.36, w * 0.17, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(125, 211, 252, 0.18)";
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * w * 0.08, top + h * 0.12);
    ctx.lineTo(cx + side * w * 0.32, top + h * 0.76);
    ctx.lineTo(cx + side * w * 0.18, top + h * 0.9);
    ctx.stroke();
  }

  const coreGlow = ctx.createRadialGradient(cx, top + h * 0.55, 4, cx, top + h * 0.55, w * 0.11);
  coreGlow.addColorStop(0, `rgba(248, 113, 113, ${(0.38 + pulse * 0.22).toFixed(2)})`);
  coreGlow.addColorStop(1, "rgba(127, 29, 29, 0)");
  ctx.fillStyle = coreGlow;
  ctx.fillRect(cx - w * 0.13, top + h * 0.42, w * 0.26, h * 0.27);

  ctx.strokeStyle = "rgba(251, 191, 36, 0.34)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left + w * 0.16, top + h * 0.6);
  ctx.lineTo(left + w * 0.84, top + h * 0.6);
  ctx.stroke();

  ctx.fillStyle = "rgba(251, 191, 36, 0.55)";
  for (const fx of [0.26, 0.38, 0.62, 0.74]) {
    ctx.beginPath();
    ctx.arc(left + w * fx, top + h * 0.88, 2.4 + pulse * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const part of bossMode.parts) {
    drawBossPart(part);
  }
  // Second pass: draw problem nodes on top so no later part's body can cover them.
  for (const part of bossMode.parts) {
    if (part.destroyed || part.locked) continue;
    part.problems.filter((problem) => !problem.destroyed && problem.revealed).forEach(drawBossProblemNode);
  }
  drawBossDebris();
  ctx.restore();
}

function drawChallengeBurst() {
  if (!bossMode?.active || !bossMode.burstMs) return;
  const rawProgress = clamp(0, 1, 1 - bossMode.burstMs / CHALLENGE_TRANSITION_MS);
  const progress = smoothProgress(rawProgress);
  const fadeIn = clamp(0, 1, rawProgress / 0.12);
  const fadeOut = clamp(0, 1, (1 - rawProgress) / 0.2);
  const alpha = Math.min(fadeIn, fadeOut);
  const beamY = lerp(-70, canvasH + 90, progress);
  const beamHeight = clamp(42, 78, canvasH * 0.09);
  const beamCore = clamp(10, 18, canvasH * 0.02);
  const glowTop = beamY - beamHeight * 2.4;
  const glowBottom = beamY + beamHeight * 1.8;
  const shimmer = Math.sin(gameTime / 58) * 0.5 + 0.5;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;

  const wash = ctx.createLinearGradient(0, glowTop, 0, glowBottom);
  wash.addColorStop(0, "rgba(14, 165, 233, 0)");
  wash.addColorStop(0.24, "rgba(14, 165, 233, 0.16)");
  wash.addColorStop(0.5, "rgba(240, 249, 255, 0.42)");
  wash.addColorStop(0.68, "rgba(251, 191, 36, 0.22)");
  wash.addColorStop(1, "rgba(251, 191, 36, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, glowTop, canvasW, glowBottom - glowTop);

  const beam = ctx.createLinearGradient(0, beamY - beamHeight / 2, 0, beamY + beamHeight / 2);
  beam.addColorStop(0, "rgba(56, 189, 248, 0)");
  beam.addColorStop(0.32, "rgba(125, 211, 252, 0.42)");
  beam.addColorStop(0.47, "rgba(255, 255, 255, 0.95)");
  beam.addColorStop(0.54, "rgba(255, 255, 255, 0.98)");
  beam.addColorStop(0.7, "rgba(253, 224, 71, 0.42)");
  beam.addColorStop(1, "rgba(253, 224, 71, 0)");
  ctx.fillStyle = beam;
  ctx.fillRect(0, beamY - beamHeight / 2, canvasW, beamHeight);

  ctx.shadowColor = "rgba(125, 211, 252, 0.92)";
  ctx.shadowBlur = 28 + shimmer * 18;
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fillRect(0, beamY - beamCore / 2, canvasW, beamCore);

  ctx.shadowColor = "rgba(251, 191, 36, 0.72)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(251, 191, 36, 0.76)";
  ctx.fillRect(0, beamY + beamCore * 0.78, canvasW, 3);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha * 0.44;
  ctx.strokeStyle = "rgba(186, 230, 253, 0.72)";
  ctx.lineWidth = 1;
  for (let x = 18; x < canvasW; x += 48) {
    const offset = Math.sin((gameTime + x * 7) / 140) * 8;
    ctx.beginPath();
    ctx.moveTo(x + offset, Math.max(0, beamY - beamHeight * 2.2));
    ctx.lineTo(x - offset * 0.35, Math.min(canvasH, beamY - beamHeight * 0.22));
    ctx.stroke();
  }

  ctx.globalAlpha = alpha * 0.9;
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 83 + gameTime * 0.08) % (canvasW + 80)) - 40;
    const y = beamY + Math.sin((gameTime + i * 37) / 90) * beamHeight * 0.42;
    const len = 10 + (i % 5) * 4;
    ctx.strokeStyle = i % 3 === 0 ? "rgba(254, 240, 138, 0.9)" : "rgba(125, 211, 252, 0.84)";
    ctx.lineWidth = i % 3 === 0 ? 2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x - len, y - 4);
    ctx.lineTo(x + len, y + 4);
    ctx.stroke();
  }

  ctx.globalAlpha = alpha * 0.16;
  ctx.fillStyle = "rgba(240, 249, 255, 1)";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.restore();
}

function drawBossPart(part) {
  if (part.destroyed) return;
  const x = part.x - part.w / 2;
  const y = part.y - part.h / 2;
  const lockedAlpha = part.locked ? 0.42 : 1;

  if (part.kind === "cannon") {
    ctx.save();
    ctx.translate(part.x, part.y);
    ctx.globalAlpha = lockedAlpha;
    ctx.fillStyle = "rgba(245, 158, 11, 0.72)";
    ctx.strokeStyle = "rgba(254, 240, 138, 0.86)";
    ctx.lineWidth = 2;
    fillRoundRect(-part.w * 0.34, -part.h * 0.34, part.w * 0.68, part.h * 0.68, 14);
    strokeRoundRect(-part.w * 0.34, -part.h * 0.34, part.w * 0.68, part.h * 0.68, 14);
    for (const offset of [-0.32, 0, 0.32]) {
      fillRoundRect(part.w * offset - 13, -part.h / 2 - 13, 26, 30, 9);
      strokeRoundRect(part.w * offset - 13, -part.h / 2 - 13, 26, 30, 9);
      ctx.beginPath();
      ctx.moveTo(part.w * offset, -part.h / 2 - 13);
      ctx.lineTo(part.w * offset, -part.h / 2 - 30);
      ctx.stroke();
    }
    ctx.restore();
  } else if (part.kind === "wing") {
    const wing = ctx.createLinearGradient(part.x, part.y - part.h / 2, part.x, part.y + part.h / 2);
    wing.addColorStop(0, part.locked ? "rgba(71, 85, 105, 0.34)" : "rgba(129, 140, 248, 0.56)");
    wing.addColorStop(1, part.locked ? "rgba(30, 41, 59, 0.34)" : "rgba(49, 46, 129, 0.62)");
    ctx.fillStyle = wing;
    ctx.strokeStyle = part.locked ? "rgba(148, 163, 184, 0.42)" : "rgba(199, 210, 254, 0.78)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(part.x - part.w / 2, part.y);
    ctx.lineTo(part.x - part.w * 0.24, part.y - part.h / 2);
    ctx.lineTo(part.x + part.w * 0.24, part.y - part.h / 2);
    ctx.lineTo(part.x + part.w / 2, part.y);
    ctx.lineTo(part.x + part.w * 0.24, part.y + part.h / 2);
    ctx.lineTo(part.x - part.w * 0.24, part.y + part.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(224, 231, 255, 0.22)";
    ctx.beginPath();
    ctx.moveTo(part.x - part.w * 0.34, part.y);
    ctx.lineTo(part.x + part.w * 0.34, part.y);
    ctx.stroke();
  } else if (part.kind === "shield") {
    ctx.fillStyle = part.locked ? "rgba(96, 180, 240, 0.16)" : "rgba(96, 180, 240, 0.32)";
    ctx.strokeStyle = "rgba(186, 230, 253, 0.62)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(part.x, part.y, part.w / 2, part.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const core = ctx.createLinearGradient(x, y, x, y + part.h);
    core.addColorStop(0, part.locked ? "rgba(71, 85, 105, 0.46)" : "rgba(248, 113, 113, 0.82)");
    core.addColorStop(1, part.locked ? "rgba(30, 41, 59, 0.5)" : "rgba(127, 29, 29, 0.86)");
    ctx.fillStyle = core;
    ctx.strokeStyle = part.locked ? "rgba(148, 163, 184, 0.42)" : "rgba(255, 190, 190, 0.82)";
    ctx.lineWidth = 2.5;
    fillRoundRect(x, y, part.w, part.h, 16);
    strokeRoundRect(x, y, part.w, part.h, 16);
    ctx.fillStyle = "rgba(254, 202, 202, 0.18)";
    ctx.beginPath();
    ctx.arc(part.x, part.y, Math.min(part.w, part.h) * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBossDebris() {
  if (!bossMode?.debris?.length) return;
  bossMode.debris.forEach(drawBossDebrisPiece);
}

function drawBossDebrisPiece(piece) {
  const lifeRatio = clamp(0, 1, piece.life / piece.maxLife);
  const blink = piece.grounded ? 0.55 + Math.sin(piece.life / 80) * 0.18 : 1;
  const alpha = Math.max(0.14, lifeRatio * blink * 0.72);
  const x = -piece.w / 2;
  const y = -piece.h / 2;

  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.rotation);
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2;

  if (piece.kind === "cannon") {
    ctx.fillStyle = "rgba(240, 168, 48, 0.62)";
    ctx.strokeStyle = "rgba(255, 232, 170, 0.62)";
    fillRoundRect(x, y, piece.w * 0.7, piece.h, 10);
    strokeRoundRect(x, y, piece.w * 0.7, piece.h, 10);
    fillRoundRect(x + piece.w * 0.44, y + piece.h * 0.3, piece.w * 0.44, piece.h * 0.38, 8);
    strokeRoundRect(x + piece.w * 0.44, y + piece.h * 0.3, piece.w * 0.44, piece.h * 0.38, 8);
  } else if (piece.kind === "wing") {
    ctx.fillStyle = "rgba(129, 140, 248, 0.34)";
    ctx.strokeStyle = "rgba(199, 210, 254, 0.5)";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + piece.w * 0.25, y);
    ctx.lineTo(x + piece.w * 0.75, y);
    ctx.lineTo(x + piece.w, 0);
    ctx.lineTo(x + piece.w * 0.75, y + piece.h);
    ctx.lineTo(x + piece.w * 0.25, y + piece.h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (piece.kind === "shield") {
    ctx.fillStyle = "rgba(96, 180, 240, 0.22)";
    ctx.strokeStyle = "rgba(186, 230, 253, 0.5)";
    ctx.beginPath();
    ctx.ellipse(0, 0, piece.w / 2, piece.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = "rgba(240, 96, 96, 0.48)";
    ctx.strokeStyle = "rgba(255, 190, 190, 0.58)";
    fillRoundRect(x, y, piece.w, piece.h, 16);
    strokeRoundRect(x, y, piece.w, piece.h, 16);
  }

  ctx.strokeStyle = "rgba(2, 6, 23, 0.72)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x + piece.w * 0.22, y + piece.h * 0.32);
  ctx.lineTo(x + piece.w * 0.42, y + piece.h * 0.55);
  ctx.lineTo(x + piece.w * 0.33, y + piece.h * 0.72);
  ctx.moveTo(x + piece.w * 0.62, y + piece.h * 0.24);
  ctx.lineTo(x + piece.w * 0.74, y + piece.h * 0.48);
  ctx.stroke();

  if (piece.grounded) {
    ctx.fillStyle = "rgba(251, 191, 36, 0.6)";
    ctx.beginPath();
    ctx.arc(piece.w * 0.28, -piece.h * 0.22, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBossProblemNode(problem) {
  const x = problem.x - problem.w / 2;
  const y = problem.y - problem.h / 2;
  const isTargeted = factorTargetId === problem.id;
  ctx.fillStyle = problem.partKind === "core"
    ? "rgba(248, 113, 113, 0.92)"
    : "rgba(15, 23, 42, 0.9)";
  ctx.strokeStyle = isTargeted
    ? "rgba(251, 191, 36, 0.95)"
    : problem.partKind === "shield"
      ? "rgba(186, 230, 253, 0.86)"
      : "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = isTargeted ? 3 : 1.8;
  fillRoundRect(x, y, problem.w, problem.h, 8);
  strokeRoundRect(x, y, problem.w, problem.h, 8);

  // While factoring a targeted node, show what is left to factor.
  let label = problem.text;
  if (problem.opKey === "factor" && Number.isFinite(problem.factorRemaining)
    && problem.factorRemaining !== problem.factorOriginal) {
    label = String(problem.factorRemaining);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 11px Space Grotesk";
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";
  ctx.fillStyle = "#f8fafc";
  ctx.strokeText(label, problem.x, problem.y + 1);
  ctx.fillText(label, problem.x, problem.y + 1);
}

function drawBossStunOverlay() {
  if (!isBossStunned()) return;
  ctx.save();
  ctx.fillStyle = "rgba(248, 113, 113, 0.16)";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 24px Space Grotesk";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.9)";
  ctx.fillStyle = "#f8fafc";
  const text = `Stunned ${(bossMode.stunMs / 1000).toFixed(1)}s`;
  ctx.strokeText(text, canvasW / 2, canvasH / 2);
  ctx.fillText(text, canvasW / 2, canvasH / 2);
  ctx.restore();
}

// ============================================================
// 8. Splash Effects
// ============================================================

function createSplash(drop) {
  const baseColor = "125, 211, 252";
  const count = 6;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = 0.02 + Math.random() * 0.08;
    splashes.push({
      x: drop.x + Math.cos(angle) * 6,
      y: drop.y + Math.sin(angle) * 6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.08,
      rx: 2 + Math.random() * 3,
      ry: 3 + Math.random() * 4,
      rotation: Math.random() * Math.PI,
      life: 380 + Math.random() * 180,
      maxLife: 520,
      gravity: 0.00035 + Math.random() * 0.00025,
      color: `rgba(${baseColor}, {a})`,
    });
  }
}

function updateSplashes(dt) {
  const next = [];
  for (const splash of splashes) {
    splash.life -= dt;
    splash.y += splash.vy * dt;
    splash.x += splash.vx * dt;
    splash.vy += splash.gravity * dt;
    if (splash.life > 0) next.push(splash);
  }
  splashes = next;
}

function drawSplashes() {
  for (const splash of splashes) {
    const alpha = Math.max(0, splash.life / splash.maxLife);
    ctx.fillStyle = splash.color.replace("{a}", alpha.toFixed(2));
    ctx.beginPath();
    ctx.ellipse(
      splash.x,
      splash.y,
      splash.rx,
      splash.ry,
      splash.rotation,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

// ============================================================
// 8b. Laser and Player Ship
// ============================================================

function normalizeAngleDelta(delta) {
  let next = delta;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function getPlayerShipScale() {
  return clamp(0.74, 1.1, canvasW / 760);
}

function getPlayerShipPosition() {
  const scale = getPlayerShipScale();
  return {
    x: canvasW / 2,
    y: canvasH - 24 * scale,
    scale,
  };
}

function getPlayerShipNose(angle = playerShip.angle) {
  const ship = getPlayerShipPosition();
  const length = PLAYER_SHIP_NOSE_LENGTH * ship.scale;
  return {
    x: ship.x + Math.sin(angle) * length,
    y: ship.y - Math.cos(angle) * length,
  };
}

function getPlayerShipAngleTo(target) {
  const ship = getPlayerShipPosition();
  const targetX = Number.isFinite(target?.x) ? target.x : ship.x;
  const targetY = Number.isFinite(target?.y) ? target.y : ship.y - 120;
  return Math.atan2(targetX - ship.x, ship.y - targetY);
}

function fireLaser(target) {
  const targetX = Number.isFinite(target?.x) ? target.x : canvasW / 2;
  const targetY = Number.isFinite(target?.y) ? target.y : canvasH / 2;
  const targetAngle = getPlayerShipAngleTo({ x: targetX, y: targetY });
  const initialTurn = normalizeAngleDelta(targetAngle - playerShip.angle);
  playerShip.angle += initialTurn * 0.72;
  playerShip.targetAngle = targetAngle;
  playerShip.firePulseMs = PLAYER_SHIP_FIRE_PULSE_MS;
  playerShip.recoilMs = PLAYER_SHIP_RECOIL_MS;
  playerShip.lastTarget = { x: targetX, y: targetY };

  const nose = getPlayerShipNose(playerShip.angle);
  laser = {
    x1: nose.x,
    y1: nose.y,
    x2: targetX,
    y2: targetY,
    life: 140,
    maxLife: 140,
  };
}

function updatePlayerShip(dt) {
  const shooting = Boolean(laser) || playerShip.firePulseMs > 0 || playerShip.recoilMs > 0;
  const targetAngle = shooting ? playerShip.targetAngle : PLAYER_SHIP_IDLE_ANGLE;
  const turnMs = shooting ? PLAYER_SHIP_TURN_MS : PLAYER_SHIP_RETURN_MS;
  const ratio = clamp(0, 1, dt / turnMs);
  const delta = normalizeAngleDelta(targetAngle - playerShip.angle);
  playerShip.angle += delta * ratio;
  if (Math.abs(delta) < 0.002) playerShip.angle = targetAngle;

  playerShip.firePulseMs = Math.max(0, playerShip.firePulseMs - dt);
  playerShip.recoilMs = Math.max(0, playerShip.recoilMs - dt);
  if (!shooting && Math.abs(playerShip.angle - PLAYER_SHIP_IDLE_ANGLE) < 0.004) {
    playerShip.lastTarget = null;
  }
}

function updateLaser(dt) {
  if (!laser) return;
  laser.life -= dt;
  if (laser.life <= 0) laser = null;
}

function drawLaser() {
  if (!laser) return;
  const alpha = Math.max(0, laser.life / laser.maxLife);
  ctx.save();
  ctx.strokeStyle = `rgba(96, 180, 240, ${(alpha * 0.8).toFixed(2)})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = `rgba(96, 180, 240, ${(alpha * 0.5).toFixed(2)})`;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(laser.x1, laser.y1);
  ctx.lineTo(laser.x2, laser.y2);
  ctx.stroke();
  ctx.restore();
}

function drawBlitzShield(ship = getPlayerShipPosition()) {
  if (!bossMode?.active || !["challenge", "challengeComplete"].includes(bossMode.phase)) return;
  const shieldY = ship.y + 4 * ship.scale;
  const shieldX = ship.x;
  const ratio = bossMode.phase === "challengeComplete" ? 0 : getBlitzShieldRatio();
  const pulse = clamp(0, 1, (bossMode.blitzShieldPulseMs || 0) / BLITZ_SHIELD_PULSE_MS);
  const hit = clamp(0, 1, (bossMode.blitzShieldHitMs || 0) / BLITZ_SHIELD_HIT_MS);
  const low = ratio <= 0.28 || bossMode.phase === "challengeComplete";
  const color = low ? "248, 113, 113" : "56, 189, 248";
  const arcW = (62 + ratio * 32 + pulse * 6) * ship.scale;
  const arcH = (26 + ratio * 16 + pulse * 4) * ship.scale;

  ctx.save();
  ctx.fillStyle = `rgba(${color}, ${(0.03 + ratio * 0.1 + pulse * 0.05).toFixed(2)})`;
  ctx.strokeStyle = `rgba(${color}, ${(0.36 + ratio * 0.44 + pulse * 0.18).toFixed(2)})`;
  ctx.lineWidth = 2.5 + ratio * 8 + pulse * 3;
  ctx.shadowColor = `rgba(${color}, ${(0.22 + ratio * 0.36).toFixed(2)})`;
  ctx.shadowBlur = 10 + ratio * 18 + pulse * 14;
  ctx.beginPath();
  ctx.ellipse(shieldX, shieldY - 11 * ship.scale, arcW, arcH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (hit > 0 || bossMode.phase === "challengeComplete") {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(254, 202, 202, ${(0.36 + hit * 0.46).toFixed(2)})`;
    ctx.lineWidth = 2;
    const crack = (18 + hit * 10) * ship.scale;
    ctx.beginPath();
    ctx.moveTo(shieldX - 22 * ship.scale, shieldY - 34 * ship.scale);
    ctx.lineTo(shieldX - 8 * ship.scale, shieldY - 20 * ship.scale);
    ctx.lineTo(shieldX - 16 * ship.scale, shieldY - 7 * ship.scale);
    ctx.moveTo(shieldX + 20 * ship.scale, shieldY - 33 * ship.scale);
    ctx.lineTo(shieldX + 7 * ship.scale, shieldY - 18 * ship.scale);
    ctx.lineTo(shieldX + crack, shieldY - 9 * ship.scale);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayerShip() {
  const ship = getPlayerShipPosition();
  const fire = clamp(0, 1, playerShip.firePulseMs / PLAYER_SHIP_FIRE_PULSE_MS);
  const recoil = clamp(0, 1, playerShip.recoilMs / PLAYER_SHIP_RECOIL_MS);
  const engineFlicker = 0.5 + Math.sin(gameTime * 0.016) * 0.5;
  const flame = 0.45 + engineFlicker * 0.25 + fire * 0.45;

  drawBlitzShield(ship);

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(playerShip.angle);
  ctx.scale(ship.scale, ship.scale);
  ctx.translate(0, recoil * 4);

  ctx.save();
  ctx.globalAlpha = 0.55 + flame * 0.35;
  const flameGradient = ctx.createLinearGradient(0, 14, 0, 42 + fire * 8);
  flameGradient.addColorStop(0, "rgba(125, 211, 252, 0.95)");
  flameGradient.addColorStop(0.38, "rgba(251, 191, 36, 0.82)");
  flameGradient.addColorStop(1, "rgba(249, 115, 22, 0)");
  ctx.fillStyle = flameGradient;
  ctx.beginPath();
  ctx.moveTo(-7 - fire * 2, 13);
  ctx.quadraticCurveTo(0, 34 + flame * 10, 7 + fire * 2, 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.shadowColor = "rgba(56, 189, 248, 0.28)";
  ctx.shadowBlur = 14 + fire * 10;

  const wingGradient = ctx.createLinearGradient(0, -30, 0, 26);
  wingGradient.addColorStop(0, "#64748b");
  wingGradient.addColorStop(0.42, "#1e293b");
  wingGradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = wingGradient;
  ctx.strokeStyle = "rgba(125, 211, 252, 0.68)";
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.bezierCurveTo(13, -18, 20, 0, 30, 19);
  ctx.lineTo(11, 13);
  ctx.lineTo(5, 25);
  ctx.quadraticCurveTo(0, 21, -5, 25);
  ctx.lineTo(-11, 13);
  ctx.lineTo(-30, 19);
  ctx.bezierCurveTo(-20, 0, -13, -18, 0, -32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const bodyGradient = ctx.createLinearGradient(0, -31, 0, 23);
  bodyGradient.addColorStop(0, "#e0f2fe");
  bodyGradient.addColorStop(0.22, "#38bdf8");
  bodyGradient.addColorStop(0.5, "#1e3a8a");
  bodyGradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = "rgba(224, 242, 254, 0.74)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.bezierCurveTo(9, -24, 13, -6, 9, 11);
  ctx.quadraticCurveTo(7, 20, 0, 24);
  ctx.quadraticCurveTo(-7, 20, -9, 11);
  ctx.bezierCurveTo(-13, -6, -9, -24, 0, -34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(14, 165, 233, 0.75)";
  ctx.strokeStyle = "rgba(224, 242, 254, 0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -11, 5.4, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(148, 163, 184, 0.95)";
  fillRoundRect(-19, 2, 5, 13, 2);
  fillRoundRect(14, 2, 5, 13, 2);

  if (fire > 0) {
    ctx.shadowColor = "rgba(96, 180, 240, 0.82)";
    ctx.shadowBlur = 18 * fire;
    ctx.fillStyle = `rgba(224, 242, 254, ${(0.48 + fire * 0.5).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(0, -31, 3.5 + fire * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================
// 9. Input Handling
// ============================================================

function isDropVisible(drop) {
  return drop.y > 0;
}

function isAnswerTargetVisible(target) {
  if (target.targetType === "bossProblem") {
    return isBossActive() && bossMode.phase === "boss" && !target.destroyed && !target.locked;
  }
  return isDropVisible(target) && !target.revealed;
}

function getAnswerTargets() {
  return [...drops, ...getActiveBossParts()];
}

function isDropClickable(drop) {
  return isDropVisible(drop) && !drop.revealed;
}

function hitTestDrop(drop, x, y) {
  // Simple distance check against the drop center
  const dx = x - drop.x;
  const dy = y - (drop.y - 2); // center offset
  return dx * dx + dy * dy <= 26 * 26;
}

function revealDrop(drop) {
  if (!drop.revealed) {
    recordLearningResult(drop, "helped");
  }
  drop.revealed = true;
  maybeExitBreatherMode();
}

function findDropMatch(value, { enterPressed = false } = {}) {
  const normalizedTyped = normalizeTypedValue(value, {
    allowIncomplete: false,
  });
  const numericValue = Number(value);
  const hasNumeric = !Number.isNaN(numericValue);

  for (const drop of getAnswerTargets()) {
    if (!isAnswerTargetVisible(drop)) continue;
    // Factor drops require Enter + typed factorization
    if (drop.opKey === "factor") {
      if (enterPressed && matchesFactorDrop(value, drop)) return drop;
      continue;
    }
    // SI drops require Enter — skip them on auto-match
    if (drop.opKey === "si" && !enterPressed) continue;
    if (drop.opKey === "si") {
      // String match for SI answers like "*1000" or "/100"
      if (value === drop.answerText) return drop;
      continue;
    }
    const text = drop.answerText || String(drop.answer);
    if (normalizedTyped && text === normalizedTyped) return drop;
    if (hasNumeric && drop.answer === numericValue) return drop;
  }
  return null;
}

function isInputPossible(inputValue) {
  if (!inputValue) return true;
  // If input starts with * or /, it's an SI answer — always possible (checked on Enter)
  if (inputValue.startsWith("*") || inputValue.startsWith("/")) return true;
  // If input contains ^ or *, it's a factorization attempt — always possible (checked on Enter)
  if (inputValue.includes("^") || inputValue.includes("*")) return true;
  // If factor drops are visible, any digit input could be the start of a factorization
  const hasFactorDrops = getAnswerTargets().some((d) => d.opKey === "factor" && isAnswerTargetVisible(d));
  if (hasFactorDrops && /^\d+$/.test(inputValue)) return true;
  const typed = normalizeTypedValue(inputValue, { allowIncomplete: true });
  if (!typed) return true;
  const visible = getAnswerTargets().filter((d) => isAnswerTargetVisible(d) && d.opKey !== "si" && d.opKey !== "factor");
  return visible.some((drop) => {
    const text = drop.answerText || String(drop.answer);
    const normalizedAnswer = normalizeTypedValue(text, {
      allowIncomplete: false,
    });
    return normalizedAnswer.startsWith(typed);
  });
}

// During boss/challenge play the header "Cleared" slot shows live stage progress
// (Wave 1/2 solved count, Wave 2 current load, mothership nodes) instead of the
// frozen session score.
function getScoreReadout() {
  if (!bossMode?.active) return { label: "Cleared", value: String(score) };
  const phase = bossMode.phase;
  const isMothership = phase === "boss" || phase === "victory";
  // Stage label: standalone replays read Blitz/Wave/Boss; the full boss reads
  // Wave 1 (shield endurance), Wave 2 (load ladder), then Boss (mothership).
  const label = bossMode.mode === "blitz" ? "Blitz"
    : bossMode.mode === "wave" ? "Wave"
      : isMothership ? "Boss"
        : bossMode.challengeType === "wave" ? "Wave 2" : "Wave 1";
  if (isMothership) {
    const { problemsTotal, problemsRemaining } = getBossPartCount();
    return { label, value: `${Math.max(0, problemsTotal - problemsRemaining)}/${problemsTotal} nodes` };
  }
  if (phase === "challenge" || phase === "challengeComplete") {
    const solved = getBlitzScore();
    // Wave 1 ramps speed, so surface the live speed; Wave 2 ramps load.
    return {
      label,
      value: bossMode.challengeType === "wave"
        ? `${solved} solved · ${bossMode.challengeLoad} at once`
        : `${solved} solved · ${getBlitzSpeedPercent()}% speed`,
    };
  }
  return { label, value: "ready" };
}

function updateScoreDisplay() {
  const { label, value } = getScoreReadout();
  scoreEl.textContent = value;
  if (scoreLabelEl) scoreLabelEl.textContent = label;
  const ts = document.getElementById("touchScore");
  if (ts) ts.textContent = value;
  const tsl = document.getElementById("touchScoreLabel");
  if (tsl) tsl.textContent = label;
}

function handleCorrectAnswer(match) {
  if (isBossStunned()) return;
  clearAmbiguousTimer();
  if (factorTargetId === match.id) factorTargetId = null;
  recordLearningResult(match, "correct");
  if (bossMode?.phase === "challenge" && match.bossKind === "bomb") {
    changeBlitzShield(BLITZ_CORRECT_SHIELD_GAIN, "correct");
  }
  if (!isBossActive()) score += 1;
  updateScoreDisplay();
  if (match.targetType === "bossProblem") {
    handleBossProblemDestroyed(match);
  } else {
    drops = drops.filter((d) => d.id !== match.id);
    if (match.bossKind === "bomb" && bossMode?.phase === "boss" && match.bossSourceNodeId) {
      const sourceNode = findBossProblemById(match.bossSourcePartId, match.bossSourceNodeId);
      if (sourceNode && !sourceNode.destroyed) {
        handleBossProblemDestroyed(sourceNode);
      }
    }
  }
  createSplash(match);
  fireLaser(match);
  playPop();
  answerInput.value = "";
  currentInput = "";
  updateKpDisplay();
  maybeExitBreatherMode();
}

function getMostUrgentVisibleTarget(candidates = getAnswerTargets()) {
  const visible = candidates.filter((drop) => isAnswerTargetVisible(drop));
  if (visible.length === 0) return null;
  return visible.reduce((lowest, drop) => (drop.y > lowest.y ? drop : lowest));
}

function getWrongSubmissionTargets() {
  const visibleTargets = getAnswerTargets().filter((drop) => isAnswerTargetVisible(drop));
  if (visibleTargets.length === 0) return [];
  const enterRequired = visibleTargets.filter((drop) => drop.opKey === "si" || drop.opKey === "factor");
  const target = getMostUrgentVisibleTarget(enterRequired.length ? enterRequired : visibleTargets);
  return target ? [target] : [];
}

function handleWrongInput({ targets = null } = {}) {
  if (isPaused || isBossStunned()) return;
  clearAmbiguousTimer();
  const visibleTargets = getAnswerTargets().filter((drop) => isAnswerTargetVisible(drop));
  const targetsToRecord = Array.isArray(targets)
    ? targets.filter(Boolean)
    : bossMode?.phase === "challenge" && visibleTargets.length > 0
      ? [getMostUrgentVisibleTarget(visibleTargets)]
      : [];
  for (const drop of targetsToRecord) {
    recordLearningResult(drop, "wrong");
  }
  // A wrong typed answer does not drain shields — consistent with normal play,
  // where a wrong answer simply doesn't clear. Only landed bombs cost shields.
  playWrongInput();
  answerInput.value = "";
  currentInput = "";
  updateKpDisplay();
}

function hasLongerMatch(value) {
  // Check if the typed value is a prefix of a DIFFERENT visible drop's answer
  const typed = normalizeTypedValue(value, { allowIncomplete: true });
  if (!typed) return false;
  const visible = getAnswerTargets().filter(isAnswerTargetVisible);
  return visible.some((drop) => {
    const text = normalizeTypedValue(drop.answerText || String(drop.answer), {
      allowIncomplete: false,
    });
    // Must be a longer answer that starts with the typed value (not an exact match)
    return text.startsWith(typed) && text !== typed;
  });
}

function clearAmbiguousTimer() {
  if (ambiguousTimer !== null) {
    clearTimeout(ambiguousTimer);
    ambiguousTimer = null;
  }
}

function processInput(value) {
  if (isPaused || isBossStunned()) return;
  if (!value) return;
  clearAmbiguousTimer();

  // ── Factor targeting mode: primes go to the targeted drop only ──
  if (isInFactorTargetMode()) {
    const target = getTargetedFactorDrop();
    if (!target) {
      exitFactorTargeting();
      return;
    }
    if (target.factorComplete) return; // waiting for Enter
    if (/[*^]/.test(value)) return; // a full a^b*c expression is completed on Enter, not stepwise
    const typedNum = Number(value);
    const isValidDivisor = !Number.isNaN(typedNum) && Number.isInteger(typedNum) && typedNum >= 2;
    if (isValidDivisor && target.factorRemaining % typedNum === 0) {
      advanceFactorDrop(target, typedNum, { fromTargeting: true });
      answerInput.value = "";
      currentInput = "";
    } else if (isValidDivisor && target.factorRemaining % typedNum !== 0) {
      // Valid number but doesn't divide remaining
      handleWrongInput({ targets: [target] });
    } else if (!couldMatchTargetedFactor(value)) {
      handleWrongInput({ targets: [target] });
    }
    return;
  }

  // ── Normal mode: regular drops only, factor drops ignored ──
  const match = findDropMatch(value);
  if (match) {
    if (hasLongerMatch(value)) {
      ambiguousTimer = setTimeout(() => {
        ambiguousTimer = null;
        const stillThere = drops.find((d) => d.id === match.id);
        if (stillThere && currentInput === value) {
          handleCorrectAnswer(stillThere);
        }
      }, AMBIGUOUS_DELAY_MS);
    } else {
      handleCorrectAnswer(match);
    }
    return;
  }

  if (!isInputPossible(value)) {
    handleWrongInput();
  }
}

function couldMatchTargetedFactor(value) {
  if (!value) return false;
  const target = getTargetedFactorDrop();
  if (!target || target.factorComplete) return false;
  const rem = target.factorRemaining;
  // Check if typed value is a prefix of any divisor of remaining
  for (let d = 2; d <= rem; d++) {
    if (rem % d === 0 && String(d).startsWith(value)) return true;
  }
  return false;
}

function advanceFactorDrop(drop, divisor, { fromTargeting = false } = {}) {
  advanceFactorDropCore(drop, divisor, { fromTargeting });
  playPop();
}

// ── Factor Targeting ──

function isInFactorTargetMode() {
  return factorTargetId !== null;
}

function getTargetedFactorDrop() {
  if (factorTargetId === null) return null;
  // Include boss ship nodes so a targeted node (even fully factored, awaiting
  // Enter) is still found; only destroyed/cleared targets release targeting.
  const pool = isBossActive() ? [...getActiveBossParts(), ...drops] : drops;
  const target = pool.find((d) => d.id === factorTargetId);
  if (!target || target.destroyed) {
    factorTargetId = null;
    return null;
  }
  if (!isBossActive() && target.revealed) {
    factorTargetId = null;
    return null;
  }
  return target;
}

// Factor problems that can be targeted/stepped right now. In boss mode that means
// the active ship's factor nodes plus any falling factor bombs; otherwise the
// visible falling factor drops.
function getTargetableFactorProblems() {
  if (isBossActive()) {
    const nodes = getActiveBossParts().filter((p) => p.opKey === "factor" && !p.factorComplete);
    const bombs = drops.filter((d) => d.bossKind === "bomb" && d.opKey === "factor" && isDropVisible(d) && !d.factorComplete);
    return [...nodes, ...bombs];
  }
  return drops.filter((d) => d.opKey === "factor" && isDropVisible(d) && !d.revealed && !d.factorComplete);
}

function getVisibleFactorDrops() {
  return getTargetableFactorProblems();
}

function getNextFactorDrop(currentId) {
  const visible = getVisibleFactorDrops();
  if (visible.length === 0) return null;
  if (currentId === null) return visible[0];
  const idx = visible.findIndex((d) => d.id === currentId);
  if (idx === -1) return visible[0];
  return idx + 1 < visible.length ? visible[idx + 1] : null; // null = past last, exit
}

function getPrevFactorDrop(currentId) {
  const visible = getVisibleFactorDrops();
  if (visible.length === 0) return null;
  if (currentId === null) return visible[visible.length - 1];
  const idx = visible.findIndex((d) => d.id === currentId);
  if (idx === -1) return visible[visible.length - 1];
  return idx - 1 >= 0 ? visible[idx - 1] : null; // null = before first, exit
}

function enterFactorTargeting(drop) {
  factorTargetId = drop ? drop.id : null;
  answerInput.value = "";
  currentInput = "";
  answerInput.focus();
  updateKpDisplay();
}

function exitFactorTargeting() {
  factorTargetId = null;
  answerInput.value = "";
  currentInput = "";
  answerInput.focus();
  updateKpDisplay();
}

// ============================================================
// 10. Game Loop
// ============================================================

// When factoring is the only operation in play, auto-target the most urgent
// factor drop so the player can factor it (stepwise, or a full a^b*c + Enter)
// without pressing Tab first. With other operations enabled, targeting stays
// manual to avoid surprises.
function maybeAutoTargetFactor() {
  const factorActive = isBossActive()
    ? bossMode.opKey === "factor"
    : (() => {
      const enabled = getEnabledOps();
      return enabled.length === 1 && enabled[0] === "factor";
    })();
  if (!factorActive) return;
  if (factorTargetId !== null && getTargetedFactorDrop()) return; // keep a valid current target
  const candidates = getTargetableFactorProblems();
  if (candidates.length === 0) return;
  const target = getMostUrgentVisibleTarget(candidates) || candidates[0];
  if (target) factorTargetId = target.id;
}

function tick(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (!isPaused && !isGameplayOverlayOpen()) {
    gameTime += dt;

    if (isBossActive()) {
      updateBossMode(dt);
      updateStarfield(dt);
    } else if (isBreatherMode) {
      maybeExitBreatherMode();
    } else if (dropLimit > 0) {
      // Spawn drops
      spawnTimer += dt;
      const interval = getSpawnInterval();
      let spawns = 0;
      while (spawnTimer >= interval && spawns < 2) {
        if (drops.length >= getMaxDrops()) {
          spawnTimer = Math.min(spawnTimer, interval);
          break;
        }
        const created = createDrop();
        if (!created) {
          spawnTimer = 0;
          break;
        }
        spawnTimer -= interval;
        spawns += 1;
      }
      if (spawnTimer >= interval) {
        spawnTimer = 0;
      }
    }

    if (!isBossStunned() && !isBreatherMode) {
      updateDrops(dt);
    }
    maybeAutoTargetFactor();
    updateSplashes(dt);
    updatePlayerShip(dt);
    updateLaser(dt);
    if (groundFlash > 0) groundFlash = Math.max(0, groundFlash - dt);
    drawDrops();
  }

  requestAnimationFrame(tick);
}

function isGameplayOverlayOpen() {
  const feedback = document.getElementById("feedbackOverlay");
  return Boolean(
    document.getElementById("welcomeOverlay")
    || document.getElementById("tutorialOverlay")
    || document.getElementById("loginOverlay")
    || document.getElementById("statsOverlay")
    || document.getElementById("resultsOverlay")
    || document.getElementById("sessionLogOverlay")
    || document.getElementById("sessionReportOverlay")
    || document.getElementById("bossVictoryOverlay")
    || document.getElementById("bossOfferOverlay")
    || (feedback && !feedback.classList.contains("hidden"))
  );
}

// ============================================================
// 11. Audio
// ============================================================

function initAudio() {
  if (audioCtx) return;
  const AudioContextRef = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextRef) return;
  audioCtx = new AudioContextRef();
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playPop() {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(650, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.14);
}

function playMiss() {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function playWrongInput() {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}

// ============================================================
// 12. Canvas Resize
// ============================================================

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvasDpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * canvasDpr));
  const height = Math.max(1, Math.round(rect.height * canvasDpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
  resetCanvasPaintState();
  canvasW = Math.max(1, rect.width);
  canvasH = Math.max(1, rect.height);
}

// ============================================================
// 13. UI Updates and Event Listeners
// ============================================================

const opDisplayLabels = {
  add: "+",
  sub: "\u2212",
  mul: "\u00d7",
  div: "\u00f7",
  f10: "x10",
  si: "SI",
  shapes: "\u25b1",
  factor: "p\u00b7q",
};

const opDisplayNames = {
  add: "Add",
  sub: "Subtract",
  mul: "Multiply",
  div: "Divide",
  f10: "Factors of 10",
  si: "SI Conversions",
  shapes: "Shapes (P & A)",
  factor: "Prime Factors",
};

function formatReadinessPercent(skill) {
  return `${Math.round(skill?.readiness || 0)}%`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "--";
  const seconds = Math.max(0, ms / 1000);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`
    : `${seconds.toFixed(1)}s`;
}

function formatReadyText(skill) {
  const suffix = skill?.bossAttemptedForLevel ? " ✓" : "";
  return `Mastered: ${formatReadinessPercent(skill)}${suffix}`;
}

function shouldPromptBossAttempt(skill) {
  return Boolean(skill?.bossReady && !skill?.bossAttemptedForLevel);
}

// When an operation first reaches boss-readiness, interrupt briefly with a
// choice. The game loop pauses under modal overlays, so this does not cost drops.
function maybeOfferBoss(opKey) {
  if (isBossActive()) return;
  const skill = getProgressSkill(opKey);
  if (!shouldPromptBossAttempt(skill)) return;
  const key = `${opKey}:${opConfig[opKey].difficulty}`;
  if (bossOfferShown.has(key)) return;
  bossOfferShown.add(key);
  showBossOffer(opKey);
}

function closeBossOffer() {
  const existing = document.getElementById("bossOfferOverlay");
  if (existing) existing.remove();
}

function showBossOffer(opKey) {
  closeBossOffer();
  const level = opConfig[opKey]?.difficulty;
  const overlay = document.createElement("div");
  overlay.className = "overlay boss-offer-overlay";
  overlay.id = "bossOfferOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Boss unlocked");

  const card = document.createElement("div");
  card.className = "card boss-offer";

  const title = document.createElement("h2");
  title.textContent = "Boss Unlocked";

  const msg = document.createElement("span");
  msg.className = "boss-offer-msg";
  msg.textContent = `${opDisplayNames[opKey]} Level ${level} is mastered. Try the boss now?`;

  const actions = document.createElement("div");
  actions.className = "boss-offer-actions";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "boss-offer-start";
  start.textContent = "Boss";
  start.addEventListener("click", () => {
    initAudio();
    closeBossOffer();
    startBossMode(opKey);
  });

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "boss-offer-dismiss";
  dismiss.textContent = "No boss";
  dismiss.addEventListener("click", closeBossOffer);

  actions.appendChild(dismiss);
  actions.appendChild(start);
  card.appendChild(title);
  card.appendChild(msg);
  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  start.focus();
}

function closeBossVictoryPopup() {
  const existing = document.getElementById("bossVictoryOverlay");
  if (existing) existing.remove();
}

// End-of-run celebration after a full boss clear: congratulations, the three
// stage results (Wave 1 / Wave 2 / Boss), and a button to move on.
function showBossVictoryPopup(info) {
  if (!info) return;
  closeBossVictoryPopup();
  const op = opDisplayNames[info.opKey] || info.opKey;

  const overlay = document.createElement("div");
  overlay.className = "overlay boss-victory-overlay";
  overlay.id = "bossVictoryOverlay";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeBossVictoryPopup();
  });

  const card = document.createElement("div");
  card.className = "card boss-victory-card";

  const heading = document.createElement("h2");
  heading.textContent = "🎉 Boss Defeated!";
  const sub = document.createElement("p");
  sub.className = "boss-victory-sub";
  sub.textContent = info.advanced
    ? `${op} — Level ${info.level} cleared. Level ${info.level + 1} unlocked!`
    : `${op} — Level ${info.level} cleared. Top level reached!`;

  const scores = document.createElement("div");
  scores.className = "boss-victory-scores";
  const rows = [
    ["Wave 1", info.wave1 != null ? `${info.wave1} solved` : "—"],
    ["Wave 2", info.wave2 != null ? `${info.wave2} solved` : "—"],
    ["Boss time", info.bossTimeMs != null ? formatDuration(info.bossTimeMs) : "—"],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "boss-victory-score";
    const l = document.createElement("span");
    l.className = "boss-victory-score-label";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "boss-victory-score-value";
    v.textContent = value;
    row.append(l, v);
    scores.appendChild(row);
  }

  const buttons = document.createElement("div");
  buttons.className = "boss-victory-buttons";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "boss-victory-next";
  next.textContent = info.advanced ? "Next Level →" : "Continue";
  next.addEventListener("click", () => {
    closeBossVictoryPopup();
    answerInput.focus();
  });
  const grid = document.createElement("button");
  grid.type = "button";
  grid.className = "boss-victory-grid";
  grid.textContent = "View accuracy grid";
  grid.addEventListener("click", () => {
    closeBossVictoryPopup();
    showStatsPopup(info.opKey);
  });
  buttons.append(next, grid);

  card.append(heading, sub, scores, buttons);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function getBossButtonTitle(skill) {
  if (skill?.bossReady) return "Start boss mode";
  return "Boss unlocks when 80% of current-level problems have at least 3 attempts and 90% current accuracy.";
}

function formatBlitzText(skill) {
  if (!skill?.blitzUnlockedLevel) return "";
  const best = skill.challengeBests?.blitz || skill.blitzBest;
  if (!best) return `Blitz L${skill.blitzUnlockedLevel}`;
  return `Blitz L${skill.blitzUnlockedLevel} best ${best.score} solved`;
}

function formatWaveText(skill) {
  if (!skill?.blitzUnlockedLevel) return "";
  const best = skill.challengeBests?.wave;
  if (!best) return `Wave L${skill.blitzUnlockedLevel}`;
  return `Wave L${skill.blitzUnlockedLevel} best ${best.score} solved`;
}

function formatBossReplayText(skill) {
  if (!skill?.blitzUnlockedLevel) return "";
  const best = skill.challengeBests?.boss;
  if (!best?.durationMs) return `Boss L${skill.blitzUnlockedLevel}`;
  return `Boss L${skill.blitzUnlockedLevel} ${formatDuration(best.durationMs)}`;
}

function updateOpChits() {
  document.querySelectorAll(".op-chit").forEach((btn) => {
    const opKey = btn.dataset.op;
    if (!opKey || !opConfig[opKey]) return;
    btn.classList.toggle("active", opConfig[opKey].enabled);
  });
  buildDiffCards();
  buildKpDiffStrip();
  updateInputHint();
}

function updateInputHint() {
  const el = document.getElementById("inputHint");
  if (!el) return;
  const enabled = getEnabledOps();
  if (enabled.length === 0) {
    const text = "Select a problem type to begin. Spacebar: pause drops until the board is clear.";
    el.textContent = text;
    if (kpHint) kpHint.textContent = text;
    return;
  }
  const hints = [];
  const hasBasic = enabled.some((op) => ["add", "sub", "mul", "div", "f10"].includes(op));
  const hasSI = enabled.includes("si");
  const hasShapes = enabled.includes("shapes");
  const hasFactor = enabled.includes("factor");
  if (hasBasic || hasShapes) hints.push("Type answer to clear");
  if (hasShapes) hints.push("Shapes: type the value; ○ is the π coefficient");
  if (hasSI) hints.push("SI: type *1000 or /100 + Enter");
  if (hasFactor) hints.push("p·q: type 2^2*3 + Enter, or Tab to factor");
  hints.push("Spacebar: pause drops until clear");
  const text = hints.join(" · ");
  el.textContent = text;
  if (kpHint) kpHint.textContent = text;
}

// Challenge replays are for the highest cleared level only, so they show only
// when that cleared level is the one currently selected. This keeps the card for
// the level you are working on free of older-level challenge stats.
function canReplayChallenges(opKey, skill) {
  return Boolean(skill?.blitzUnlockedLevel) && opConfig[opKey]?.difficulty === skill.blitzUnlockedLevel;
}

function buildDiffCards() {
  const container = document.getElementById("diffCards");
  if (!container) return;
  container.innerHTML = "";
  const enabled = getEnabledOps();
  const progressSummary = summarizeProfile(progressProfile);
  enabled.forEach((opKey) => {
    const config = opConfig[opKey];
    const range = getDifficultyRange(opKey, config.difficulty);
    const skill = progressSummary.skills[opKey];

    const card = document.createElement("div");
    card.className = "diff-card";
    card.tabIndex = 0;
    card.dataset.op = opKey;
    card.title = "Click for problem accuracy grid";
    card.setAttribute("role", "spinbutton");
    card.setAttribute("aria-label", `${opDisplayNames[opKey]} difficulty, level ${config.difficulty}, ${formatReadyText(skill)}. Click or press Enter for problem accuracy grid.`);
    card.setAttribute("aria-valuenow", config.difficulty);
    card.setAttribute("aria-valuemin", 1);
    card.setAttribute("aria-valuemax", 10);

    const header = document.createElement("div");
    header.className = "diff-card-head";

    const label = document.createElement("div");
    label.className = "diff-card-label";
    label.textContent = opDisplayLabels[opKey] || opKey;

    const gridHint = document.createElement("div");
    gridHint.className = "diff-grid-hint";
    gridHint.textContent = "Grid";
    gridHint.setAttribute("role", "button");
    gridHint.setAttribute("aria-label", `${opDisplayNames[opKey]} problem accuracy grid`);
    gridHint.addEventListener("click", (e) => {
      e.stopPropagation();
      showStatsPopup(opKey);
    });

    const controls = document.createElement("div");
    controls.className = "diff-card-controls";

    const downBtn = document.createElement("button");
    downBtn.className = "diff-btn";
    downBtn.tabIndex = -1;
    downBtn.textContent = "\u2212";
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      initAudio();
      setDifficulty(opKey, config.difficulty - 1);
    });

    const val = document.createElement("span");
    val.className = "diff-value";
    val.textContent = config.difficulty;

    const upBtn = document.createElement("button");
    upBtn.className = "diff-btn";
    upBtn.tabIndex = -1;
    upBtn.textContent = "+";
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      initAudio();
      setDifficulty(opKey, config.difficulty + 1);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp" || event.key === "ArrowRight") {
        event.preventDefault();
        initAudio();
        setDifficulty(opKey, opConfig[opKey].difficulty + 1);
      } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
        event.preventDefault();
        initAudio();
        setDifficulty(opKey, opConfig[opKey].difficulty - 1);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        initAudio();
        showStatsPopup(opKey);
      }
    });

    controls.appendChild(downBtn);
    controls.appendChild(val);
    controls.appendChild(upBtn);

    const rangeText = document.createElement("div");
    rangeText.className = "diff-range";
    rangeText.textContent = `${range.min}\u2013${range.max}`;

    const readyText = document.createElement("button");
    readyText.type = "button";
    readyText.className = "diff-ready";
    readyText.dataset.op = opKey;
    readyText.textContent = formatReadyText(skill);
    readyText.classList.toggle("is-qualified", Boolean(skill.bossAttemptedForLevel));
    readyText.classList.toggle("is-locked", !skill.bossReady);
    readyText.classList.toggle("is-ready-attention", shouldPromptBossAttempt(skill));
    readyText.disabled = !skill.bossReady;
    readyText.title = getBossButtonTitle(skill);
    readyText.setAttribute("aria-pressed", skill.bossAttemptedForLevel ? "true" : "false");
    readyText.addEventListener("click", (e) => {
      e.stopPropagation();
      initAudio();
      startBossMode(opKey);
    });

    const readyMeter = document.createElement("div");
    readyMeter.className = "diff-ready-meter";
    const readyFill = document.createElement("div");
    readyFill.className = "diff-ready-fill";
    readyFill.dataset.op = opKey;
    readyFill.style.width = formatReadinessPercent(skill);
    readyMeter.appendChild(readyFill);

    const blitzBtn = document.createElement("button");
    blitzBtn.type = "button";
    blitzBtn.className = "diff-challenge diff-blitz";
    blitzBtn.dataset.op = opKey;
    blitzBtn.dataset.challenge = "blitz";
    blitzBtn.textContent = formatBlitzText(skill);
    blitzBtn.hidden = !canReplayChallenges(opKey, skill);
    blitzBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      startBlitzMode(opKey);
    });

    const waveBtn = document.createElement("button");
    waveBtn.type = "button";
    waveBtn.className = "diff-challenge diff-wave";
    waveBtn.dataset.op = opKey;
    waveBtn.dataset.challenge = "wave";
    waveBtn.textContent = formatWaveText(skill);
    waveBtn.hidden = !canReplayChallenges(opKey, skill);
    waveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      startWaveMode(opKey);
    });

    const bossReplayBtn = document.createElement("button");
    bossReplayBtn.type = "button";
    bossReplayBtn.className = "diff-challenge diff-boss";
    bossReplayBtn.dataset.op = opKey;
    bossReplayBtn.dataset.challenge = "boss";
    bossReplayBtn.textContent = formatBossReplayText(skill);
    bossReplayBtn.hidden = !canReplayChallenges(opKey, skill);
    bossReplayBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      startBossReplayMode(opKey);
    });

    const challengeRow = document.createElement("div");
    challengeRow.className = "diff-challenge-row";
    challengeRow.appendChild(blitzBtn);
    challengeRow.appendChild(waveBtn);
    challengeRow.appendChild(bossReplayBtn);

    card.addEventListener("click", () => {
      showStatsPopup(opKey);
    });

    header.appendChild(label);
    header.appendChild(gridHint);
    card.appendChild(header);
    card.appendChild(controls);
    card.appendChild(readyText);
    card.appendChild(challengeRow);
    card.appendChild(readyMeter);
    card.appendChild(rangeText);
    container.appendChild(card);
  });
}

function updateReadinessDisplays() {
  const progressSummary = summarizeProfile(progressProfile);

  document.querySelectorAll(".diff-ready[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatReadyText(skill);
    el.classList.toggle("is-qualified", Boolean(skill?.bossAttemptedForLevel));
    el.classList.toggle("is-locked", !skill?.bossReady);
    el.classList.toggle("is-ready-attention", shouldPromptBossAttempt(skill));
    el.classList.remove("needs-ready");
    el.disabled = !skill?.bossReady;
    el.title = getBossButtonTitle(skill);
    el.setAttribute("aria-pressed", skill?.bossAttemptedForLevel ? "true" : "false");
  });

  document.querySelectorAll(".diff-ready-fill[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.style.width = formatReadinessPercent(skill);
  });

  document.querySelectorAll(".diff-blitz[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatBlitzText(skill);
    el.hidden = !canReplayChallenges(el.dataset.op, skill);
  });

  document.querySelectorAll(".diff-wave[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatWaveText(skill);
    el.hidden = !canReplayChallenges(el.dataset.op, skill);
  });

  document.querySelectorAll(".diff-boss[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatBossReplayText(skill);
    el.hidden = !canReplayChallenges(el.dataset.op, skill);
  });

  document.querySelectorAll(".kp-diff-ready[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatReadyText(skill);
    el.classList.toggle("is-qualified", Boolean(skill?.bossAttemptedForLevel));
    el.classList.toggle("is-locked", !skill?.bossReady);
    el.classList.toggle("is-ready-attention", shouldPromptBossAttempt(skill));
    el.classList.remove("needs-ready");
    el.disabled = !skill?.bossReady;
    el.title = getBossButtonTitle(skill);
    el.setAttribute("aria-pressed", skill?.bossAttemptedForLevel ? "true" : "false");
  });

  document.querySelectorAll(".kp-diff-blitz[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatBlitzText(skill);
    el.hidden = !canReplayChallenges(el.dataset.op, skill);
  });

  document.querySelectorAll(".kp-diff-wave[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatWaveText(skill);
    el.hidden = !canReplayChallenges(el.dataset.op, skill);
  });

  document.querySelectorAll(".kp-diff-boss[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatBossReplayText(skill);
    el.hidden = !canReplayChallenges(el.dataset.op, skill);
  });
}

// ============================================================
// 13b. Stats Popup
// ============================================================

function getVisualAccuracy(opKey, statsKey, asked, correct) {
  const problem = opKey && statsKey ? getProgressProblem(opKey, statsKey) : null;
  if (problem?.attempts > 0) return problemCurrentAccuracy(problem);
  if (!asked) return 0;
  return correct / asked;
}

function mixRGB(from, to, t) {
  const ratio = clamp(0, 1, t);
  return from.map((value, index) => Math.round(lerp(value, to[index], ratio)));
}

function getAccuracyRGB(accuracy, attempted = false) {
  if (!attempted) return null;
  const red = [239, 68, 68];
  const yellow = [250, 204, 21];
  const green = [34, 197, 94];
  const score = clamp(0, 1, accuracy);
  return score < 0.5
    ? mixRGB(red, yellow, score / 0.5)
    : mixRGB(yellow, green, (score - 0.5) / 0.5);
}

function getEvidenceRatio(asked) {
  if (asked <= 0) return 0;
  return clamp(0, 1, asked / 5);
}

function getConfidenceAlpha(asked) {
  if (asked === 0) return 0;
  return clamp(0.18, 1, 0.18 + getEvidenceRatio(asked) * 0.82);
}

function getAccuracyColor(asked, correct, opKey = null, statsKey = null) {
  const accuracy = getVisualAccuracy(opKey, statsKey, asked, correct);
  const rgb = getAccuracyRGB(accuracy, asked > 0);
  if (!rgb) return "#1a1a2e"; // never asked — dark
  const alpha = getConfidenceAlpha(asked);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(2)})`;
}

function getAccuracyText(asked, correct) {
  if (asked === 0) return "—";
  return `${Math.round((correct / asked) * 100)}% (${correct}/${asked})`;
}

function formatStatsPercent(value) {
  return `${Math.round(clamp(0, 1, value) * 100)}%`;
}

function getProgressProblem(opKey, statsKey) {
  return progressProfile.skills?.[opKey]?.problems?.[statsKey] || null;
}

function getStatsTooltip(opKey, statsKey, label, asked, correct) {
  const problem = getProgressProblem(opKey, statsKey);
  const attempts = problem?.attempts ?? asked;
  const correctCount = problem?.correct ?? correct;
  const wrong = problem?.wrong ?? 0;
  const missed = problem?.missed ?? 0;
  const helped = problem?.helped ?? 0;
  const lifetime = attempts > 0 ? correctCount / attempts : 0;
  const current = problem ? problemCurrentAccuracy(problem) : lifetime;
  const bossMastered = problem ? isBossMasteredProblem(problem) : attempts >= 3 && lifetime >= 0.9;
  const lines = [
    label,
    attempts > 0 ? `Attempts: ${attempts}` : "No attempts yet",
    `Correct: ${correctCount}`,
  ];
  if (attempts > 0) {
    lines.push(`Wrong: ${wrong}`);
    lines.push(`Missed: ${missed}`);
    if (helped > 0) lines.push(`Helped: ${helped}`);
    lines.push(`Lifetime accuracy: ${formatStatsPercent(lifetime)}`);
    lines.push(`Current accuracy: ${formatStatsPercent(current)}`);
    lines.push(`Boss mastered: ${bossMastered ? "yes" : "no"} (needs 3 attempts and 90% current accuracy)`);
  }
  return lines.join("\n");
}

function closeStatsTooltip() {
  const tooltip = document.getElementById("statsHoverTooltip");
  if (tooltip) tooltip.remove();
}

function positionStatsTooltip(tooltip, event = null) {
  const margin = 12;
  const x = event?.clientX ?? window.innerWidth / 2;
  const y = event?.clientY ?? window.innerHeight / 2;
  const rect = tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - margin, Math.max(margin, x + 14));
  const top = Math.min(window.innerHeight - rect.height - margin, Math.max(margin, y + 14));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showStatsTooltip(text, event = null) {
  if (!text) return;
  let tooltip = document.getElementById("statsHoverTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "statsHoverTooltip";
    tooltip.className = "stats-hover-tooltip";
    tooltip.setAttribute("role", "tooltip");
    document.body.appendChild(tooltip);
  }
  tooltip.textContent = text;
  tooltip.hidden = false;
  positionStatsTooltip(tooltip, event);
}

function attachStatsTooltip(el, text) {
  el.dataset.tooltip = text;
  el.setAttribute("aria-label", text);
  el.addEventListener("pointerenter", (event) => showStatsTooltip(text, event));
  el.addEventListener("pointermove", (event) => {
    const tooltip = document.getElementById("statsHoverTooltip");
    if (tooltip && !tooltip.hidden) positionStatsTooltip(tooltip, event);
  });
  el.addEventListener("pointerleave", closeStatsTooltip);
  el.addEventListener("focus", () => showStatsTooltip(text));
  el.addEventListener("blur", closeStatsTooltip);
}

function showStatsPopup(opKey) {
  // Remove existing popup if any
  closeStatsPopup();

  const stats = problemStats[opKey];
  const overlay = document.createElement("div");
  overlay.className = "overlay stats-overlay";
  overlay.id = "statsOverlay";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeStatsPopup();
  });

  const card = document.createElement("div");
  card.className = "card stats-card";

  const header = document.createElement("h2");
  header.textContent = `${opDisplayNames[opKey]} — Problem Accuracy`;
  card.appendChild(header);

  const note = document.createElement("p");
  note.className = "stats-note";
  note.textContent = "These colors match the falling drops: black is unseen, hue shows accuracy from red to yellow to green, and brighter color means more attempts.";
  card.appendChild(note);

  if (opKey === "si") {
    card.appendChild(buildSIReferenceTable());
    card.appendChild(buildListStats(opKey, stats));
  } else if (opKey === "f10" || opKey === "factor" || opKey === "shapes") {
    card.appendChild(buildListStats(opKey, stats));
  } else {
    card.appendChild(buildGridStats(opKey, stats));
  }

  // Legend
  const legend = document.createElement("div");
  legend.className = "stats-legend";
  const items = [
    ["#1a1a2e", "Never asked"],
    ["#ef4444", "0% accuracy"],
    ["#f59e0b", "25%"],
    ["#facc15", "50%"],
    ["#84cc16", "75%"],
    ["#22c55e", "100%"],
    ["rgba(34, 197, 94, 0.34)", "1 try"],
    ["rgba(34, 197, 94, 1)", "5+ tries"],
  ];
  items.forEach(([color, text]) => {
    const item = document.createElement("div");
    item.className = "stats-legend-item";
    const swatch = document.createElement("span");
    swatch.className = "stats-swatch";
    swatch.style.background = color;
    const lbl = document.createElement("span");
    lbl.textContent = text;
    item.appendChild(swatch);
    item.appendChild(lbl);
    legend.appendChild(item);
  });
  card.appendChild(legend);

  const closeBtn = document.createElement("button");
  closeBtn.className = "primary";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", closeStatsPopup);
  card.appendChild(closeBtn);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function closeStatsPopup() {
  const existing = document.getElementById("statsOverlay");
  if (existing) existing.remove();
  closeStatsTooltip();
}

// ============================================================
// 13c. Results Popup
// ============================================================

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatResponseTime(ms) {
  if (ms === null || ms === undefined) return "—";
  return `${(ms / 1000).toFixed(1)}s avg`;
}

function formatPracticeSuggestion(problem) {
  if (problem.kind === "new") return `${problem.text} (new)`;
  return `${problem.text} (${problem.mastery}%)`;
}

function buildChallengeRow(skill) {
  if (!skill.blitzUnlockedLevel) return null;
  const row = document.createElement("div");
  row.className = "results-pressure-row";

  const label = document.createElement("span");
  label.className = "results-pressure-label";
  label.textContent = "Challenges:";
  row.appendChild(label);

  const list = document.createElement("div");
  list.className = "results-challenge-levels";
  const levels = skill.challengeBestsByLevel || [];
  levels.forEach((entry) => {
    const played = Boolean(entry.blitz || entry.wave || entry.boss?.durationMs);
    const chip = document.createElement("span");
    chip.className = `results-pressure-chip${played ? " is-cleared" : ""}`;
    if (played) {
      const parts = [
        entry.blitz ? `Blitz ${entry.blitz.score}` : "Blitz –",
        entry.wave ? `Wave ${entry.wave.score}` : "Wave –",
        entry.boss?.durationMs ? `Boss ${formatDuration(entry.boss.durationMs)}` : "Boss –",
      ];
      chip.textContent = `L${entry.level}: ${parts.join(" · ")}`;
    } else {
      chip.textContent = `L${entry.level}: not played`;
    }
    list.appendChild(chip);
  });
  row.appendChild(list);

  return row;
}

function buildResultsPopup() {
  closeResultsPopup();
  closeSessionLogPopup();
  closeSessionReportPopup();

  const summary = summarizeProfile(progressProfile);
  const overlay = document.createElement("div");
  overlay.className = "overlay results-overlay";
  overlay.id = "resultsOverlay";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeResultsPopup();
  });

  const card = document.createElement("div");
  card.className = "card results-card";

  const header = document.createElement("div");
  header.className = "results-header";
  const title = document.createElement("h2");
  title.textContent = "Learning Results";
  const overall = document.createElement("div");
  overall.className = "results-overall";
  overall.textContent = `${summary.overallReadiness}% overall readiness`;
  header.appendChild(title);
  header.appendChild(overall);
  card.appendChild(header);

  const sub = document.createElement("p");
  sub.className = "results-sub";
  sub.textContent = "Mastered % is the share of current-level problems with at least 3 attempts and at least 90% current accuracy. Boss unlocks at 80%.";
  card.appendChild(sub);

  const list = document.createElement("div");
  list.className = "results-list";

  for (const opKey of Object.keys(opConfig)) {
    const skill = summary.skills[opKey];
    const row = document.createElement("div");
    row.className = "results-row";

    const top = document.createElement("div");
    top.className = "results-row-top";

    const name = document.createElement("div");
    name.className = "results-name";
    name.textContent = opDisplayNames[opKey] || opKey;

    const readiness = document.createElement("div");
    readiness.className = "results-readiness";
    readiness.textContent = `${skill.readiness}%`;

    top.appendChild(name);
    top.appendChild(readiness);

    const meter = document.createElement("div");
    meter.className = "results-meter";
    const fill = document.createElement("div");
    fill.className = "results-meter-fill";
    fill.style.width = `${skill.readiness}%`;
    meter.appendChild(fill);

    const details = document.createElement("div");
    details.className = "results-details";
  const bossText = skill.bossReady
      ? "Boss ready"
      : `${Math.max(0, skill.bossThreshold - skill.readiness)}% to boss`;
    details.textContent = [
      `Level ${skill.currentLevel}`,
      bossText,
      `${skill.attempts} attempts`,
      `${skill.distinct}/${skill.universeCount} seen`,
      `${skill.masteredCount} mastered`,
      `${formatPercent(skill.accuracy)} accuracy`,
      `${formatPercent(skill.recentAccuracy)} recent`,
      formatResponseTime(skill.averageResponseMs),
    ].join(" · ");

    row.appendChild(top);
    row.appendChild(meter);
    row.appendChild(details);
    const challengeRow = buildChallengeRow(skill);
    if (challengeRow) row.appendChild(challengeRow);

    if (skill.practiceSuggestions.length > 0) {
      const weak = document.createElement("div");
      weak.className = "results-weak";
      weak.textContent = `Practice next: ${skill.practiceSuggestions
        .map(formatPracticeSuggestion)
        .join(", ")}`;
      row.appendChild(weak);
    }

    list.appendChild(row);
  }

  card.appendChild(list);

  const closeBtn = document.createElement("button");
  closeBtn.className = "primary";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", closeResultsPopup);
  card.appendChild(closeBtn);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function closeResultsPopup() {
  const existing = document.getElementById("resultsOverlay");
  if (existing) existing.remove();
}

function formatSessionStartedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSessionAccuracy(stats) {
  if (!stats || stats.attempts === 0) return "no practice attempts";
  return `${stats.correct}/${stats.attempts} correct (${formatPercent(stats.accuracy)})`;
}

function getSessionSummaryById(sessionId) {
  return summarizeSessionLog(progressProfile, 20).find((session) => session.id === sessionId) || null;
}

function formatMasteryDelta(value) {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `${value}%`;
  return "no change";
}

function formatSessionLevelProgress(level) {
  const start = level.started;
  const end = level.ended;
  const mastered = `${start.masteredCount}/${start.universeCount} -> ${end.masteredCount}/${end.universeCount}`;
  return `L${level.level} ${start.readiness}% -> ${end.readiness}% (${formatMasteryDelta(level.masteryDelta)}; ${mastered} mastered)`;
}

function buildSessionLogPopup() {
  closeWelcomeMenu({ focus: false });
  closeTutorialOverlay({ focus: false });
  closeLoginPopup();
  closeStatsPopup();
  closeResultsPopup();
  closeSessionLogPopup();
  closeSessionReportPopup();
  heartbeatActiveSession({ persist: true });

  const sessions = summarizeSessionLog(progressProfile, 20);
  const overlay = document.createElement("div");
  overlay.className = "overlay session-log-overlay";
  overlay.id = "sessionLogOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Session log");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSessionLogPopup();
  });

  const card = document.createElement("div");
  card.className = "card session-log-card";

  const header = document.createElement("div");
  header.className = "session-log-header";
  const title = document.createElement("h2");
  title.textContent = "Session Log";
  const active = document.createElement("div");
  active.className = "session-log-active";
  active.textContent = getActiveProfileName();
  header.appendChild(title);
  header.appendChild(active);
  card.appendChild(header);

  const sub = document.createElement("p");
  sub.className = "session-log-sub";
  sub.textContent = "Each visit or player switch creates a local session. Boss/challenge work is listed separately from ordinary practice accuracy.";
  card.appendChild(sub);

  const list = document.createElement("div");
  list.className = "session-log-list";

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "session-log-empty";
    empty.textContent = "No sessions recorded yet.";
    list.appendChild(empty);
  } else {
    sessions.forEach((session) => {
      const row = document.createElement("div");
      row.className = "session-log-row";
      row.classList.toggle("is-current", session.id === activeSessionId);

      const top = document.createElement("div");
      top.className = "session-log-row-top";
      const when = document.createElement("div");
      when.className = "session-log-when";
      when.textContent = `${formatSessionStartedAt(session.startedAt)}${session.id === activeSessionId ? " · current" : ""}`;
      const duration = document.createElement("div");
      duration.className = "session-log-duration";
      duration.textContent = formatDuration(session.durationMs);
      const reportBtn = document.createElement("button");
      reportBtn.type = "button";
      reportBtn.className = "session-log-report";
      reportBtn.textContent = "Report";
      reportBtn.addEventListener("click", () => buildSessionReportPopup(session.id));
      top.appendChild(when);
      top.appendChild(duration);
      top.appendChild(reportBtn);

      const details = document.createElement("div");
      details.className = "session-log-details";
      const practice = `Practice: ${formatSessionAccuracy(session.practice)}`;
      const bossSolved = session.assessment.correct > 0
        ? `Boss/challenge solved: ${session.assessment.correct}`
        : "Boss/challenge solved: 0";
      const bossPressure = session.assessment.wrong + session.assessment.missed > 0
        ? `stress misses/wrongs: ${session.assessment.missed + session.assessment.wrong}`
        : "stress misses/wrongs: 0";
      const challenges = session.challenges.started || session.challenges.completed
        ? `Challenges: ${session.challenges.started} started, ${session.challenges.completed} completed`
        : "Challenges: none";
      details.textContent = [practice, bossSolved, bossPressure, challenges].join(" · ");

      row.appendChild(top);
      row.appendChild(details);
      list.appendChild(row);
    });
  }

  card.appendChild(list);

  const closeBtn = document.createElement("button");
  closeBtn.className = "primary";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", closeSessionLogPopup);
  card.appendChild(closeBtn);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function closeSessionLogPopup() {
  const existing = document.getElementById("sessionLogOverlay");
  if (existing) existing.remove();
}

function buildSessionReportPopup(sessionId) {
  heartbeatActiveSession({ persist: true });
  const session = getSessionSummaryById(sessionId);
  if (!session) return;
  closeSessionLogPopup();
  closeSessionReportPopup();

  const overlay = document.createElement("div");
  overlay.className = "overlay session-report-overlay";
  overlay.id = "sessionReportOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Session report");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSessionReportPopup();
  });

  const card = document.createElement("div");
  card.className = "card session-report-card";

  const header = document.createElement("div");
  header.className = "session-report-header";
  const title = document.createElement("h2");
  title.textContent = "Session Report";
  const meta = document.createElement("div");
  meta.className = "session-report-meta";
  meta.textContent = `${formatSessionStartedAt(session.startedAt)} · ${formatDuration(session.durationMs)}`;
  header.appendChild(title);
  header.appendChild(meta);
  card.appendChild(header);

  const sub = document.createElement("p");
  sub.className = "session-report-sub";
  sub.textContent = "Per-operation progress for this saved session. Time is engaged problem time, capped per problem so idle tabs do not inflate it.";
  card.appendChild(sub);

  const summary = document.createElement("div");
  summary.className = "session-report-summary";
  summary.textContent = [
    `Practice ${formatSessionAccuracy(session.practice)}`,
    `Boss/challenge solved ${session.assessment.correct}`,
    `Challenges ${session.challenges.started} started / ${session.challenges.completed} completed`,
  ].join(" · ");
  card.appendChild(summary);

  const list = document.createElement("div");
  list.className = "session-report-list";
  if (session.operations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "session-report-empty";
    empty.textContent = "No problem-type work was recorded in this session.";
    list.appendChild(empty);
  } else {
    session.operations.forEach((operation) => {
      const row = document.createElement("div");
      row.className = "session-report-row";

      const rowTop = document.createElement("div");
      rowTop.className = "session-report-row-top";
      const name = document.createElement("div");
      name.className = "session-report-name";
      name.textContent = opDisplayNames[operation.opKey] || operation.opKey;
      const time = document.createElement("div");
      time.className = "session-report-time";
      time.textContent = formatDuration(operation.durationMs);
      rowTop.appendChild(name);
      rowTop.appendChild(time);

      const stats = document.createElement("div");
      stats.className = "session-report-stats";
      const totalCorrect = operation.practice.correct + operation.assessment.correct;
      const totalMissed = operation.practice.missed + operation.assessment.missed;
      const totalWrong = operation.practice.wrong + operation.assessment.wrong;
      const pieces = [
        `Correct/missed: ${totalCorrect}/${totalMissed}`,
        `Practice attempts: ${operation.practice.attempts}`,
      ];
      if (totalWrong > 0) pieces.push(`Wrong: ${totalWrong}`);
      if (operation.assessment.attempts > 0) {
        pieces.push(`Boss/challenge attempts: ${operation.assessment.attempts}`);
      }
      if (operation.challenges.started || operation.challenges.completed) {
        pieces.push(`Challenges: ${operation.challenges.started} started, ${operation.challenges.completed} completed`);
      }
      stats.textContent = pieces.join(" · ");

      const mastery = document.createElement("div");
      mastery.className = "session-report-mastery";
      const levels = Array.isArray(operation.levels) && operation.levels.length > 0
        ? operation.levels
        : [{
          level: operation.started.level,
          started: operation.started,
          ended: operation.ended,
          masteryDelta: operation.masteryDelta,
        }];
      mastery.textContent = `Mastery by level: ${levels.map(formatSessionLevelProgress).join(" · ")}`;

      row.appendChild(rowTop);
      row.appendChild(stats);
      row.appendChild(mastery);
      list.appendChild(row);
    });
  }
  card.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "session-report-actions";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "session-report-back";
  backBtn.textContent = "Back to Log";
  backBtn.addEventListener("click", () => {
    closeSessionReportPopup();
    buildSessionLogPopup();
  });
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "primary";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", closeSessionReportPopup);
  actions.appendChild(backBtn);
  actions.appendChild(closeBtn);
  card.appendChild(actions);

  const donateNote = document.createElement("p");
  donateNote.className = "session-report-donate-note";
  donateNote.append("Enjoying and benefiting? Please consider ");
  const donate = document.createElement("a");
  donate.className = "session-report-donate";
  donate.href = SUPPORT_URL;
  donate.target = "_blank";
  donate.rel = "noopener noreferrer";
  donate.textContent = "donating";
  donateNote.appendChild(donate);
  donateNote.append(".");
  card.appendChild(donateNote);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function closeSessionReportPopup() {
  const existing = document.getElementById("sessionReportOverlay");
  if (existing) existing.remove();
}

// ============================================================
// 13d. Welcome Menu and Tutorial
// ============================================================

function closeWelcomeMenu({ markSeen = false, focus = true } = {}) {
  const existing = document.getElementById("welcomeOverlay");
  if (existing) existing.remove();
  if (markSeen) markWelcomeSeen();
  if (focus) answerInput.focus();
}

function rebuildWelcomeMenu() {
  const wasVisible = Boolean(document.getElementById("welcomeOverlay"));
  if (wasVisible) buildWelcomeMenu({ firstVisit: false });
}

function selectWelcomeProfile(profileId) {
  saveProfile(progressProfile);
  const selected = switchStoredProfile(profileId);
  activateProfile(selected);
  rebuildWelcomeMenu();
}

function buildWelcomeProfileList() {
  const wrap = document.createElement("div");
  wrap.className = "welcome-profile-list";
  const profiles = getProfileList();
  profiles.forEach((profile) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "welcome-profile-btn";
    btn.classList.toggle("active", profile.active);
    btn.setAttribute("aria-pressed", profile.active ? "true" : "false");
    btn.addEventListener("click", () => selectWelcomeProfile(profile.id));

    const name = document.createElement("span");
    name.className = "welcome-profile-name";
    name.textContent = profile.name === "Local Player"
      ? getText("welcome.localPlayer")
      : profile.name;
    const meta = document.createElement("span");
    meta.className = "welcome-profile-meta";
    meta.textContent = profile.active
      ? getText("welcome.playingNow")
      : formatProfileUpdatedAt(profile.updatedAt);

    btn.appendChild(name);
    btn.appendChild(meta);
    wrap.appendChild(btn);
  });
  return wrap;
}

function buildWelcomeCreateForm() {
  const form = document.createElement("form");
  form.className = "welcome-create";
  const input = document.createElement("input");
  input.id = "welcomeProfileName";
  input.type = "text";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.placeholder = getText("welcome.newPlayerPlaceholder");
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = getText("common.create");
  const error = document.createElement("div");
  error.className = "welcome-error";
  error.setAttribute("role", "alert");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      error.textContent = getText("welcome.emptyNameError");
      input.focus();
      return;
    }
    saveProfile(progressProfile);
    const created = createStoredProfile(name);
    activateProfile(created);
    buildWelcomeMenu({ firstVisit: false });
  });

  form.appendChild(input);
  form.appendChild(btn);
  form.appendChild(error);
  return form;
}

function buildWelcomeMenu({ firstVisit = false } = {}) {
  closeWelcomeMenu({ focus: false });
  closeTutorialOverlay({ focus: false });
  closeLoginPopup();
  closeStatsPopup();
  closeResultsPopup();
  closeSessionLogPopup();
  closeSessionReportPopup();

  const overlay = document.createElement("div");
  overlay.className = "overlay welcome-overlay";
  overlay.id = "welcomeOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", getText("welcome.ariaLabel"));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !firstVisit) closeWelcomeMenu();
  });

  const card = document.createElement("div");
  card.className = "card welcome-card";

  const hero = document.createElement("div");
  hero.className = "welcome-hero";
  const badge = document.createElement("div");
  badge.className = "welcome-badge";
  badge.textContent = "MR";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("div");
  eyebrow.className = "welcome-eyebrow";
  eyebrow.textContent = firstVisit
    ? getText("welcome.firstVisitEyebrow")
    : getText("welcome.menuEyebrow");
  const title = document.createElement("h1");
  title.textContent = getText("welcome.title");
  const sub = document.createElement("p");
  sub.textContent = getText("welcome.subtitle");
  copy.appendChild(eyebrow);
  copy.appendChild(title);
  copy.appendChild(sub);
  hero.appendChild(badge);
  hero.appendChild(copy);

  const panels = document.createElement("div");
  panels.className = "welcome-panels";

  const playerPanel = document.createElement("section");
  playerPanel.className = "welcome-panel";
  const playerTitle = document.createElement("h2");
  playerTitle.textContent = getText("welcome.playerTitle");
  const playerSub = document.createElement("p");
  playerSub.textContent = getText("welcome.playerSubtitle");
  playerPanel.appendChild(playerTitle);
  playerPanel.appendChild(playerSub);
  playerPanel.appendChild(buildWelcomeProfileList());
  playerPanel.appendChild(buildWelcomeCreateForm());

  const actionPanel = document.createElement("section");
  actionPanel.className = "welcome-panel welcome-action-panel";
  const actionTitle = document.createElement("h2");
  const playerName = getActiveProfileName() === "Local Player"
    ? getText("welcome.localPlayer")
    : getActiveProfileName();
  actionTitle.textContent = formatText(getText("welcome.playAs"), { playerName });
  const actionSub = document.createElement("p");
  actionSub.textContent = getText("welcome.actionSubtitle");
  const actions = document.createElement("div");
  actions.className = "welcome-actions";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "primary welcome-play";
  playBtn.id = "welcomePlay";
  playBtn.textContent = getText("common.play");
  playBtn.addEventListener("click", () => {
    closeWelcomeMenu({ markSeen: true });
  });

  const tutorialBtn = document.createElement("button");
  tutorialBtn.type = "button";
  tutorialBtn.className = "welcome-tutorial";
  tutorialBtn.id = "welcomeTutorial";
  tutorialBtn.textContent = getText("welcome.tutorial");
  tutorialBtn.addEventListener("click", () => {
    closeWelcomeMenu({ focus: false });
    startTutorial({ fromWelcome: true });
  });

  const loginBtn = document.createElement("button");
  loginBtn.type = "button";
  loginBtn.className = "welcome-login";
  loginBtn.textContent = getText("welcome.fullLoginMenu");
  loginBtn.addEventListener("click", () => {
    closeWelcomeMenu({ focus: false });
    buildLoginPopup();
  });

  actions.appendChild(playBtn);
  actions.appendChild(tutorialBtn);
  actions.appendChild(loginBtn);

  const supportBox = document.createElement("div");
  supportBox.className = "welcome-support";
  const supportTitle = document.createElement("div");
  supportTitle.className = "welcome-support-title";
  supportTitle.textContent = getText("support.welcomeTitle");
  const supportBody = document.createElement("p");
  supportBody.textContent = getText("support.welcomeBody");
  const supportAnchor = document.createElement("a");
  supportAnchor.href = SUPPORT_URL;
  supportAnchor.target = "_blank";
  supportAnchor.rel = "noopener noreferrer";
  supportAnchor.textContent = getText("support.welcomeLink");
  supportBox.appendChild(supportTitle);
  supportBox.appendChild(supportBody);
  supportBox.appendChild(supportAnchor);

  actionPanel.appendChild(actionTitle);
  actionPanel.appendChild(actionSub);
  actionPanel.appendChild(actions);
  actionPanel.appendChild(supportBox);

  panels.appendChild(playerPanel);
  panels.appendChild(actionPanel);
  card.appendChild(hero);
  card.appendChild(panels);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  playBtn.focus();
}

function closeTutorialOverlay({ markSeen = false, focus = true } = {}) {
  const existing = document.getElementById("tutorialOverlay");
  if (existing) existing.remove();
  if (markSeen) markWelcomeSeen();
  if (focus) answerInput.focus();
}

function getTutorialTargetRect(selector) {
  if (!selector) return null;
  const target = document.querySelector(selector);
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

function positionTutorialSpotlight(spotlight, rect) {
  if (!rect) {
    spotlight.hidden = true;
    return;
  }
  const margin = 8;
  spotlight.hidden = false;
  spotlight.style.left = `${Math.max(8, rect.left - margin)}px`;
  spotlight.style.top = `${Math.max(8, rect.top - margin)}px`;
  spotlight.style.width = `${Math.min(window.innerWidth - 16, rect.width + margin * 2)}px`;
  spotlight.style.height = `${Math.min(window.innerHeight - 16, rect.height + margin * 2)}px`;
}

function startTutorial({ fromWelcome = false } = {}) {
  if (TUTORIAL_STEPS.length === 0) return;
  closeWelcomeMenu({ focus: false });
  closeTutorialOverlay({ focus: false });
  tutorialStepIndex = 0;
  tutorialFromWelcome = fromWelcome;
  renderTutorialStep();
}

function renderTutorialStep({ fromWelcome = tutorialFromWelcome } = {}) {
  tutorialFromWelcome = fromWelcome;
  closeTutorialOverlay({ focus: false });
  const step = TUTORIAL_STEPS[tutorialStepIndex] || TUTORIAL_STEPS[0];
  const overlay = document.createElement("div");
  overlay.className = "overlay tutorial-overlay";
  overlay.id = "tutorialOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", getText("tutorial.ariaLabel"));

  const spotlight = document.createElement("div");
  spotlight.className = "tutorial-spotlight";
  positionTutorialSpotlight(spotlight, getTutorialTargetRect(step.target));

  const card = document.createElement("div");
  card.className = "card tutorial-card";

  const progress = document.createElement("div");
  progress.className = "tutorial-progress";
  TUTORIAL_STEPS.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.className = "tutorial-dot";
    dot.classList.toggle("active", index === tutorialStepIndex);
    dot.setAttribute("aria-hidden", "true");
    progress.appendChild(dot);
  });

  const kicker = document.createElement("div");
  kicker.className = "tutorial-kicker";
  kicker.textContent = formatText(getText("tutorial.progressLabel"), {
    kicker: step.kicker,
    current: tutorialStepIndex + 1,
    total: TUTORIAL_STEPS.length,
  });
  const title = document.createElement("h2");
  title.textContent = step.title;
  const body = document.createElement("p");
  body.textContent = step.body;
  const tipText = String(step.tip || "").trim();

  const actions = document.createElement("div");
  actions.className = "tutorial-actions";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "tutorial-skip";
  skipBtn.textContent = fromWelcome
    ? getText("tutorial.skipToPlay")
    : getText("common.close");
  skipBtn.addEventListener("click", () => closeTutorialOverlay({ markSeen: true }));

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.textContent = getText("common.back");
  backBtn.disabled = tutorialStepIndex === 0;
  backBtn.addEventListener("click", () => {
    tutorialStepIndex = Math.max(0, tutorialStepIndex - 1);
    renderTutorialStep({ fromWelcome });
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "primary tutorial-next";
  nextBtn.textContent = tutorialStepIndex === TUTORIAL_STEPS.length - 1
    ? getText("common.play")
    : getText("common.next");
  nextBtn.addEventListener("click", () => {
    if (tutorialStepIndex >= TUTORIAL_STEPS.length - 1) {
      closeTutorialOverlay({ markSeen: true });
      return;
    }
    tutorialStepIndex += 1;
    renderTutorialStep({ fromWelcome });
  });

  actions.appendChild(skipBtn);
  actions.appendChild(backBtn);
  actions.appendChild(nextBtn);

  card.appendChild(progress);
  card.appendChild(kicker);
  card.appendChild(title);
  card.appendChild(body);
  if (tipText) {
    const tip = document.createElement("div");
    tip.className = "tutorial-tip";
    tip.textContent = tipText;
    card.appendChild(tip);
  }
  card.appendChild(actions);
  overlay.appendChild(spotlight);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  nextBtn.focus();
}

function showNextTutorialStep() {
  if (!document.getElementById("tutorialOverlay")) return;
  tutorialStepIndex = Math.min(TUTORIAL_STEPS.length - 1, tutorialStepIndex + 1);
  renderTutorialStep();
}

function showPreviousTutorialStep() {
  if (!document.getElementById("tutorialOverlay")) return;
  tutorialStepIndex = Math.max(0, tutorialStepIndex - 1);
  renderTutorialStep();
}

// ============================================================
// 13e. Login Popup
// ============================================================

function getActiveProfileName() {
  return progressProfile?.user?.name || "Login";
}

function getLoginLinkText() {
  const name = getActiveProfileName();
  return name === "Local Player" ? "Login" : name;
}

function updateLoginLink() {
  const text = getLoginLinkText();
  const title = text === "Login" ? "Select or create a player" : `Player: ${text}`;
  ["loginLink", "touchLoginLink"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.title = title;
    el.setAttribute("aria-label", title);
  });
}

function updateStaticText() {
  const menuText = getText("welcome.menuLink");
  ["menuLink", "touchMenuLink"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = menuText;
  });
  const supportText = getText("support.label");
  const supportShortText = getText("support.shortLabel");
  const supportLink = document.getElementById("supportLink");
  if (supportLink) supportLink.textContent = supportText;
  const touchSupportLink = document.getElementById("touchSupportLink");
  if (touchSupportLink) touchSupportLink.textContent = supportShortText;
}

function formatProfileUpdatedAt(value) {
  if (!value) return "No saved practice yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function buildLoginPopup() {
  closeWelcomeMenu({ focus: false });
  closeTutorialOverlay({ focus: false });
  closeLoginPopup();
  closeStatsPopup();
  closeResultsPopup();

  const overlay = document.createElement("div");
  overlay.className = "overlay login-overlay";
  overlay.id = "loginOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Select player");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeLoginPopup();
  });

  const card = document.createElement("div");
  card.className = "card login-card";

  const header = document.createElement("div");
  header.className = "login-header";
  const title = document.createElement("h2");
  title.textContent = "Players";
  const active = document.createElement("div");
  active.className = "login-active";
  active.textContent = `Current: ${getActiveProfileName()}`;
  header.appendChild(title);
  header.appendChild(active);
  card.appendChild(header);

  const list = document.createElement("div");
  list.className = "login-list";
  const profiles = getProfileList();
  profiles.forEach((profile) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "login-profile-btn";
    btn.classList.toggle("active", profile.active);
    btn.setAttribute("aria-pressed", profile.active ? "true" : "false");
    btn.addEventListener("click", () => {
      heartbeatActiveSession();
      saveProfile(progressProfile);
      const selected = switchStoredProfile(profile.id);
      activateProfile(selected);
      closeLoginPopup();
    });

    const name = document.createElement("span");
    name.className = "login-profile-name";
    name.textContent = profile.name;
    const meta = document.createElement("span");
    meta.className = "login-profile-meta";
    meta.textContent = profile.active ? "Active" : formatProfileUpdatedAt(profile.updatedAt);
    btn.appendChild(name);
    btn.appendChild(meta);
    list.appendChild(btn);
  });
  card.appendChild(list);

  const form = document.createElement("form");
  form.className = "login-create";
  const label = document.createElement("label");
  label.setAttribute("for", "profileNameInput");
  label.textContent = "Create player";
  const row = document.createElement("div");
  row.className = "login-create-row";
  const input = document.createElement("input");
  input.id = "profileNameInput";
  input.type = "text";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.placeholder = "Name";
  const createBtn = document.createElement("button");
  createBtn.type = "submit";
  createBtn.className = "primary";
  createBtn.textContent = "Create";
  const error = document.createElement("div");
  error.className = "login-error";
  error.setAttribute("role", "alert");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      error.textContent = "Enter a player name.";
      input.focus();
      return;
    }
    heartbeatActiveSession();
    saveProfile(progressProfile);
    const created = createStoredProfile(name);
    activateProfile(created);
    closeLoginPopup();
  });

  row.appendChild(input);
  row.appendChild(createBtn);
  form.appendChild(label);
  form.appendChild(row);
  form.appendChild(error);
  card.appendChild(form);

  const actions = document.createElement("div");
  actions.className = "login-actions";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "login-clear";
  clearBtn.textContent = "Clear Current Stats";
  clearBtn.addEventListener("click", () => {
    heartbeatActiveSession();
    const resetProfile = resetStoredProfile();
    activateProfile(resetProfile);
    closeLoginPopup();
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "login-close";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", closeLoginPopup);

  actions.appendChild(clearBtn);
  actions.appendChild(closeBtn);
  card.appendChild(actions);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  input.focus();
}

function closeLoginPopup() {
  const existing = document.getElementById("loginOverlay");
  if (existing) existing.remove();
}

function buildGridStats(opKey, stats) {
  // Always show the full range for this op type
  const gridMax = (opKey === "mul" || opKey === "div") ? 12 : 20;
  const currentRange = getDifficultyRange(opKey, opConfig[opKey].difficulty);

  const table = document.createElement("table");
  table.className = "stats-grid";

  // Header row
  const thead = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = opKey === "div" ? "÷" : operators[opKey].symbol;
  thead.appendChild(corner);
  for (let b = 1; b <= gridMax; b++) {
    const th = document.createElement("th");
    th.textContent = b;
    thead.appendChild(th);
  }
  table.appendChild(thead);

  // Data rows
  for (let a = 1; a <= gridMax; a++) {
    const tr = document.createElement("tr");
    const rowHeader = document.createElement("th");
    rowHeader.textContent = a;
    tr.appendChild(rowHeader);

    for (let b = 1; b <= gridMax; b++) {
      const td = document.createElement("td");

      // Skip impossible cells: sub where b > a
      if (opKey === "sub" && b > a) {
        td.className = "stats-cell stats-cell-na";
        tr.appendChild(td);
        continue;
      }

      const key = `${a},${b}`;
      const entry = stats[key];
      const asked = entry ? entry.asked : 0;
      const correct = entry ? entry.correct : 0;

      const inRange = a <= currentRange.max && b <= currentRange.max;
      const label = `${a} ${operators[opKey]?.symbol || ""} ${b} = ${
        opKey === "div" ? a : operators[opKey].fn(a, b)
      }`;
      td.className = "stats-cell" + (inRange ? "" : " stats-cell-outside");
      td.style.background = getAccuracyColor(asked, correct, opKey, key);
      attachStatsTooltip(td, getStatsTooltip(opKey, key, label, asked, correct));

      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  const wrap = document.createElement("div");
  wrap.className = "stats-grid-wrap";
  wrap.appendChild(table);
  return wrap;
}


function buildSIReferenceTable() {
  const currentDifficulty = opConfig.si.difficulty;
  const unlocked = getSIPrefixesForDifficulty(currentDifficulty);
  const unlockedSyms = new Set(unlocked.map((p) => p.sym));

  // All prefixes in descending exponent order
  const allPrefixes = [
    { sym: "T", exp: 12, name: "tera" },
    { sym: "G", exp: 9, name: "giga" },
    { sym: "M", exp: 6, name: "mega" },
    { sym: "k", exp: 3, name: "kilo" },
    { sym: "h", exp: 2, name: "hecto" },
    { sym: "da", exp: 1, name: "deca" },
    { sym: "", exp: 0, name: "(base)" },
    { sym: "d", exp: -1, name: "deci" },
    { sym: "c", exp: -2, name: "centi" },
    { sym: "m", exp: -3, name: "milli" },
    { sym: "\u03bc", exp: -6, name: "micro" },
    { sym: "n", exp: -9, name: "nano" },
    { sym: "p", exp: -12, name: "pico" },
  ];

  const wrap = document.createElement("div");
  wrap.className = "si-ref-wrap";

  const title = document.createElement("div");
  title.className = "si-ref-title";
  title.textContent = "Prefix Reference";
  wrap.appendChild(title);

  const table = document.createElement("table");
  table.className = "si-ref-table";

  const thead = document.createElement("tr");
  for (const h of ["Prefix", "Sym", "Base 10", "Factor"]) {
    const th = document.createElement("th");
    th.textContent = h;
    thead.appendChild(th);
  }
  table.appendChild(thead);

  const superscripts = {
    "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3",
    "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077",
    "8": "\u2078", "9": "\u2079", "-": "\u207b",
  };

  function toSuperscript(n) {
    return String(n).split("").map((c) => superscripts[c] || c).join("");
  }

  function formatFactor(exp) {
    if (exp === 0) return "1";
    if (exp > 0) return "1" + ",000".repeat(exp / 3).replace(/^,/, "") || String(Math.pow(10, exp));
    // For negative, show decimal
    if (exp >= -3) return String(Math.pow(10, exp));
    return "10" + toSuperscript(exp);
  }

  for (const prefix of allPrefixes) {
    const tr = document.createElement("tr");
    const isActive = unlockedSyms.has(prefix.sym);
    if (!isActive) tr.style.opacity = "0.3";

    const tdName = document.createElement("td");
    tdName.textContent = prefix.name;

    const tdSym = document.createElement("td");
    tdSym.textContent = prefix.sym || "—";
    tdSym.style.fontWeight = "700";

    const tdBase10 = document.createElement("td");
    tdBase10.textContent = prefix.exp === 0 ? "10\u2070" : `10${toSuperscript(prefix.exp)}`;

    const tdFactor = document.createElement("td");
    // Show a readable factor
    const absExp = Math.abs(prefix.exp);
    if (prefix.exp >= 0) {
      tdFactor.textContent = Number(Math.pow(10, prefix.exp)).toLocaleString();
    } else {
      tdFactor.textContent = "1/" + Number(Math.pow(10, absExp)).toLocaleString();
    }

    tr.appendChild(tdName);
    tr.appendChild(tdSym);
    tr.appendChild(tdBase10);
    tr.appendChild(tdFactor);
    table.appendChild(tr);
  }

  wrap.appendChild(table);
  return wrap;
}

function formatSIStatsKey(key) {
  const siPrefixNames = { k: "kilo", "": "base", c: "centi", m: "milli",
    h: "hecto", da: "deca", d: "deci", M: "mega", "\u03bc": "micro",
    G: "giga", n: "nano", T: "tera", p: "pico", base: "(base)" };
  const parts = key.split(",");
  if (parts.length !== 2) return key;
  const from = siPrefixNames[parts[0]] || parts[0] || "(base)";
  const to = siPrefixNames[parts[1]] || parts[1] || "(base)";
  return `${from} → ${to}`;
}

function buildListStats(opKey, stats) {
  const entries = Object.entries(stats);
  const wrap = document.createElement("div");
  wrap.className = "stats-f10-list";

  if (entries.length === 0) {
    const msg = document.createElement("div");
    msg.className = "stats-empty";
    msg.textContent = "No problems attempted yet.";
    wrap.appendChild(msg);
    return wrap;
  }

  entries.sort((a, b) => a[0].localeCompare(b[0]));
  entries.forEach(([text, entry]) => {
    const row = document.createElement("div");
    row.className = "stats-f10-row";
    row.style.borderLeft = `4px solid ${getAccuracyColor(entry.asked, entry.correct, opKey, text)}`;
    const label = opKey === "si"
      ? formatSIStatsKey(text)
      : opKey === "shapes"
        ? makeShapeProblemFromKey(text).text
        : opKey === "f10"
          ? formatF10StatsKey(text)
          : text;
    attachStatsTooltip(row, getStatsTooltip(opKey, text, label, entry.asked, entry.correct));

    const problem = document.createElement("span");
    problem.className = "stats-f10-text";
    problem.textContent = label;

    const pct = document.createElement("span");
    pct.className = "stats-f10-pct";
    pct.textContent = getAccuracyText(entry.asked, entry.correct);

    row.appendChild(problem);
    row.appendChild(pct);
    wrap.appendChild(row);
  });

  return wrap;
}

function updateDifficultyDisplays() {
  // Preserve focus on the same diff card after rebuild
  const focused = document.activeElement;
  const focusedOp = focused?.closest?.(".diff-card")?.dataset?.op || focused?.dataset?.op;
  buildDiffCards();
  buildKpDiffStrip();
  if (focusedOp) {
    const restored = document.querySelector(`.diff-card[data-op="${focusedOp}"]`);
    if (restored) restored.focus();
  }
}

function updateControlDisplay() {
  if (speedSlider) {
    speedSlider.value = String(gameSpeed);
    speedSlider.disabled = isBossActive();
  }
  if (speedValueEl) {
    speedValueEl.textContent = `${gameSpeed}%`;
  }
  if (dropLimitSlider) {
    dropLimitSlider.value = String(dropLimit);
    dropLimitSlider.disabled = isBossActive();
  }
  if (dropLimitValueEl) {
    dropLimitValueEl.textContent = String(dropLimit);
  }
  const kpSpeedVal = document.getElementById("kpSpeedVal");
  if (kpSpeedVal) kpSpeedVal.textContent = `${gameSpeed}%`;
  const kpDropsVal = document.getElementById("kpDropsVal");
  if (kpDropsVal) kpDropsVal.textContent = String(dropLimit);
  document.querySelectorAll(".kp-sbtn").forEach((btn) => {
    btn.disabled = isBossActive();
  });
}

function togglePause() {
  isPaused = !isPaused;
  if (isPaused) exitBreatherMode();
  if (pauseBtn) {
    pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  }
  if (!isPaused) {
    lastTime = 0;
    answerInput.focus();
  }
}

function restartGame() {
  resetRunState();
}

// Answer input handler — single path for all input processing
answerInput.addEventListener("input", (event) => {
  initAudio();
  const value = answerInput.value;

  // Prevent spaces
  if (value.includes(" ")) {
    answerInput.value = value.replace(/\s/g, "");
  }

  currentInput = answerInput.value;
  processInput(currentInput);
  if (isBossStunned()) {
    answerInput.value = "";
    currentInput = "";
  }
});

// Input keydown for Enter, Backspace, and space prevention
answerInput.addEventListener("keydown", (event) => {
  if (isLockOrModifierKey(event)) {
    if (isNumLockKey(event)) refocusAnswerInputSoon();
    return;
  }

  const lockedNumpadText = getNumpadTextForLockedState(event);
  if (lockedNumpadText) {
    event.preventDefault();
    appendTypedText(lockedNumpadText);
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    clearAmbiguousTimer();
    answerInput.value = "";
    currentInput = "";
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (isPaused || isBossStunned()) return;

    if (isInFactorTargetMode()) {
      const target = getTargetedFactorDrop();
      if (target && target.factorComplete) {
        handleCorrectAnswer(target);
        return;
      }
      // Exit targeting mode so typed factorization can be checked
      factorTargetId = null; // exit silently without clearing input
    }

    const value = answerInput.value.trim();
    if (!value) return;
    // Try matching with enterPressed=true (enables SI + factor matching)
    const match = findDropMatch(value, { enterPressed: true });
    if (match) {
      handleCorrectAnswer(match);
    } else {
      handleWrongInput({ targets: getWrongSubmissionTargets() });
    }
  }
});

// Keyboard shortcuts
document.addEventListener("keydown", (event) => {
  // Skip all game input when feedback form or stats popup is open
  if (feedbackOverlay && !feedbackOverlay.classList.contains("hidden")) {
    if (event.key === "Escape") {
      feedbackOverlay.classList.add("hidden");
      event.preventDefault();
    }
    return;
  }
  if (document.getElementById("loginOverlay")) {
    if (event.key === "Escape") {
      closeLoginPopup();
      event.preventDefault();
    }
    return;
  }
  if (document.getElementById("statsOverlay")) {
    if (event.key === "Escape") {
      closeStatsPopup();
      event.preventDefault();
    }
    return;
  }
  if (document.getElementById("resultsOverlay")) {
    if (event.key === "Escape") {
      closeResultsPopup();
      event.preventDefault();
    }
    return;
  }
  if (document.getElementById("sessionLogOverlay")) {
    if (event.key === "Escape") {
      closeSessionLogPopup();
      event.preventDefault();
    }
    return;
  }
  if (document.getElementById("sessionReportOverlay")) {
    if (event.key === "Escape") {
      closeSessionReportPopup();
      event.preventDefault();
    }
    return;
  }
  if (document.getElementById("bossOfferOverlay")) {
    if (event.key === "Escape") {
      closeBossOffer();
      event.preventDefault();
    }
    return;
  }
  if (document.getElementById("welcomeOverlay")) {
    if (event.key === "Escape") {
      closeWelcomeMenu({ markSeen: true });
      event.preventDefault();
    }
    return;
  }
  if (document.getElementById("tutorialOverlay")) {
    if (event.key === "Escape") {
      closeTutorialOverlay({ markSeen: true });
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      showNextTutorialStep();
      event.preventDefault();
    } else if (event.key === "ArrowLeft") {
      showPreviousTutorialStep();
      event.preventDefault();
    }
    return;
  }

  if (isLockOrModifierKey(event)) {
    if (isNumLockKey(event)) refocusAnswerInputSoon();
    return;
  }

  initAudio();

  if ((event.code === "Space" || event.key === " ") && !event.ctrlKey && !event.metaKey && !event.altKey) {
    enterBreatherMode();
    event.preventDefault();
    return;
  }

  // Tab / Shift+Tab: cycle through factor drops in targeting mode
  if (event.key === "Tab" && !isPaused) {
    const factorDrops = getVisibleFactorDrops();
    if (factorDrops.length > 0) {
      event.preventDefault();
      if (event.shiftKey) {
        const prev = getPrevFactorDrop(factorTargetId);
        if (prev) {
          enterFactorTargeting(prev);
        } else {
          exitFactorTargeting();
        }
      } else {
        const next = getNextFactorDrop(factorTargetId);
        if (next) {
          enterFactorTargeting(next);
        } else {
          exitFactorTargeting();
        }
      }
      return;
    }
  }

  if (event.key === "Escape") {
    // Exit factor targeting mode
    if (isInFactorTargetMode()) {
      exitFactorTargeting();
      event.preventDefault();
      return;
    }
    if (document.activeElement === answerInput && currentInput) {
      answerInput.value = "";
      currentInput = "";
      event.preventDefault();
      return;
    }
    togglePause();
    event.preventDefault();
    return;
  }

  // Focus input and insert character when not paused and input not focused
  if (
    !isPaused &&
    !isBossStunned() &&
    document.activeElement !== answerInput &&
    getKeyboardText(event) &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    event.preventDefault();
    appendTypedText(getKeyboardText(event));
  }
});

// Pause button
if (pauseBtn) {
  pauseBtn.tabIndex = -1;
  pauseBtn.addEventListener("click", () => {
    initAudio();
    togglePause();
  });
}

// Restart button
if (restartBtn) {
  restartBtn.tabIndex = -1;
  restartBtn.addEventListener("click", () => {
    initAudio();
    restartGame();
  });
}

// Practice controls
if (speedSlider) {
  speedSlider.addEventListener("input", () => {
    if (isBossActive()) return;
    initAudio();
    setPracticeControls({ speed: Number(speedSlider.value) });
  });
}

if (dropLimitSlider) {
  dropLimitSlider.addEventListener("input", () => {
    if (isBossActive()) return;
    initAudio();
    setPracticeControls({ drops: Number(dropLimitSlider.value) });
  });
}

// Operation toggle chits — remove from tab order (tab is for sliders + diff cards)
document.querySelectorAll(".op-chit").forEach((btn) => {
  btn.tabIndex = -1;
  btn.addEventListener("click", () => {
    initAudio();
    const opKey = btn.dataset.op;
    if (opKey) toggleOp(opKey);
    answerInput.focus();
  });
});

// Canvas click — reveal answer on a drop
canvas.addEventListener("click", (event) => {
  if (isPaused) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Check drops in reverse order (topmost drawn last)
  for (let i = drops.length - 1; i >= 0; i--) {
    const drop = drops[i];
    if (!isDropClickable(drop)) continue;
    if (hitTestDrop(drop, x, y)) {
      if (drop.opKey === "factor") {
        // Click a factor drop to enter targeting mode on it
        enterFactorTargeting(drop);
      } else {
        revealDrop(drop);
      }
      break;
    }
  }
});

// Feedback popup
const feedbackOverlay = document.getElementById("feedbackOverlay");
const menuLink = document.getElementById("menuLink");
const loginLink = document.getElementById("loginLink");
const resultsLink = document.getElementById("resultsLink");
const sessionLogLink = document.getElementById("sessionLogLink");
const feedbackLink = document.getElementById("feedbackLink");
const fbCancel = document.getElementById("fbCancel");

if (menuLink) {
  menuLink.addEventListener("click", (e) => {
    e.preventDefault();
    buildWelcomeMenu({ firstVisit: false });
  });
}
if (loginLink) {
  loginLink.addEventListener("click", (e) => {
    e.preventDefault();
    buildLoginPopup();
  });
}
if (resultsLink) {
  resultsLink.addEventListener("click", (e) => {
    e.preventDefault();
    buildResultsPopup();
  });
}
if (sessionLogLink) {
  sessionLogLink.addEventListener("click", (e) => {
    e.preventDefault();
    buildSessionLogPopup();
  });
}
if (feedbackLink) {
  feedbackLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (feedbackOverlay) feedbackOverlay.classList.remove("hidden");
  });
}
if (fbCancel) {
  fbCancel.addEventListener("click", () => {
    if (feedbackOverlay) feedbackOverlay.classList.add("hidden");
  });
}
if (feedbackOverlay) {
  feedbackOverlay.addEventListener("click", (e) => {
    if (e.target === feedbackOverlay) feedbackOverlay.classList.add("hidden");
  });
}

// Canvas resize
window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", () => {
  heartbeatActiveSession({ persist: true });
});

// On touch devices the browser address/toolbar overlays the layout viewport and
// can push the bottom keypad off screen. Drive the app height from the actual
// visible viewport so the whole game (including the keypad) always fits.
function syncTouchViewportHeight() {
  if (!document.body.classList.contains("touch-device")) return;
  const visibleH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(visibleH)}px`);
  resizeCanvas();
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncTouchViewportHeight);
  window.visualViewport.addEventListener("scroll", syncTouchViewportHeight);
}
window.addEventListener("orientationchange", () => setTimeout(syncTouchViewportHeight, 250));

// ============================================================
// 14. Touch Keypad
// ============================================================

const isTouchDevice = "ontouchstart" in window
  || navigator.maxTouchPoints > 0
  || window.matchMedia("(pointer: coarse)").matches
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const touchKeypad = document.getElementById("touchKeypad");

const kpDisplay = document.getElementById("kpDisplay");
const kpHint = document.getElementById("kpHint");
const kpPauseBtn = document.getElementById("kpPauseBtn");
const kpRestartBtn = document.getElementById("kpRestartBtn");

function wireKpButton(el, handler) {
  if (!el) return;
  el.tabIndex = -1;
  el.addEventListener("touchstart", (e) => { e.preventDefault(); initAudio(); handler(); });
  el.addEventListener("click", (e) => { e.preventDefault(); initAudio(); handler(); });
}

function setupTouchKeypad() {
  if (!isTouchDevice || !touchKeypad) return;

  document.body.classList.add("touch-device");
  syncTouchViewportHeight();

  // Add logo + score into the controls bar
  const controlsBar = document.querySelector(".controls-bar");
  const opChits = document.querySelector(".op-chits");
  if (controlsBar && opChits) {
    const touchBrand = document.createElement("div");
    touchBrand.className = "touch-brand";
    touchBrand.innerHTML = `<div class="logo">MR</div><div class="touch-score"><span id="touchScoreLabel">Cleared</span>: <span id="touchScore">0</span></div><a href="#" class="touch-menu" id="touchMenuLink">${getText("welcome.menuLink")}</a><a href="#" class="touch-login" id="touchLoginLink">Login</a><a href="#" class="touch-results" id="touchResultsLink">R</a><a href="#" class="touch-log" id="touchSessionLogLink">Log</a><a href="${SUPPORT_URL}" class="touch-support" id="touchSupportLink" target="_blank" rel="noopener noreferrer">${getText("support.shortLabel")}</a><a href="#" class="touch-fb" id="touchFbLink">?</a>`;
    controlsBar.insertBefore(touchBrand, opChits);
    const touchMenuLink = document.getElementById("touchMenuLink");
    if (touchMenuLink) {
      touchMenuLink.addEventListener("click", (e) => {
        e.preventDefault();
        buildWelcomeMenu({ firstVisit: false });
      });
    }
    const touchLoginLink = document.getElementById("touchLoginLink");
    if (touchLoginLink) {
      touchLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        buildLoginPopup();
      });
    }
    const touchResultsLink = document.getElementById("touchResultsLink");
    if (touchResultsLink) {
      touchResultsLink.addEventListener("click", (e) => {
        e.preventDefault();
        buildResultsPopup();
      });
    }
    const touchSessionLogLink = document.getElementById("touchSessionLogLink");
    if (touchSessionLogLink) {
      touchSessionLogLink.addEventListener("click", (e) => {
        e.preventDefault();
        buildSessionLogPopup();
      });
    }
    const touchFbLink = document.getElementById("touchFbLink");
    if (touchFbLink) {
      touchFbLink.addEventListener("click", (e) => {
        e.preventDefault();
        if (feedbackOverlay) feedbackOverlay.classList.remove("hidden");
      });
    }
  }

  // Move keypad into play-col (below canvas)
  const playCol = document.querySelector(".play-col");
  if (playCol) playCol.appendChild(touchKeypad);

  touchKeypad.classList.remove("hidden");

  // Suppress native keyboard
  answerInput.setAttribute("inputmode", "none");
  answerInput.setAttribute("readonly", "readonly");
  answerInput.addEventListener("focus", () => {
    answerInput.removeAttribute("readonly");
    setTimeout(() => answerInput.setAttribute("readonly", "readonly"), 0);
  });

  // Wire keypad keys
  touchKeypad.querySelectorAll(".kp-key").forEach((btn) => {
    wireKpButton(btn, () => handleKeypadPress(btn.dataset.key));
  });

  // Pause / Restart
  wireKpButton(kpPauseBtn, () => {
    togglePause();
    if (kpPauseBtn) kpPauseBtn.textContent = isPaused ? "Resume" : "Pause";
  });
  wireKpButton(kpRestartBtn, () => {
    restartGame();
    if (kpPauseBtn) kpPauseBtn.textContent = "Pause";
  });

  wireKpButton(document.getElementById("kpSpeedDn"), () => {
    if (!isBossActive()) setPracticeControls({ speed: gameSpeed - 10 });
  });
  wireKpButton(document.getElementById("kpSpeedUp"), () => {
    if (!isBossActive()) setPracticeControls({ speed: gameSpeed + 10 });
  });
  wireKpButton(document.getElementById("kpDropsDn"), () => {
    if (!isBossActive()) setPracticeControls({ drops: dropLimit - 1 });
  });
  wireKpButton(document.getElementById("kpDropsUp"), () => {
    if (!isBossActive()) setPracticeControls({ drops: dropLimit + 1 });
  });

  updateControlDisplay();
}

// Build inline diff items in the keypad controls row
function buildKpDiffStrip() {
  const strip = document.getElementById("kpDiffStrip");
  if (!strip) return;
  strip.innerHTML = "";
  const enabled = getEnabledOps();
  const progressSummary = summarizeProfile(progressProfile);
  enabled.forEach((opKey) => {
    const config = opConfig[opKey];
    const skill = progressSummary.skills[opKey];
    const item = document.createElement("div");
    item.className = "kp-diff-item";

    const label = document.createElement("span");
    label.className = "kp-diff-label";
    label.textContent = opDisplayLabels[opKey] || opKey;

    const gridHint = document.createElement("span");
    gridHint.className = "kp-grid-hint";
    gridHint.textContent = "Grid";

    const downBtn = document.createElement("button");
    downBtn.className = "kp-diff-btn";
    downBtn.textContent = "\u2212";
    wireKpButton(downBtn, () => setDifficulty(opKey, opConfig[opKey].difficulty - 1));

    const val = document.createElement("span");
    val.className = "kp-diff-val";
    val.textContent = config.difficulty;

    const ready = document.createElement("button");
    ready.type = "button";
    ready.className = "kp-diff-ready";
    ready.dataset.op = opKey;
    ready.textContent = formatReadyText(skill);
    ready.classList.toggle("is-qualified", Boolean(skill.bossAttemptedForLevel));
    ready.classList.toggle("is-locked", !skill.bossReady);
    ready.disabled = !skill.bossReady;
    ready.title = getBossButtonTitle(skill);
    ready.setAttribute("aria-pressed", skill.bossAttemptedForLevel ? "true" : "false");
    wireKpButton(ready, () => startBossMode(opKey));

    const blitz = document.createElement("button");
    blitz.type = "button";
    blitz.className = "kp-diff-challenge kp-diff-blitz";
    blitz.dataset.op = opKey;
    blitz.textContent = formatBlitzText(skill);
    blitz.hidden = !canReplayChallenges(opKey, skill);
    wireKpButton(blitz, () => startBlitzMode(opKey));

    const wave = document.createElement("button");
    wave.type = "button";
    wave.className = "kp-diff-challenge kp-diff-wave";
    wave.dataset.op = opKey;
    wave.textContent = formatWaveText(skill);
    wave.hidden = !canReplayChallenges(opKey, skill);
    wireKpButton(wave, () => startWaveMode(opKey));

    const bossReplay = document.createElement("button");
    bossReplay.type = "button";
    bossReplay.className = "kp-diff-challenge kp-diff-boss";
    bossReplay.dataset.op = opKey;
    bossReplay.textContent = formatBossReplayText(skill);
    bossReplay.hidden = !canReplayChallenges(opKey, skill);
    wireKpButton(bossReplay, () => startBossReplayMode(opKey));

    const upBtn = document.createElement("button");
    upBtn.className = "kp-diff-btn";
    upBtn.textContent = "+";
    wireKpButton(upBtn, () => setDifficulty(opKey, opConfig[opKey].difficulty + 1));

    item.appendChild(label);
    item.appendChild(gridHint);
    item.appendChild(downBtn);
    item.appendChild(val);
    item.appendChild(upBtn);
    item.appendChild(ready);
    item.appendChild(blitz);
    item.appendChild(wave);
    item.appendChild(bossReplay);

    // Click the item (not buttons) to show stats
    item.addEventListener("click", (e) => {
      if ([downBtn, upBtn, ready, blitz, wave, bossReplay].includes(e.target)) return;
      showStatsPopup(opKey);
    });

    strip.appendChild(item);
  });
}

function updateKpDisplay() {
  if (!kpDisplay) return;
  kpDisplay.textContent = currentInput || "\u00a0";
}

function handleKeypadPress(key) {
  if (isBossStunned()) {
    answerInput.value = "";
    currentInput = "";
    updateKpDisplay();
    return;
  }

  if (key === "Backspace") {
    clearAmbiguousTimer();
    answerInput.value = "";
    currentInput = "";
    updateKpDisplay();
    return;
  }

  if (key === "Enter") {
    if (isPaused) return;
    if (isInFactorTargetMode()) {
      const target = getTargetedFactorDrop();
      if (target && target.factorComplete) {
        handleCorrectAnswer(target);
        updateKpDisplay();
        return;
      }
      factorTargetId = null;
    }
    const value = currentInput.trim();
    if (!value) return;
    const match = findDropMatch(value, { enterPressed: true });
    if (match) {
      handleCorrectAnswer(match);
    } else {
      handleWrongInput({ targets: getWrongSubmissionTargets() });
    }
    updateKpDisplay();
    return;
  }

  if (key === "Tab") {
    if (isPaused) return;
    const factorDrops = getVisibleFactorDrops();
    if (factorDrops.length > 0) {
      const next = getNextFactorDrop(factorTargetId);
      if (next) {
        enterFactorTargeting(next);
      } else {
        exitFactorTargeting();
      }
    }
    return;
  }

  // Character key (digit, *, ^, /, -, .)
  currentInput = currentInput + key;
  answerInput.value = currentInput;
  processInput(currentInput);
  updateKpDisplay();
}

// ============================================================
// 14b. Test Hooks
// ============================================================

function cloneForTest(value) {
  return JSON.parse(JSON.stringify(value));
}

function getTestState() {
  return {
    score,
    drops: drops.map((drop) => ({ ...drop, factorCollected: { ...(drop.factorCollected || {}) } })),
    opConfig: cloneForTest(opConfig),
    problemStats: cloneForTest(problemStats),
    progressProfile: cloneForTest(progressProfile),
    progressSummary: cloneForTest(summarizeProfile(progressProfile)),
    sessionLog: cloneForTest(summarizeSessionLog(progressProfile)),
    activeSessionId,
    bossMode: cloneForTest(bossMode),
    laser: cloneForTest(laser),
    playerShip: cloneForTest(playerShip),
    currentPressure: cloneForTest(getCurrentPressure()),
    gameSpeed,
    dropLimit,
    isPaused,
    isBreatherMode,
    factorTargetId,
    currentInput,
    welcomeVisible: Boolean(document.getElementById("welcomeOverlay")),
    tutorialVisible: Boolean(document.getElementById("tutorialOverlay")),
    tutorialStepIndex,
  };
}

function resetSettingsForTest() {
  const defaults = createDefaultOpConfig();
  for (const key of Object.keys(opConfig)) {
    Object.assign(opConfig[key], defaults[key]);
  }
}

function makeTestDrop(overrides = {}) {
  const opKey = overrides.opKey || "add";
  const answerText = overrides.answerText ?? String(overrides.answer ?? 0);
  const drop = {
    id: overrides.id ?? nextDropId++,
    x: overrides.x ?? canvasW / 2,
    y: overrides.y ?? 100,
    baseSpeed: overrides.baseSpeed ?? 0,
    text: overrides.text ?? "1 + 1",
    answer: overrides.answer ?? Number(answerText),
    answerText,
    opKey,
    statsKey: overrides.statsKey ?? overrides.text ?? "test",
    revealed: overrides.revealed ?? false,
    createdAtMs: overrides.createdAtMs ?? performance.now() - 1000,
  };
  if (overrides.bossKind) drop.bossKind = overrides.bossKind;

  if (opKey === "factor") {
    drop.answer = null;
    drop.answerText = null;
    drop.factorOriginal = overrides.factorOriginal ?? Number(drop.text);
    drop.factorRemaining = overrides.factorRemaining ?? drop.factorOriginal;
    drop.factorCollected = { ...(overrides.factorCollected || {}) };
    drop.factorLastPrime = overrides.factorLastPrime ?? null;
    drop.factorComplete = overrides.factorComplete ?? false;
    drop.statsKey = overrides.statsKey ?? String(drop.factorOriginal);
  }

  return drop;
}

function installTestHooks() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("test")) return;

  window.__RAIN_MATH_TEST__ = {
    reset({ clearStats = true } = {}) {
      clearAmbiguousTimer();
      resetSettingsForTest();
      if (clearStats) {
        resetProblemStats(problemStats);
        progressProfile = resetStoredProfile();
      }
      drops = [];
      splashes = [];
      laser = null;
      resetPlayerShipVisuals();
      bossMode = null;
      isBreatherMode = false;
      score = 0;
      spawnTimer = 0;
      lastTime = 0;
      gameTime = 0;
      groundFlash = 0;
      currentInput = "";
      factorTargetId = null;
      answerInput.value = "";
      isPaused = false;
      closeWelcomeMenu({ focus: false });
      closeTutorialOverlay({ focus: false });
      setPracticeControls({ speed: 30, drops: 3 }, { persist: false });
      updateOpChits();
      updateDifficultyDisplays();
      updateControlDisplay();
      updateScoreDisplay();
      updateLoginLink();
      updateBossHud();
      updateBreatherHud();
      if (pauseBtn) pauseBtn.textContent = "Pause";
      startVisitSession();
      drawDrops();
      return getTestState();
    },
    showWelcome() {
      buildWelcomeMenu({ firstVisit: true });
      return getTestState();
    },
    clearWelcomeSeen() {
      clearWelcomeSeenFlag();
      return getTestState();
    },
    startTutorial() {
      startTutorial();
      return getTestState();
    },
    enableOps(opKeys) {
      Object.keys(opConfig).forEach((key) => {
        opConfig[key].enabled = opKeys.includes(key);
      });
      updateOpChits();
      return getTestState();
    },
    setOpDifficulty(opKey, level, options = {}) {
      setDifficulty(opKey, level, options);
      return getTestState();
    },
    markReady(opKey) {
      markReadyForBoss(opKey);
      return getTestState();
    },
    masterCurrentLevel(opKey, { attempts = 3, responseMs = 900 } = {}) {
      const skill = progressProfile.skills?.[opKey];
      if (!skill) return getTestState();
      const problems = getSkillUniverseProblems(opKey, opConfig[opKey].difficulty);
      for (const problem of problems) {
        for (let i = 0; i < attempts; i += 1) {
          progressProfile = recordProgressEvent(progressProfile, {
            opKey,
            statsKey: problem.statsKey,
            text: problem.text,
            outcome: "correct",
            responseMs,
          });
        }
      }
      resetProblemStats(problemStats);
      mirrorLegacyProblemStats(progressProfile, problemStats);
      saveProfile(progressProfile);
      updateReadinessDisplays();
      return getTestState();
    },
    startBoss(opKey) {
      startBossMode(opKey, { force: true });
      return getTestState();
    },
    startBlitz(opKey) {
      startBlitzMode(opKey);
      return getTestState();
    },
    startWave(opKey) {
      startWaveMode(opKey);
      return getTestState();
    },
    startBossReplay(opKey) {
      startBossReplayMode(opKey);
      return getTestState();
    },
    advanceBossTime(ms = 0) {
      if (bossMode?.active) {
        updateBossMode(Math.max(0, Number(ms) || 0));
      }
      drawDrops();
      return getTestState();
    },
    advanceDrops(ms = 16) {
      updateDrops(Math.max(0, Number(ms) || 0));
      drawDrops();
      return getTestState();
    },
    skipToBossFight() {
      if (bossMode?.active) {
        startBossFight();
        updateBossPartPositions();
      }
      drawDrops();
      return getTestState();
    },
    forceBossVictory() {
      if (bossMode?.active) {
        const core = bossMode.parts.find((part) => part.id === "core");
        if (core) {
          core.locked = false;
          core.problems.forEach((problem) => {
            problem.locked = false;
            problem.destroyed = true;
          });
          core.destroyed = true;
        }
        completeBossVictory();
      }
      drawDrops();
      return getTestState();
    },
    triggerBossBombHit() {
      if (bossMode?.active) {
        applyBossStun();
      }
      drawDrops();
      return getTestState();
    },
    setControls({ speed, drops, pressure, pressureTier } = {}) {
      if (pressure !== undefined || pressureTier !== undefined) {
        const tier = getPressureTier(pressure ?? pressureTier);
        setPracticeControls({ speed: tier.speed, drops: tier.rate });
      } else {
        setPracticeControls({ speed, drops });
      }
      updateControlDisplay();
      return getTestState();
    },
    addDrop(overrides) {
      const drop = makeTestDrop(overrides);
      drops.push(drop);
      drawDrops();
      return cloneForTest(drop);
    },
    clearDrops() {
      drops = [];
      factorTargetId = null;
      drawDrops();
      return getTestState();
    },
    seedStats(opKey, stats) {
      problemStats[opKey] = cloneForTest(stats);
      return getTestState();
    },
    getDropVisual(id) {
      const drop = drops.find((candidate) => candidate.id === id);
      return drop ? cloneForTest(getDropAccuracyVisual(drop)) : null;
    },
    submit(value, { enter = false } = {}) {
      answerInput.value = String(value);
      currentInput = answerInput.value;
      if (enter) {
        const match = findDropMatch(currentInput, { enterPressed: true });
        if (match) {
          handleCorrectAnswer(match);
        } else {
          handleWrongInput({ targets: getWrongSubmissionTargets() });
        }
      } else {
        processInput(currentInput);
      }
      drawDrops();
      return getTestState();
    },
    getState: getTestState,
  };
}

// ============================================================
// 15. Initialization
// ============================================================

function init() {
  resizeCanvas();
  updateOpChits();
  updateDifficultyDisplays();
  updateControlDisplay();
  updateScoreDisplay();
  syncProgressSettings();
  startVisitSession();
  answerInput.tabIndex = -1;

  if (pauseBtn) {
    pauseBtn.textContent = "Pause";
  }

  setupTouchKeypad();
  updateStaticText();
  updateLoginLink();
  installTestHooks();
  window.__RAIN_MATH_READY__ = true;
  if (shouldShowWelcomeOnLoad()) {
    buildWelcomeMenu({ firstVisit: true });
  } else {
    answerInput.focus();
  }
  requestAnimationFrame(tick);
}

init();
