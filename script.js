import { state } from "./src/engine/state.js";
import {
  isBossActive,
  isPlacementActive,
  isPlacementDrop,
  isControlLocked,
  isBossStunned,
} from "./src/engine/predicates.js";
import * as RainMathCore from "./src/game-core.js";
import * as RainMathProgress from "./src/player-progress.js";
import { RainMathText } from "./src/text/english.js";
import { initAudio, playPop, playMiss, playWrongInput } from "./src/audio.js";
import {
  initSplashes,
  resetSplashes,
  createSplash,
  updateSplashes,
  drawSplashes,
} from "./src/engine/splashes.js";
import {
  initShip,
  resetPlayerShipVisuals,
  resetLaser,
  fireLaser,
  updatePlayerShip,
  updateLaser,
  drawLaser,
  drawPlayerShip,
  getLaser,
  getPlayerShip,
} from "./src/engine/laser-ship.js";
import {
  buildLoginPopup as buildLoginPopupView,
  closeLoginPopup,
} from "./src/popups/login-popup.js";

const {
  advanceFactorDrop: advanceFactorDropCore,
  checkSimplifiedAnswer,
  clamp,
  createDefaultOpConfig,
  createProblemStats,
  expDiffToConversion,
  fractionCancelStep,
  formatFractionText,
  makeShapeProblemFromKey,
  makePowProblemFromKey,
  makeF10ProblemFromKey,
  makeReduceProblemFromKey,
  formatF10StatsKey,
  formatPercent,
  formatDuration,
  formatResponseTime,
  formatMasteryDelta,
  formatSessionAccuracy,
  formatSessionLevelProgress,
  formatSessionSummary,
  getSessionReportLevels,
  formatSessionOperationStats,
  formatSessionChallengeBreakdown,
  createSessionReportViewModel,
  compactSessionReportViewModel,
  expandCompactSessionReportViewModel,
  formatSessionLogDetails,
  formatAccuracyText,
  formatReadinessPercent,
  formatReadyText,
  canOpenLevelChoices,
  shouldPromptBossAttempt,
  getMasteryGateReason,
  getReplayLockReason,
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
  getAnswerUniverse,
  falseFireCost,
  generateProblem,
  generateWeightedProblem: generateCoreWeightedProblem,
  getDifficultyRange,
  getFactorRemainingText,
  getFullFactorization,
  getSelectionWeight,
  getSIPrefixesForDifficulty,
  getSIReferenceRows,
  getRoundUniverse,
  getReduceUniverse,
  getCourseProgressPercent,
  formatSIStatsKey,
  formatStatsKeyLabel,
  computeShareChecksum,
  verifyShareChecksum,
  encodeShareString,
  decodeShareString,
  bytesToB64url,
  b64urlToBytes,
  matchesFactorDrop,
  normalizeTypedValue,
  parseNumericAnswer,
  isReducedFraction,
  reduceFraction,
  operators,
  randInt,
  recordProblemResult: recordProblemResultCore,
  resetProblemStats,
  lerp,
  weightedPick,
} = RainMathCore;

const {
  BOSS_READY_SCORE,
  PROFILE_VERSION,
  deleteStoredProfile,
  getFinishLevelPracticeProblems,
  getBlitzBest,
  getChallengeBest,
  getPressureTier,
  getProfileList,
  getSkillUniverseProblems,
  importStoredProfile,
  isPlacementPlacedOut,
  buildStatsTooltip,
  mirrorLegacyProblemStats,
  problemCurrentAccuracy,
  problemMastery: getProgressProblemMastery,
  readProfile,
  recordBlitzAttempt,
  recordBossAttempt,
  recordChallengeAttempt,
  recordLevelAdvance,
  recordPlacementCredit,
  recordProgressEvent,
  recordSessionChallenge,
  recordSessionEvent,
  recordSessionHeartbeat,
  recordSessionStart,
  resetStoredProfile,
  saveProfile,
  shouldResumeSession,
  summarizeProfile,
  summarizeSessionLog,
  syncSettings,
} = RainMathProgress;

const TEXT = RainMathText || {};

// ============================================================
// 1. Constants and State
// ============================================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
initSplashes(ctx);
initShip({
  ctx,
  getCanvasSize: () => ({ w: state.canvasW, h: state.canvasH }),
  getGameTime: () => state.gameTime,
  getShieldState: getShieldRenderState,
  fillRoundRect,
});
const scoreEl = document.getElementById("score");
const scoreLabelEl = document.querySelector(".stats .label");
const answerInput = document.getElementById("answer");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const finishBtn = document.getElementById("finishBtn");
const speedSlider = document.getElementById("speedSlider");
const speedValueEl = document.getElementById("speedValue");
const dropLimitSlider = document.getElementById("dropLimitSlider");
const dropLimitValueEl = document.getElementById("dropLimitValue");
const textSizeSelect = document.getElementById("textSizeSelect");
const textSizeValueEl = document.getElementById("textSizeValue");
const bossHudEl = document.getElementById("bossHud");
const bossHudTitleEl = document.getElementById("bossHudTitle");
const bossHudStatusEl = document.getElementById("bossHudStatus");
const bossHudMetaEl = document.getElementById("bossHudMeta");
const breatherHudEl = document.getElementById("breatherHud");

/** @type {import('./src/types.js').OpConfig} */
const opConfig = createDefaultOpConfig();

const BOSS_ANNOUNCE_MS = 1300;
const BOSS_STUN_MS = 1400;
const BOSS_VICTORY_MS = 1800;
const DEFAULT_MAX_FALL_TIME_SEC = 10;
// Endurance ramp: reach baseline in one ramp unit, then overdrive. The onset was
// a ~70s crawl from a very slow start, which felt tedious before it got
// interesting; compress it (shorter ramp, more engaging start speed/fall time)
// so it reaches real pressure quickly without a jarring cold open. Tunable.
const BLITZ_RAMP_MS = 42000;
const BLITZ_START_SPEED = 40;
const BLITZ_START_DROP_SECONDS = 3.8;
const BLITZ_BASELINE_DROP_SECONDS = 2.2;
const BLITZ_MIN_DROP_SECONDS = 0.85;
const BLITZ_START_DROPS = 2;

// Test mode (`?test=1`) starts a run already-playing so the Playwright suite (which
// never presses Start) behaves as before; real users get the ready/Start gate.
const IS_TEST_MODE = new URLSearchParams(window.location.search).has("test");
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
const CANNON_OVERLOAD_THRESHOLD = 5;
const CANNON_OVERLOAD_WINDOW_MS = 2500;
const CANNON_OVERLOAD_BASE_MS = 800;
const CANNON_OVERLOAD_STEP_MS = 500;
const CANNON_OVERLOAD_MAX_MS = 2000;
const CANNON_OVERLOAD_REPEAT_WINDOW_MS = 10000;
const MAX_VISIBLE_BOSS_NODES = 6;
const FINISH_LEVEL_FOCUS_CHANCE = 0.85;
const SESSION_RESUME_GRACE_MS = 30 * 60 * 1000;
const WELCOME_SEEN_KEY = "rainMath.welcomeSeen.v1";
const SUPPORT_URL = "https://ko-fi.com/davidedaniels";
const TEXT_SIZE_ORDER = ["normal", "large", "huge"];
const TEXT_SIZE_LABELS = {
  normal: "Normal",
  large: "Large",
  huge: "Huge",
};
const TEXT_SIZE_SCALE = {
  normal: 1,
  large: 1.24,
  huge: 1.48,
};
const PLACEMENT_DROP_SECONDS = 4.2;
// Shapes/SI/factor problems take longer to read and compute, so they fall slower
// in Test Me than plain arithmetic.
const PLACEMENT_DROP_SECONDS_BY_OP = { shapes: 6.4, si: 6.0, factor: 6.0 };
const PLACEMENT_NEXT_DROP_MS = 180;
const PLACEMENT_RETRY_COUNT = 2;
// Test Me decides when to move up with a per-level shield: each correct answer
// adds a pip, each miss removes several. Fill the shield to climb to the next
// level; empty it (or hit the attempt cap while behind) to recommend the level
// you stalled on.
const PLACEMENT_SHIELD_START = 3;
const PLACEMENT_SHIELD_MAX = 6;
const PLACEMENT_SHIELD_GAIN = 1;
const PLACEMENT_SHIELD_LOSS = 2;
const PLACEMENT_LEVEL_ATTEMPT_CAP = 10;

function placementDropSeconds(opKey) {
  return PLACEMENT_DROP_SECONDS_BY_OP[opKey] || PLACEMENT_DROP_SECONDS;
}
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

/** @type {import('./src/types.js').Drop[]} */
const AMBIGUOUS_DELAY_MS = 400;
// Tracks `${opKey}:${level}` we have already offered a boss for, so the unlock
// toast appears once per op/level rather than on every subsequent correct answer.
const bossOfferShown = new Set();
// Parallax stars for the boss backdrop (lazily seeded once the canvas is sized).
// Captures the just-completed full-boss run for the victory summary popup.
 // id of the targeted factor drop, or null
/** @type {import('./src/types.js').BossMode|null} */

const TUTORIAL_STEPS = Array.isArray(TEXT.tutorial?.steps) ? TEXT.tutorial.steps : [];

// Problem stats: tracks every problem ever seen.
// For add/sub/mul/div: keyed by "a,b" (for div: "quotient,divisor").
// For f10: keyed by problem text.
// Each entry: { asked: number, correct: number }
const problemStats = createProblemStats();
state.progressProfile = readProfile();

function createSessionId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `session-${Date.now()}-${random}`;
}

function getRecentResumableSessionId(nowMs = Date.now()) {
  const latest = Array.isArray(state.progressProfile?.sessionLog)
    ? state.progressProfile.sessionLog[0]
    : null;
  return shouldResumeSession(latest, nowMs, SESSION_RESUME_GRACE_MS) ? latest.id : null;
}

function startVisitSession({ persist = true, forceNew = false, nowMs = Date.now() } = {}) {
  state.activeSessionId = forceNew ? createSessionId() : (getRecentResumableSessionId(nowMs) || createSessionId());
  state.progressProfile = recordSessionStart(state.progressProfile, {
    id: state.activeSessionId,
    speed: state.gameSpeed,
    rate: state.dropLimit,
    textSize: state.textSize,
    userAgent: navigator.userAgent || "",
  }, nowMs);
  if (persist) saveProfile(state.progressProfile);
}

function recordActiveSessionOutcome(drop, outcome) {
  if (!state.activeSessionId || !drop?.opKey) return false;
  state.progressProfile = recordSessionEvent(state.progressProfile, state.activeSessionId, {
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
  if (!state.activeSessionId) return false;
  state.progressProfile = recordSessionChallenge(state.progressProfile, state.activeSessionId, event);
  return true;
}

function heartbeatActiveSession({ persist = false } = {}) {
  if (!state.activeSessionId) return;
  state.progressProfile = recordSessionHeartbeat(state.progressProfile, state.activeSessionId);
  if (persist) saveProfile(state.progressProfile);
}

function applyProfileSettingsToControls() {
  const settings = state.progressProfile.settings || {};
  const savedDifficulties = settings.difficulties || {};
  const summary = summarizeProfile(state.progressProfile);
  for (const opKey of Object.keys(opConfig)) {
    const savedLevel = savedDifficulties[opKey] ?? state.progressProfile.skills?.[opKey]?.currentLevel;
    // Resume at least at the level after the highest cleared boss, so a
    // temporarily lowered selector (e.g. to replay a cleared level) does not
    // strand the player below their actual progress on reload.
    const clearedNext = (summary.skills[opKey]?.unlockedLevel || 0) + 1;
    const resume = Math.max(Number.isFinite(savedLevel) ? savedLevel : 1, clearedNext);
    opConfig[opKey].difficulty = clamp(1, 10, Math.round(resume));
  }
  state.gameSpeed = clamp(0, 100, Math.round(Number.isFinite(settings.speed) ? settings.speed : 30));
  state.dropLimit = clamp(0, 10, Math.round(Number.isFinite(settings.rate) ? settings.rate : 3));
  state.textSize = normalizeTextSizeSetting(settings.textSize);
}

applyProfileSettingsToControls();
mirrorLegacyProblemStats(state.progressProfile, problemStats);


function resetRunState({ resume = true, focus = true } = {}) {
  clearAmbiguousTimer();
  state.bossMode = null;
  state.isBreatherMode = false;
  // Restart returns to the ready/Start gate for real users; tests auto-play.
  state.hasStarted = IS_TEST_MODE;
  state.isPaused = !state.hasStarted;
  state.factorTargetId = null;
  state.drops = [];
  resetSplashes();
  resetLaser();
  resetPlayerShipVisuals();
  state.score = 0;
  state.spawnTimer = 0;
  state.lastTime = 0;
  state.gameTime = 0;
  state.groundFlash = 0;
  state.currentInput = "";
  answerInput.value = "";
  resetCannonOverload({ clearCooldown: true });
  updateScoreDisplay();
  updateKpDisplay();
  updateBossHud();
  updateBreatherHud();
  updatePauseControlLabels();
  if (focus) answerInput.focus();
}

function activateProfile(nextProfile, { resetRun = true } = {}) {
  state.progressProfile = nextProfile;
  bossOfferShown.clear();
  closeBossOffer();
  applyProfileSettingsToControls();
  startVisitSession({ forceNew: true });
  resetProblemStats(problemStats);
  mirrorLegacyProblemStats(state.progressProfile, problemStats);
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
    if (sessionChanged) saveProfile(state.progressProfile);
    return;
  }
  recordProblemResult(drop, outcome === "correct");
  state.progressProfile = recordProgressEvent(state.progressProfile, {
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
  saveProfile(state.progressProfile);
  updateReadinessDisplays();
  maybeOfferBoss(drop.opKey);
}

function getUnclearedDrops() {
  return state.drops.filter((drop) => isDropVisible(drop) && !drop.revealed);
}

function updateBreatherHud() {
  if (!breatherHudEl) return;
  breatherHudEl.classList.toggle("hidden", !state.isBreatherMode);
  if (state.isBreatherMode) {
    const remaining = getUnclearedDrops().length;
    breatherHudEl.textContent = remaining > 0
      ? `Breather: clear ${remaining} to resume`
      : "Breather cleared";
  }
}

function maybeExitBreatherMode() {
  if (!state.isBreatherMode) return;
  if (getUnclearedDrops().length > 0) {
    updateBreatherHud();
    return;
  }
  state.isBreatherMode = false;
  state.spawnTimer = 0;
  state.lastTime = 0;
  updateBreatherHud();
}

function enterBreatherMode() {
  if (state.isPaused || isBossActive() || state.isBreatherMode || getUnclearedDrops().length === 0) return false;
  state.isBreatherMode = true;
  clearAmbiguousTimer();
  answerInput.focus();
  updateBreatherHud();
  return true;
}

function exitBreatherMode() {
  if (!state.isBreatherMode) return;
  state.isBreatherMode = false;
  updateBreatherHud();
}

function syncProgressSettings({ persist = true } = {}) {
  const difficulties = Object.fromEntries(
    Object.entries(opConfig).map(([opKey, config]) => [opKey, config.difficulty])
  );
  state.progressProfile = syncSettings(state.progressProfile, {
    pressureTier: getPressureTier(state.gameSpeed).key,
    speed: state.gameSpeed,
    rate: state.dropLimit,
    textSize: state.textSize,
    difficulties,
  });
  if (persist) saveProfile(state.progressProfile);
}

// ============================================================
// 2. Utility Functions
// ============================================================

function getSearchParams() {
  return new URLSearchParams(window.location.search);
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

function normalizeTextSizeSetting(value) {
  return TEXT_SIZE_ORDER.includes(value) ? value : "normal";
}

function getTextSizeLabel(value = state.textSize) {
  return TEXT_SIZE_LABELS[normalizeTextSizeSetting(value)] || TEXT_SIZE_LABELS.normal;
}

function getTextScale() {
  return TEXT_SIZE_SCALE[normalizeTextSizeSetting(state.textSize)] || 1;
}

function getScaledFontSize(baseSize, maxSize = 32) {
  return Math.round(Math.min(maxSize, baseSize * getTextScale()));
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
    if (!state.isPaused && !isBossStunned()) answerInput.focus();
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

function isCannonOverloaded() {
  return state.cannonOverloadMs > 0;
}

function getCannonOverloadText() {
  return `Cannon overloaded - wait ${(Math.max(0, state.cannonOverloadMs) / 1000).toFixed(1)}s`;
}

function clearCurrentAnswerInput() {
  clearAmbiguousTimer();
  answerInput.value = "";
  state.currentInput = "";
  clearTargetStepPreview();
  updateKpDisplay();
}

function resetCannonOverload({ clearCooldown = false, resetLevel = true } = {}) {
  state.wrongSubmissionTimes = [];
  if (clearCooldown || resetLevel) {
    state.cannonOverloadLevel = 0;
    state.cannonOverloadLastAtMs = 0;
  }
  if (clearCooldown) {
    state.cannonOverloadMs = 0;
  }
}

function triggerCannonOverload(nowMs = performance.now()) {
  const repeated = state.cannonOverloadLastAtMs > 0 && nowMs - state.cannonOverloadLastAtMs <= CANNON_OVERLOAD_REPEAT_WINDOW_MS;
  state.cannonOverloadLevel = repeated ? Math.min(state.cannonOverloadLevel + 1, 3) : 0;
  state.cannonOverloadLastAtMs = nowMs;
  state.cannonOverloadMs = Math.min(
    CANNON_OVERLOAD_MAX_MS,
    CANNON_OVERLOAD_BASE_MS + state.cannonOverloadLevel * CANNON_OVERLOAD_STEP_MS
  );
  state.wrongSubmissionTimes = [];
  clearCurrentAnswerInput();
  updateInputHint();
}

// The answer space the player is currently up against: the union of distinct
// answers for the active operation(s)/level, plus how many distinct answers are
// actually on screen. Boss/placement lock to their op+level; otherwise it's the
// enabled practice ops at their current levels.
function getActiveAnswerSpace() {
  let pairs;
  if (state.bossMode?.active) {
    pairs = [[state.bossMode.opKey, state.bossMode.level]];
  } else if (state.placementState?.active) {
    pairs = [[state.placementState.opKey, state.placementState.level]];
  } else {
    pairs = getEnabledOps().map((op) => [op, opConfig[op].difficulty]);
  }
  const universe = new Set();
  for (const [op, level] of pairs) {
    for (const ans of getAnswerUniverse(op, level)) universe.add(ans);
  }
  const visible = new Set(
    state.drops.filter((drop) => !drop.revealed).map((drop) => String(drop.answer))
  );
  return { distinctAnswerCount: universe.size, visibleDistinctAnswers: visible.size };
}

// Anti-brute-force: a false fire heats the cannon faster when the answer space is
// small/guessable (see falseFireCost in game-core). Heat accumulates in a window;
// overload at CANNON_OVERLOAD_THRESHOLD.
function registerWrongSubmission(nowMs = performance.now()) {
  const cost = falseFireCost(getActiveAnswerSpace());
  state.wrongSubmissionTimes = state.wrongSubmissionTimes
    .filter((entry) => nowMs - entry.time <= CANNON_OVERLOAD_WINDOW_MS);
  state.wrongSubmissionTimes.push({ time: nowMs, cost });
  const heat = state.wrongSubmissionTimes.reduce((sum, entry) => sum + entry.cost, 0);
  if (heat >= CANNON_OVERLOAD_THRESHOLD) {
    triggerCannonOverload(nowMs);
  }
}

function updateCannonOverload(dt = 0) {
  if (!isCannonOverloaded()) return;
  state.cannonOverloadMs = Math.max(0, state.cannonOverloadMs - Math.max(0, dt));
  updateInputHint();
  updateKpDisplay();
}

function appendTypedText(text) {
  if (!text || state.isPaused || isBossStunned()) return;
  if (isCannonOverloaded()) {
    clearCurrentAnswerInput();
    updateInputHint();
    return;
  }
  answerInput.focus();
  answerInput.value = state.currentInput + text;
  state.currentInput = answerInput.value;
  processInput(state.currentInput);
  updateKpDisplay();
}

// ============================================================
// 3. Practice Controls
// ============================================================

function getCurrentPressure() {
  const tier = getPressureTier(state.gameSpeed);
  const speedRatio = state.gameSpeed / 100;
  return {
    ...tier,
    key: tier.key,
    label: tier.label,
    speed: state.gameSpeed,
    rate: state.dropLimit,
    maxActiveDrops: state.dropLimit,
    waveMaxActive: clamp(1, 10, Math.max(1, state.dropLimit)),
    waveDelayMinMs: Math.round(lerp(900, 260, speedRatio)),
    waveDelayMaxMs: Math.round(lerp(1400, 560, speedRatio)),
    bossSpeedMultiplier: lerp(0.55, 1.35, speedRatio),
    bombIntervalMultiplier: lerp(1.35, 0.7, speedRatio),
  };
}

function getActivePressure() {
  return state.bossMode?.pressure || getCurrentPressure();
}

function setPracticeControls({ speed = state.gameSpeed, drops = state.dropLimit } = {}, { persist = true } = {}) {
  state.gameSpeed = clamp(0, 100, Math.round(Number.isFinite(speed) ? speed : state.gameSpeed));
  state.dropLimit = clamp(0, 10, Math.round(Number.isFinite(drops) ? drops : state.dropLimit));
  if (persist) syncProgressSettings();
  updateControlDisplay();
  updateReadinessDisplays();
}

function setTextSize(value, { persist = true } = {}) {
  state.textSize = normalizeTextSizeSetting(value);
  if (persist) syncProgressSettings();
  updateControlDisplay();
  drawDrops();
}

function cycleTextSize() {
  const currentIndex = TEXT_SIZE_ORDER.indexOf(normalizeTextSizeSetting(state.textSize));
  const next = TEXT_SIZE_ORDER[(currentIndex + 1) % TEXT_SIZE_ORDER.length];
  setTextSize(next);
}

// Drop fall time model:
//   Each normal drop gets a random fall time between 3s and a fixed max.
//   baseSpeed (px/sec) = canvasH / fallTime, then Speed applies as a multiplier.
function getMaxFallTime() {
  return DEFAULT_MAX_FALL_TIME_SEC;
}

function getRandomBaseSpeed() {
  return state.canvasH / randomFallTimeSec(getMaxFallTime());
}

function getSpeedMultiplier() {
  return state.gameSpeed / 100;
}

function getBossSpeedMultiplier() {
  return 1;
}

function getSpawnInterval() {
  return spawnIntervalMs(state.gameSpeed, state.dropLimit);
}

function getMaxDrops() {
  return state.dropLimit;
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
  round: "round",
  reduce: "reduce",
  shapes: "shapes",
  pow: "pow",
  si: "si",
  factor: "factor",
};

function getOpSet(opKey) {
  return OP_SETS[opKey] || opKey;
}

function toggleOp(opKey) {
  if (isControlLocked()) return;
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
  if (!isControlLocked()) {
    state.drops = state.drops.filter((drop) => opConfig[drop.opKey]?.enabled);
    if (state.factorTargetId !== null && !state.drops.some((drop) => drop.id === state.factorTargetId)) {
      state.factorTargetId = null;
    }
  }
  updateOpChits();
}

function getProgressSkill(opKey) {
  return summarizeProfile(state.progressProfile).skills[opKey];
}

function getLevelGateReason(opKey) {
  return getMasteryGateReason(getProgressSkill(opKey)) || "Beat this level to go higher.";
}

function showLevelGateFeedback(opKey, reason = getLevelGateReason(opKey)) {
  const fields = document.querySelectorAll(`.diff-level-feedback[data-op="${opKey}"], .kp-diff-feedback[data-op="${opKey}"]`);
  fields.forEach((field) => {
    field.hidden = false;
    field.textContent = reason;
    field.classList.add("is-visible");
  });
  document.querySelectorAll(`.diff-value[data-op="${opKey}"], .kp-diff-val[data-op="${opKey}"]`).forEach((value) => {
    value.classList.add("needs-ready");
  });
  window.setTimeout(updateReadinessDisplays, 1600);
}

function showMasteryGateFeedback(opKey) {
  const reason = getMasteryGateReason(getProgressSkill(opKey)) || `Reach ${BOSS_READY_SCORE}% mastery.`;
  const labels = document.querySelectorAll(`.diff-ready[data-op="${opKey}"], .kp-diff-ready[data-op="${opKey}"]`);
  labels.forEach((label) => {
    label.classList.add("needs-ready");
    label.textContent = reason;
  });
  window.setTimeout(updateReadinessDisplays, 1800);
}

function canAdvanceDifficulty(opKey, nextLevel) {
  const currentLevel = opConfig[opKey].difficulty;
  if (nextLevel <= currentLevel) return true;
  if (nextLevel > currentLevel + 1) return false;
  const skill = getProgressSkill(opKey);
  return Boolean(skill?.bossReady || skill?.bossAttemptedForLevel || skill?.levelAdvancedForLevel);
}

function markReadyForBoss(opKey) {
  if (!state.progressProfile.skills?.[opKey]) return;
  const pressure = getCurrentPressure();
  state.progressProfile = recordBossAttempt(state.progressProfile, opKey, {
    pressureTier: pressure.key,
    speedPercent: pressure.speed,
    spawnRate: pressure.rate,
  });
  saveProfile(state.progressProfile);
  updateReadinessDisplays();
}

function recordMasteryAdvance(opKey, level = opConfig[opKey]?.difficulty) {
  state.progressProfile = recordLevelAdvance(state.progressProfile, opKey, {
    level,
    result: "mastered",
  });
  saveProfile(state.progressProfile);
}

function advanceMasteredLevel(opKey) {
  if (!opConfig[opKey] || isControlLocked()) return false;
  const currentLevel = opConfig[opKey].difficulty;
  if (currentLevel >= 10) return false;
  const skill = getProgressSkill(opKey);
  if (!skill?.bossReady && !skill?.levelAdvancedForLevel && !skill?.bossAttemptedForLevel) {
    showLevelGateFeedback(opKey);
    return false;
  }
  setDifficulty(opKey, currentLevel + 1);
  return opConfig[opKey].difficulty === currentLevel + 1;
}

function setDifficulty(opKey, level, { force = false } = {}) {
  if (!opConfig[opKey]) return;
  if (isControlLocked() && !force) return;
  const nextLevel = clamp(1, 10, level);
  if (!force && !canAdvanceDifficulty(opKey, nextLevel)) {
    showLevelGateFeedback(opKey);
    return;
  }
  const currentLevel = opConfig[opKey].difficulty;
  if (!force && nextLevel > currentLevel) {
    recordMasteryAdvance(opKey, currentLevel);
  }
  opConfig[opKey].difficulty = nextLevel;
  syncProgressSettings();
  updateOpChitProgress();
  updateDifficultyDisplays();
}

// ============================================================
// 6. Problem Generation
// ============================================================

function getProfileMasteryForGeneration(opKey, statsKey) {
  const problem = state.progressProfile.skills?.[opKey]?.problems?.[statsKey];
  return problem ? getProgressProblemMastery(problem) / 100 : null;
}

function generateFinishLevelProblem(opKey) {
  const skill = state.progressProfile.skills?.[opKey];
  const candidates = getFinishLevelPracticeProblems(skill);
  if (candidates.length === 0 || Math.random() > FINISH_LEVEL_FOCUS_CHANCE) return null;
  const picked = weightedPick(
    candidates.map((problem) => ({
      value: problem,
      weight: getSelectionWeight((problem.mastery || 0) / 100),
    })),
    Math.random
  );
  return makeProblemFromUniverseEntry(opKey, picked);
}

function generateWeightedProblem(opKey) {
  const finishProblem = generateFinishLevelProblem(opKey);
  if (finishProblem) return finishProblem;
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

// State predicates live in src/engine/predicates.js (imported at the top).

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
  if (problem.opKey === "reduce") {
    copyReduceFields(problem, target);
  }
  return target;
}

function copyReduceFields(problem, target) {
  target.reduceOriginalNum = problem.reduceOriginalNum;
  target.reduceOriginalDen = problem.reduceOriginalDen;
  target.reduceNum = problem.reduceNum ?? problem.reduceOriginalNum;
  target.reduceDen = problem.reduceDen ?? problem.reduceOriginalDen;
  target.reduceCase = problem.reduceCase || null;
  target.reduceBand = problem.reduceBand || null;
  target.reducePreviewFactor = null;
  target.reduceInvalidReason = "";
  target.reduceComplete = isReducedFraction(target.reduceNum, target.reduceDen);
  target.answer = problem.answerText || problem.answer;
  target.answerText = problem.answerText || String(problem.answer);
}

function isReduceProblem(target) {
  return target?.opKey === "reduce";
}

function getReduceDisplayText(target) {
  if (!isReduceProblem(target)) return target?.text || "";
  const num = target.reduceNum ?? target.reduceOriginalNum;
  const den = target.reduceDen ?? target.reduceOriginalDen;
  const previewFactor = target.reducePreviewFactor;
  if (previewFactor) {
    const step = fractionCancelStep(num, den, previewFactor);
    if (step) return `(${previewFactor}\u00b7${step.num})/(${previewFactor}\u00b7${step.den})`;
  }
  return formatFractionText(num, den);
}

function refreshReduceTarget(target) {
  if (!isReduceProblem(target)) return;
  target.reducePreviewFactor = null;
  target.reduceInvalidReason = "";
  target.reduceComplete = isReducedFraction(target.reduceNum, target.reduceDen);
  target.text = getReduceDisplayText(target);
}

function setReducePreview(target, factor) {
  if (!isReduceProblem(target)) return false;
  const step = fractionCancelStep(target.reduceNum, target.reduceDen, factor);
  target.reducePreviewFactor = step ? factor : null;
  target.reduceInvalidReason = step ? "" : "must divide both";
  target.text = getReduceDisplayText(target);
  return Boolean(step);
}

function commitReducePreview(target) {
  if (!isReduceProblem(target) || !target.reducePreviewFactor) return false;
  const step = fractionCancelStep(target.reduceNum, target.reduceDen, target.reducePreviewFactor);
  if (!step) return false;
  target.reduceNum = step.num;
  target.reduceDen = step.den;
  refreshReduceTarget(target);
  return true;
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
  if (opKey === "pow") {
    return makePowProblemFromKey(statsKey);
  }
  if (opKey === "f10") {
    return makeF10ProblemFromKey(statsKey);
  }
  if (opKey === "reduce") {
    return makeReduceProblemFromKey(statsKey);
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
  const randomX = randInt(padding, Math.max(padding, state.canvasW - padding));
  const span = Math.max(1, total - 1);
  const evenX = total === 1
    ? state.canvasW / 2
    : padding + ((state.canvasW - padding * 2) * index) / span;
  const isWave = bossKind?.startsWith("wave");
  const fallSeconds = bossKind === "bomb"
    ? getBossBombFallSeconds()
    : isWave
      ? randInt(58, 88) / 10
      : 7.5;
  const drop = copyProblemToTarget(problem, {
    id: state.nextDropId++,
    x: isWave ? randomX : evenX,
    y: isWave ? -30 - randInt(0, 80) : -30 - index * 6,
    baseSpeed: state.canvasH / fallSeconds,
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
// problem universe, shuffled and split across the ship parts. Nodes start hidden
// and are revealed in small capped batches so the player never faces an
// ambiguous wall of answers. Operations without an enumerable universe fall
// back to generated per-part problems.
function buildBossParts(opKey, level = opConfig[opKey]?.difficulty) {
  const universe = getSkillUniverseProblems(opKey, level);
  let groups = null;
  if (universe.length > 0) {
    const selected = shuffleArray(universe);
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
      x: state.canvasW / 2,
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
      x: state.canvasW / 2,
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
  if (!state.bossMode?.parts || state.bossMode.phase !== "boss") return;
  for (const part of state.bossMode.parts) {
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
  if (!state.bossMode?.parts || state.bossMode.phase !== "boss") return;
  const activePart = state.bossMode.parts.find((part) => !part.destroyed && !part.locked);
  if (!activePart) return;

  const activeKeys = new Set();
  state.bossMode.parts.forEach((part) => part.problems.forEach((problem) => {
    if (problem.revealed && !problem.destroyed) activeKeys.add(getProblemAnswerKey(problem));
  }));
  state.drops.filter((drop) => drop.bossKind === "bomb").forEach((drop) => activeKeys.add(getProblemAnswerKey(drop)));

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
    showMasteryGateFeedback(opKey);
    return false;
  }
  const pressure = getCurrentPressure();
  exitBreatherMode();
  closeStatsPopup();
  closeLoginPopup();
  clearAmbiguousTimer();
  state.drops = [];
  resetSplashes();
  resetLaser();
  resetPlayerShipVisuals();
  state.factorTargetId = null;
  state.currentInput = "";
  answerInput.value = "";
  resetCannonOverload({ clearCooldown: true });
  state.spawnTimer = 0;
  state.lastTime = 0;
  state.gameTime = 0;
  state.groundFlash = 0;
  state.score = 0;
  const startsWithChallenge = mode === "full" || mode === "blitz" || mode === "wave";
  state.bossMode = {
    active: true,
    mode,
    opKey,
    level,
    pressure: { ...pressure },
    phase: "announce",
    announceMs: BOSS_ANNOUNCE_MS,
    nextAction: startsWithChallenge ? "challenge" : "boss",
    message: mode === "wave"
      ? "Wave 2: load ladder"
      : mode === "boss"
        ? "Worksheet run incoming"
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
    blitzFinalDurationMs: 0,
    blitzFinalDropSeconds: 0,
    blitzFinalShields: BLITZ_SHIELD_START,
    waveTwoSpeedPercent: WAVE_TWO_BASE_SPEED,
    waveMaxLoadCleared: 0,
    waveMaxLoadReached: mode === "wave" ? 1 : 0,
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
  saveProfile(state.progressProfile);
  updateBossPartLocks();
  updateScoreDisplay();
  updateKpDisplay();
  updateBossHud();
  updateControlDisplay();
  updateDifficultyDisplays();
  answerInput.focus();
  drawDrops();
  return true;
}

function getSelectedReplayLevel(opKey) {
  const skill = summarizeProfile(state.progressProfile).skills[opKey];
  return canReplayChallenges(opKey, skill) ? opConfig[opKey].difficulty : 0;
}

function startBlitzMode(opKey) {
  const level = getSelectedReplayLevel(opKey);
  if (level <= 0) return false;
  startBossMode(opKey, { mode: "blitz", level });
  return true;
}

function startWaveMode(opKey) {
  const level = getSelectedReplayLevel(opKey);
  if (level <= 0) return false;
  startBossMode(opKey, { mode: "wave", level });
  return true;
}

function startBossReplayMode(opKey) {
  const level = getSelectedReplayLevel(opKey);
  if (level <= 0) return false;
  startBossMode(opKey, { mode: "boss", level, force: true });
  return true;
}

function startChallenge(type = "blitz") {
  state.drops = [];
  state.bossMode.phase = "challenge";
  state.bossMode.challengeType = type === "wave" ? "wave" : "blitz";
  state.bossMode.message = state.bossMode.challengeType === "wave"
    ? "Wave 2: load ladder"
    : state.bossMode.mode === "blitz"
      ? "Blitz: shield endurance"
      : "Wave 1: shield endurance";
  state.bossMode.challengeElapsedMs = 0;
  state.bossMode.blitzElapsedMs = 0;
  state.bossMode.blitzScore = 0;
  state.bossMode.blitzClearedCount = 0;
  state.bossMode.blitzShield = BLITZ_SHIELD_START;
  state.bossMode.blitzShieldPulseMs = 0;
  state.bossMode.blitzShieldHitMs = 0;
  state.bossMode.blitzHits = 0;
  state.bossMode.blitzFinalScore = 0;
  state.bossMode.blitzFinalDurationMs = 0;
  state.bossMode.blitzFinalDropSeconds = 0;
  state.bossMode.challengeLoad = state.bossMode.challengeType === "wave" ? 1 : BLITZ_START_DROPS;
  state.bossMode.waveMaxLoadCleared = 0;
  state.bossMode.waveMaxLoadReached = state.bossMode.challengeType === "wave" ? 1 : state.bossMode.challengeLoad;
  state.bossMode.waveRoundSpawned = 0;
  state.bossMode.bombTimerMs = 250;
  if (state.bossMode.challengeType === "wave" && !Number.isFinite(state.bossMode.waveTwoSpeedPercent)) {
    state.bossMode.waveTwoSpeedPercent = WAVE_TWO_BASE_SPEED;
  }
  updateBossHud();
}

function startBossFight() {
  state.drops = [];
  state.bossMode.phase = "boss";
  state.bossMode.message = state.bossMode.mode === "boss"
    ? "Clear the worksheet ship"
    : "Take down the mothership";
  state.bossMode.bombTimerMs = 900;
  state.bossMode.bossStartedAtMs = performance.now();
  updateBossPartLocks();
  collapseEmptyBossParts();
  refillBossReveals();
  updateBossHud();
}

function updateBossPartLocks() {
  if (!state.bossMode?.parts) return;
  const order = ["shield", "guns", "wings", "core"];
  let locked = false;
  for (const id of order) {
    const part = state.bossMode.parts.find((candidate) => candidate.id === id);
    if (!part) continue;
    part.locked = locked;
    part.problems.forEach((problem) => {
      problem.locked = locked;
    });
    if (!part.destroyed) locked = true;
  }
}

function updateBossPartPositions() {
  if (!state.bossMode?.parts) return;
  const shipW = Math.min(560, Math.max(340, state.canvasW * 0.74));
  const shipH = Math.min(185, Math.max(138, state.canvasH * 0.32));
  const left = (state.canvasW - shipW) / 2;
  const top = 48;
  const positions = {
    shield: { x: left + shipW * 0.5, y: top + shipH * 0.2, w: 220, h: 54 },
    guns: { x: left + shipW * 0.5, y: top + shipH * 0.45, w: 250, h: 52 },
    wings: { x: left + shipW * 0.5, y: top + shipH * 0.66, w: shipW * 0.78, h: 58 },
    core: { x: left + shipW * 0.5, y: top + shipH * 0.52, w: 154, h: 62 },
  };
  state.bossMode.shipBounds = { left, top, w: shipW, h: shipH };
  for (const part of state.bossMode.parts) {
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

  const wide = ["si", "shapes", "pow"].includes(state.bossMode?.opKey);
  const nodeScale = Math.min(getTextScale(), 1.34);
  const nodeW = Math.round((wide ? 86 : 56) * nodeScale);
  const nodeH = Math.round(26 * Math.min(getTextScale(), 1.28));
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
  if (!state.bossMode?.active || state.bossMode.phase !== "boss") return [];
  updateBossPartLocks();
  updateBossPartPositions();
  return state.bossMode.parts
    .filter((part) => !part.destroyed && !part.locked)
    .flatMap((part) => part.problems.filter((problem) => !problem.destroyed && !problem.locked && problem.revealed));
}

function getBlitzProgress() {
  if (!state.bossMode?.active) return 0;
  return clamp(0, 1, (state.bossMode.challengeElapsedMs || state.bossMode.blitzElapsedMs || 0) / BLITZ_RAMP_MS);
}

function getBlitzElapsedRampUnits() {
  if (!state.bossMode?.active) return 0;
  return Math.max(0, (state.bossMode.challengeElapsedMs || state.bossMode.blitzElapsedMs || 0) / BLITZ_RAMP_MS);
}

function getBlitzRampProgress() {
  return smoothProgress(getBlitzProgress());
}

function getBlitzScore() {
  // Live solved count remains useful feedback, but saved challenge bests use
  // survival time for Blitz and max cleared load for Wave.
  return Math.min(999, state.bossMode?.blitzClearedCount || 0);
}

function getBlitzSurvivalMs() {
  return Math.max(0, Math.round(state.bossMode?.challengeElapsedMs || state.bossMode?.blitzElapsedMs || 0));
}

function getBlitzDropSeconds() {
  return blitzDropSeconds(getBlitzElapsedRampUnits(), {
    startDropSeconds: BLITZ_START_DROP_SECONDS,
    baselineDropSeconds: BLITZ_BASELINE_DROP_SECONDS,
    minDropSeconds: BLITZ_MIN_DROP_SECONDS,
  });
}

function getBlitzSpeedPercent() {
  if (state.bossMode?.challengeType === "wave") {
    return clamp(25, 65, Math.round(Number.isFinite(state.bossMode.waveTwoSpeedPercent) ? state.bossMode.waveTwoSpeedPercent : WAVE_TWO_BASE_SPEED));
  }
  return blitzSpeedPercent(getBlitzElapsedRampUnits(), { startSpeed: BLITZ_START_SPEED });
}

function getBlitzDropLimit() {
  if (state.bossMode?.challengeType === "wave") {
    return clamp(1, WAVE_TWO_MAX_LOAD, Math.max(1, state.bossMode.challengeLoad || 1));
  }
  return BLITZ_START_DROPS;
}

function getBlitzShieldRatio() {
  if (!state.bossMode?.active || !["challenge", "challengeComplete"].includes(state.bossMode.phase)) return 0;
  const max = state.bossMode.blitzShieldMax || BLITZ_SHIELD_MAX;
  const shield = Number.isFinite(state.bossMode.blitzShield) ? state.bossMode.blitzShield : BLITZ_SHIELD_START;
  return max > 0 ? clamp(0, 1, shield / max) : 0;
}

function changeBlitzShield(delta, reason = "hit") {
  if (!state.bossMode?.active || state.bossMode.phase !== "challenge") return;
  const max = state.bossMode.blitzShieldMax || BLITZ_SHIELD_MAX;
  const current = Number.isFinite(state.bossMode.blitzShield) ? state.bossMode.blitzShield : BLITZ_SHIELD_START;
  const next = clamp(0, max, current + delta);
  state.bossMode.blitzShield = next;

  if (delta > 0) {
    state.bossMode.blitzClearedCount += 1;
    state.bossMode.blitzShieldPulseMs = BLITZ_SHIELD_PULSE_MS;
    state.bossMode.message = next >= max ? "Shields at maximum" : `Shields reinforced +${delta}`;
  } else if (delta < 0) {
    state.bossMode.blitzHits += 1;
    state.bossMode.blitzShieldHitMs = BLITZ_SHIELD_HIT_MS;
    state.bossMode.message = reason === "wrong"
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
  if (!state.bossMode?.parts) return { remaining: 0, total: 0, problemsRemaining: 0, problemsTotal: 0 };
  const total = state.bossMode.parts.length;
  const remaining = state.bossMode.parts.filter((part) => !part.destroyed).length;
  const problemsTotal = state.bossMode.parts.reduce((sum, part) => sum + part.problems.length, 0);
  const problemsRemaining = state.bossMode.parts.reduce(
    (sum, part) => sum + part.problems.filter((problem) => !problem.destroyed).length,
    0
  );
  return { remaining, total, problemsRemaining, problemsTotal };
}

function getBossWorksheetElapsedMs() {
  if (!state.bossMode?.bossStartedAtMs) return 0;
  return Math.max(0, performance.now() - state.bossMode.bossStartedAtMs);
}

function createBossDebris(part) {
  if (!state.bossMode?.debris) return;
  state.bossMode.debris.push({
    id: `${part.id}-${Date.now()}-${state.bossMode.debris.length}`,
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
  if (!state.bossMode?.debris?.length) return;
  const groundY = state.canvasH - 42;
  state.bossMode.debris.forEach((piece) => {
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
  state.bossMode.debris = state.bossMode.debris.filter((piece) => piece.life > 0);
}

function getBossBombFallSeconds() {
  if (state.bossMode?.phase === "challenge") {
    if (state.bossMode.challengeType === "wave") {
      return lerp(5.4, 3.8, getBlitzSpeedPercent() / 100);
    }
    return getBlitzDropSeconds();
  }
  if (!state.bossMode?.parts) return 4.8;
  const wingsAlive = state.bossMode.parts.some((part) => part.id === "wings" && !part.destroyed);
  return wingsAlive ? 4.8 : 6.0;
}

function getBossBombIntervalMs() {
  if (state.bossMode?.phase === "challenge") {
    if (state.bossMode.challengeType === "wave") {
      return waveBombIntervalMs(getBlitzDropLimit());
    }
    return blitzBombIntervalMs(getBlitzElapsedRampUnits());
  }
  if (!state.bossMode?.parts) return 2200;
  const gunsAlive = state.bossMode.parts.some((part) => part.id === "guns" && !part.destroyed);
  const wingsAlive = state.bossMode.parts.some((part) => part.id === "wings" && !part.destroyed);
  const base = gunsAlive ? 3800 : 5200;
  return Math.max(2200, Math.round((base - (wingsAlive ? 450 : 0)) * getActivePressure().bombIntervalMultiplier));
}

function findBossProblemById(partId, problemId) {
  const part = state.bossMode?.parts?.find((candidate) => candidate.id === partId);
  if (!part) return null;
  return part.problems.find((problem) => problem.id === problemId) || null;
}

function getBossMissileSourceNode(usedAnswers = new Set()) {
  if (!state.bossMode?.parts || state.bossMode.phase !== "boss") return null;
  const activePart = state.bossMode.parts.find((part) => !part.destroyed && !part.locked);
  if (!activePart) return null;
  const candidates = activePart.problems.filter((problem) => (
    problem.revealed
    && !problem.destroyed
    && !problem.locked
    && !usedAnswers.has(getProblemAnswerKey(problem))
  ));
  if (candidates.length === 0) return null;
  return candidates[randInt(0, candidates.length - 1)];
}

function spawnBossBomb() {
  if (!state.bossMode?.active || !["boss", "challenge"].includes(state.bossMode.phase)) return false;
  const interval = getBossBombIntervalMs();
  if (!Number.isFinite(interval)) return false;
  const usedAnswers = new Set(state.drops.map((target) => getProblemAnswerKey(target)));
  const sourceNode = state.bossMode.phase === "boss" ? getBossMissileSourceNode(usedAnswers) : null;
  if (state.bossMode.phase === "boss" && !sourceNode) return false;
  const problem = sourceNode || makeBossProblem(state.bossMode.opKey, usedAnswers, getProblemAnswerKey, state.bossMode.level);
  if (!problem) return false;
  const bomb = makeBossDrop(problem, "bomb", 0, 1);
  if (sourceNode) {
    bomb.bossSourcePartId = sourceNode.partId;
    bomb.bossSourceNodeId = sourceNode.id;
  }
  bomb.x = sourceNode ? sourceNode.x : randInt(54, Math.max(54, state.canvasW - 54));
  // Challenge bombs appear just inside the top so they are readable/answerable
  // immediately; worksheet missiles drop off visible ship nodes.
  bomb.y = sourceNode ? sourceNode.y + 18 : 8;
  bomb.baseSpeed = state.canvasH / getBossBombFallSeconds();
  state.drops.push(bomb);
  return true;
}

function recordActiveChallengeAttempt(result = "survived") {
  if (!state.bossMode?.active) return;
  const type = state.bossMode.challengeType === "wave" ? "wave" : "blitz";
  const clearedCount = state.bossMode.blitzClearedCount || 0;
  const survivalMs = getBlitzSurvivalMs();
  const fastestDropSeconds = getBossBombFallSeconds();
  const maxLoadCleared = Math.max(0, Math.round(state.bossMode.waveMaxLoadCleared || 0));
  const maxLoadReached = Math.max(maxLoadCleared, Math.round(state.bossMode.waveMaxLoadReached || state.bossMode.challengeLoad || 0));
  const primaryScore = type === "wave"
    ? maxLoadCleared
    : Math.max(0, Math.round(survivalMs / 1000));
  state.bossMode.blitzFinalScore = primaryScore;
  state.bossMode.blitzFinalSpeed = getBlitzSpeedPercent();
  state.bossMode.blitzFinalDrops = getBlitzDropLimit();
  state.bossMode.blitzFinalDurationMs = survivalMs;
  state.bossMode.blitzFinalDropSeconds = fastestDropSeconds;
  state.bossMode.blitzFinalShields = Math.max(0, Math.round(state.bossMode.blitzShield || 0));
  // Remember each challenge's natural metric for the end-of-run victory summary.
  state.bossMode.fullRunScores = state.bossMode.fullRunScores || {};
  state.bossMode.fullRunScores[type] = type === "wave"
    ? { maxLoadCleared, maxLoadReached, clearedCount }
    : { durationMs: survivalMs, fastestDropSeconds, clearedCount };
  if (type === "blitz") {
    const progressPct = Math.round(getBlitzProgress() * 100);
    state.bossMode.waveTwoSpeedPercent = clamp(32, 58, Math.round(34 + progressPct * 0.24));
  }
  if (type === "blitz") {
    state.progressProfile = recordBlitzAttempt(state.progressProfile, state.bossMode.opKey, {
      level: state.bossMode.level,
      score: state.bossMode.blitzFinalScore,
      durationMs: survivalMs,
      speedPercent: state.bossMode.blitzFinalSpeed,
      spawnRate: state.bossMode.blitzFinalDrops,
      maxDropLimit: state.bossMode.blitzFinalDrops,
      fastestDropSeconds,
      clearedCount,
      cleared: false,
      result,
    });
  } else {
    state.progressProfile = recordChallengeAttempt(state.progressProfile, state.bossMode.opKey, {
      type,
      level: state.bossMode.level,
      score: state.bossMode.blitzFinalScore,
      maxLoadCleared,
      maxLoadReached,
      clearedCount,
      cleared: false,
      result,
    });
  }
  if (state.bossMode.mode !== "full") {
    recordActiveSessionChallenge({
      action: "complete",
      type,
      opKey: state.bossMode.opKey,
      level: state.bossMode.level,
      score: state.bossMode.blitzFinalScore,
      result,
      cleared: false,
    });
  }
  saveProfile(state.progressProfile);
  updateReadinessDisplays();
}

function completeChallengeFailure() {
  if (!state.bossMode?.active || state.bossMode.phase !== "challenge") return;
  const type = state.bossMode.challengeType === "wave" ? "wave" : "blitz";
  recordActiveChallengeAttempt("shields-down");
  state.bossMode.phase = "challengeComplete";
  state.bossMode.burstMs = CHALLENGE_TRANSITION_MS;
  state.bossMode.transitionMs = CHALLENGE_TRANSITION_MS;
  state.drops = [];
  if (state.bossMode.mode === "full" && type === "blitz") {
    state.bossMode.message = "Shields are down. Super weapon sweeping the sky.";
    state.bossMode.transitionAction = "wave";
  } else if (state.bossMode.mode === "full" && type === "wave") {
    state.bossMode.message = "Backup shields are down. Super weapon clears the path.";
    state.bossMode.transitionAction = "boss";
  } else {
    state.bossMode.message = type === "wave"
      ? `Backup shields are down. Best load: ${state.bossMode.blitzFinalScore} at once`
      : `Shields are down. Blitz lasted ${formatDuration(state.bossMode.blitzFinalDurationMs)}`;
    state.bossMode.transitionAction = "end";
  }
  updateBossHud();
}

function applyBossStun() {
  if (!state.bossMode?.active) return;
  if (state.bossMode.phase === "challenge") {
    changeBlitzShield(-BLITZ_MISTAKE_SHIELD_LOSS, "bomb");
    return;
  }
  state.bossMode.stunMs = BOSS_STUN_MS;
  state.bossMode.message = "Bomb hit: stunned";
  answerInput.value = "";
  state.currentInput = "";
  updateKpDisplay();
  updateBossHud();
}

// Wave 2 is a load ladder gated on clearing each round: spawn N bombs (staggered
// so they are readable), wait until the whole batch is cleared, then step to N+1.
function updateWaveTwoRound(activeBombs) {
  const load = state.bossMode.challengeLoad;
  state.bossMode.waveMaxLoadReached = Math.max(state.bossMode.waveMaxLoadReached || 0, load);
  if (state.bossMode.waveRoundSpawned < load) {
    if (state.bossMode.bombTimerMs <= 0) {
      spawnBossBomb();
      state.bossMode.waveRoundSpawned += 1;
      state.bossMode.bombTimerMs = WAVE_TWO_SPAWN_STAGGER_MS;
    }
  } else if (activeBombs === 0 && state.bossMode.bombTimerMs <= 0) {
    state.bossMode.waveMaxLoadCleared = Math.max(state.bossMode.waveMaxLoadCleared || 0, load);
    state.bossMode.challengeLoad = Math.min(WAVE_TWO_MAX_LOAD, load + 1);
    state.bossMode.waveMaxLoadReached = Math.max(state.bossMode.waveMaxLoadReached || 0, state.bossMode.challengeLoad);
    state.bossMode.waveRoundSpawned = 0;
    state.bossMode.bombTimerMs = WAVE_TWO_ROUND_GAP_MS;
    state.bossMode.message = `Wave 2: ${state.bossMode.challengeLoad} at once`;
  }
}

function updateBossMode(dt) {
  if (!state.bossMode?.active) return;
  state.bossMode.hudFreshMs = Math.max(0, (state.bossMode.hudFreshMs || 0) - dt);
  updateBossDebris(dt);
  if (state.bossMode.phase === "challenge" || state.bossMode.phase === "challengeComplete") {
    state.bossMode.blitzShieldPulseMs = Math.max(0, (state.bossMode.blitzShieldPulseMs || 0) - dt);
    state.bossMode.blitzShieldHitMs = Math.max(0, (state.bossMode.blitzShieldHitMs || 0) - dt);
    state.bossMode.burstMs = Math.max(0, (state.bossMode.burstMs || 0) - dt);
  }

  if (state.bossMode.stunMs > 0) {
    state.bossMode.stunMs = Math.max(0, state.bossMode.stunMs - dt);
    if (state.bossMode.stunMs === 0 && state.bossMode.phase === "boss") {
      state.bossMode.message = "Destroy the ship parts";
      state.bossMode.bombTimerMs = Math.max(state.bossMode.bombTimerMs, 900);
    }
    updateBossHud();
    return;
  }

  if (state.bossMode.phase === "announce") {
    state.bossMode.announceMs -= dt;
    if (state.bossMode.announceMs <= 0) {
      if (state.bossMode.nextAction === "challenge") {
        startChallenge(state.bossMode.challengeType);
      } else {
        startBossFight();
      }
    }
    return;
  }

  if (state.bossMode.phase === "challenge") {
    state.bossMode.challengeElapsedMs += dt;
    state.bossMode.blitzElapsedMs = state.bossMode.challengeElapsedMs;
    state.bossMode.blitzScore = getBlitzScore();
    state.bossMode.bombTimerMs -= dt;
    const activeBombs = state.drops.filter((drop) => drop.bossKind === "bomb").length;
    if (state.bossMode.challengeType === "wave") {
      updateWaveTwoRound(activeBombs);
    } else if (state.bossMode.bombTimerMs <= 0 && activeBombs < getBlitzDropLimit()) {
      spawnBossBomb();
      state.bossMode.bombTimerMs = getBossBombIntervalMs();
    }
    updateBossHud();
    return;
  }

  if (state.bossMode.phase === "challengeComplete") {
    state.bossMode.transitionMs -= dt;
    if (state.bossMode.transitionMs <= 0) {
      if (state.bossMode.transitionAction === "wave") {
        startChallenge("wave");
      } else if (state.bossMode.transitionAction === "boss") {
        startBossFight();
      } else {
        state.bossMode = null;
        updateBossHud();
        updateControlDisplay();
        updateDifficultyDisplays();
      }
    } else {
      updateBossHud();
    }
    return;
  }

  if (state.bossMode.phase === "boss") {
    updateBossPartLocks();
    collapseEmptyBossParts();
    if (state.bossMode?.phase !== "boss") return;
    refillBossReveals();
    state.bossMode.bombTimerMs -= dt;
    if (state.bossMode.bombTimerMs <= 0) {
      spawnBossBomb();
      state.bossMode.bombTimerMs = getBossBombIntervalMs();
    }
    return;
  }

  if (state.bossMode.phase === "victory") {
    state.bossMode.victoryMs -= dt;
    if (state.bossMode.victoryMs <= 0) {
      // Celebrate a full boss clear with a victory summary of the run.
      const showVictory = state.bossMode.mode === "full";
      state.bossMode = null;
      updateBossHud();
      updateControlDisplay();
      updateDifficultyDisplays();
      if (showVictory) showBossVictoryPopup(state.lastBossVictory);
    }
  }
}

function handleBossProblemDestroyed(problem) {
  problem.destroyed = true;
  const part = state.bossMode.parts.find((candidate) => candidate.id === problem.partId);
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
  if (state.bossMode?.phase !== "boss") return;
  refillBossReveals();
  const { remaining, problemsRemaining } = getBossPartCount();
  if (partCleared) {
    state.bossMode.message = remaining === 1 ? "Core exposed" : `${part.name} destroyed`;
  } else {
    state.bossMode.message = `${problemsRemaining} ship problems left`;
  }
  updateBossHud();
}

function completeBossVictory() {
  if (!state.bossMode?.active) return;
  const { opKey, level, pressure, mode } = state.bossMode;
  state.drops = [];
  const durationMs = state.bossMode.bossStartedAtMs
    ? Math.max(0, performance.now() - state.bossMode.bossStartedAtMs)
    : null;
  state.bossMode.bossFinalDurationMs = durationMs;
  state.progressProfile = recordChallengeAttempt(state.progressProfile, opKey, {
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
    state.progressProfile = recordBossAttempt(state.progressProfile, opKey, {
      pressureTier: pressure.key,
      speedPercent: pressure.speed,
      spawnRate: pressure.rate,
    });
    saveProfile(state.progressProfile);
    if (level < 10) {
      setDifficulty(opKey, level + 1, { force: true });
    } else {
      syncProgressSettings();
    }
  } else {
    saveProfile(state.progressProfile);
  }
  if (mode === "full") {
    state.lastBossVictory = {
      opKey,
      level,
      advanced: level < 10,
      wave1: state.bossMode.fullRunScores?.blitz ?? null,
      wave2: state.bossMode.fullRunScores?.wave ?? null,
      bossTimeMs: durationMs,
    };
  }
  state.bossMode.phase = "victory";
  state.bossMode.message = mode === "full"
    ? level < 10 ? `Boss cleared: Level ${level + 1} unlocked` : "Boss cleared"
    : `Worksheet time: ${formatDuration(durationMs)}`;
  state.bossMode.victoryMs = BOSS_VICTORY_MS;
  updateBossHud();
  updateReadinessDisplays();
  updateControlDisplay();
}
function updateBossHud() {
  updateScoreDisplay();
  if (!bossHudEl) return;
  if (!state.bossMode?.active) {
    bossHudEl.classList.add("hidden");
    bossHudEl.classList.remove("is-quiet", "is-stunned");
    return;
  }
  if (state.bossMode.lastHudMessage !== state.bossMode.message) {
    state.bossMode.lastHudMessage = state.bossMode.message;
    state.bossMode.hudFreshMs = BOSS_HUD_FRESH_MS;
  }
  bossHudEl.classList.remove("hidden");
  bossHudEl.classList.toggle("is-stunned", isBossStunned());
  bossHudEl.classList.toggle("is-quiet", !isBossStunned() && (state.bossMode.hudFreshMs || 0) <= 0);
  const opName = opDisplayNames[state.bossMode.opKey] || state.bossMode.opKey;
  const titleMode = state.bossMode.mode === "wave"
    ? "Wave 2"
    : state.bossMode.mode === "blitz"
      ? "Blitz"
      : state.bossMode.mode === "boss"
        ? "Worksheet"
        : "Boss";
  bossHudTitleEl.textContent = `${opName} ${titleMode} · Level ${state.bossMode.level}`;
  bossHudStatusEl.textContent = state.bossMode.message;
  if (isBossStunned()) {
    bossHudMetaEl.textContent = `Stunned ${(state.bossMode.stunMs / 1000).toFixed(1)}s`;
    return;
  }
  if (state.bossMode.phase === "challenge") {
    const shield = Math.round(state.bossMode.blitzShield || 0);
    const shieldMax = state.bossMode.blitzShieldMax || BLITZ_SHIELD_MAX;
    if (state.bossMode.challengeType === "wave") {
      bossHudMetaEl.textContent = `Shields ${shield}/${shieldMax} · Solved ${getBlitzScore()} · best ${state.bossMode.waveMaxLoadCleared || 0} at once · trying ${getBlitzDropLimit()} · fixed ${getBlitzSpeedPercent()}% speed`;
    } else {
      bossHudMetaEl.textContent = `Shields ${shield}/${shieldMax} · ${formatDuration(getBlitzSurvivalMs())} · ${formatDropSeconds(getBlitzDropSeconds())} · Solved ${getBlitzScore()}`;
    }
    return;
  }
  if (state.bossMode.phase === "challengeComplete") {
    bossHudMetaEl.textContent = state.bossMode.transitionAction === "end"
      ? "Challenge recorded"
      : "Clearing the board";
    return;
  }
  if (state.bossMode.phase === "boss" || state.bossMode.phase === "victory") {
    const { remaining, total, problemsRemaining, problemsTotal } = getBossPartCount();
    const bombs = state.drops.filter((drop) => drop.bossKind === "bomb").length;
    const cleared = Math.max(0, problemsTotal - problemsRemaining);
    const time = state.bossMode.phase === "boss" ? formatDuration(getBossWorksheetElapsedMs()) : formatDuration(state.bossMode.bossFinalDurationMs);
    bossHudMetaEl.textContent = `${cleared}/${problemsTotal} cleared · ${time} · ${Math.max(0, remaining)}/${total} parts · ${bombs} missiles`;
    return;
  }
  bossHudMetaEl.textContent = "Get ready";
}

// ============================================================
// 7. Drop Management
// ============================================================

function getActiveAnswers() {
  return state.drops.map((drop) => drop.answer);
}

function createDrop() {
  const opKey = pickRandomEnabledOp();
  if (!opKey) return false;

  let problem = null;
  let attempts = 0;
  const activeAnswers = getActiveAnswers();
  const activeFactorNums = state.drops.filter((d) => d.opKey === "factor").map((d) => d.factorOriginal);
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
  const right = Math.max(padding + 20, state.canvasW - padding);
  const x = randInt(left, right);

  const baseSpeed = getRandomBaseSpeed();

  const drop = {
    id: state.nextDropId++,
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
  if (problem.opKey === "reduce") {
    copyReduceFields(problem, drop);
  }
  state.drops.push(drop);
  return true;
}

function updateDrops(dt) {
  if (!isBossActive() && !isPlacementActive() && state.gameSpeed === 0) return;

  const mult = isBossActive() ? getBossSpeedMultiplier()
    : isPlacementActive() ? 1
      : getSpeedMultiplier();
  for (const drop of state.drops) {
    drop.y += (drop.baseSpeed * mult * dt) / 1000;
  }

  const bottom = state.canvasH - 30;
  const survived = [];
  let missCount = 0;
  let endedBlitz = false;

  for (const drop of state.drops) {
    if (drop.y >= bottom) {
      if (!drop.revealed) {
        recordLearningResult(drop, "missed");
        if (isPlacementDrop(drop)) {
          handlePlacementDropFinished(drop, false, "missed");
        }
        missCount += 1;
        if (drop.bossKind === "bomb") {
          applyBossStun();
          if (state.bossMode?.phase === "challengeComplete") {
            endedBlitz = true;
            break;
          }
        }
      }
      if (state.factorTargetId === drop.id) state.factorTargetId = null;
    } else {
      survived.push(drop);
    }
  }

  if (missCount > 0) {
    state.groundFlash = 300;
    playMiss();
  }

  if (endedBlitz) {
    state.drops = [];
    updateBossHud();
    return;
  }

  state.drops = survived;
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
  const placedOut = isProblemPlacedOut(drop.opKey, statsKey);
  const accuracy = getVisualAccuracy(drop.opKey, statsKey, asked, correct);
  const rgb = getAccuracyRGB(accuracy, asked > 0 || placedOut);

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

  const evidence = placedOut && asked === 0 ? 0.75 : getEvidenceRatio(asked);
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
    label: getAccuracyText(asked, correct, drop.opKey, statsKey),
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
  if (state.groundFlash > 0) {
    const alpha = Math.min(1, state.groundFlash / 300) * 0.35;
    ctx.fillStyle = `rgba(248, 113, 113, ${alpha.toFixed(2)})`;
    ctx.fillRect(0, state.canvasH - 36, state.canvasW, 36);
  }

  drawSplashes();
  drawLoomingBoss();
  drawBossShip();
  drawChallengeBurst();

  const inputNum = state.currentInput !== "" ? Number(state.currentInput) : NaN;
  const hasNumMatch = !Number.isNaN(inputNum);
  const dropTextScale = Math.min(getTextScale(), 1.28);

  for (const drop of state.drops) {
    ctx.save();
    const dropTop = drop.y - 26 * dropTextScale;
    const dropBottom = drop.y + 22 * dropTextScale;
    const dropRadius = 22 * dropTextScale;
    const isFactor = drop.opKey === "factor";
    const isReduce = drop.opKey === "reduce";
    const factorComplete = isFactor && drop.factorComplete;
    const reduceComplete = isReduce && drop.reduceComplete;
    const isTargeted = (isFactor || isReduce) && state.factorTargetId === drop.id;
    const isHighlighted = !drop.revealed && !isFactor && !isReduce && (drop.opKey === "si"
      ? state.currentInput === drop.answerText
      : hasNumMatch && drop.answer === inputNum);

    let fillColor, strokeColor, masteryShadowColor;
    if (drop.revealed) {
      fillColor = "rgba(148, 163, 184, 0.35)";
      strokeColor = "rgba(148, 163, 184, 0.25)";
    } else if ((isFactor && factorComplete) || (isReduce && reduceComplete && isTargeted)) {
      fillColor = "rgba(52, 211, 153, 0.88)";
      strokeColor = "rgba(110, 231, 183, 0.9)";
    } else {
      const visual = getDropAccuracyVisual(drop);
      fillColor = visual.fillColor;
      strokeColor = visual.strokeColor;
      masteryShadowColor = visual.shadowColor;
    }

    if (isHighlighted || isTargeted) {
      ctx.shadowColor = (isFactor || isReduce)
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
    } else if (!drop.revealed && isReduce) {
      displayText = getReduceDisplayText(drop);
    } else if (drop.revealed) {
      displayText = drop.answerText;
    } else {
      displayText = drop.text;
    }
    const fontSize = getScaledFontSize((drop.revealed || isFactor || isReduce) ? 14 : 17, 28);
    const textX = Math.round(drop.x);
    const textY = Math.round(drop.y + 2);
    ctx.font = `800 ${fontSize}px Space Grotesk, Trebuchet MS, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.24));
    ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";

    // Factor drops in progress: draw main text + remaining in accent color
    const remainingText = isFactor && !drop.revealed ? getFactorRemainingText(drop) : null;
    const reduceCueText = isReduce && !drop.revealed && isTargeted
      ? (drop.reduceInvalidReason || (drop.reduceComplete ? "lowest terms \u2713" : (drop.reducePreviewFactor ? "Enter cancels" : "type factor")))
      : null;
    if (remainingText) {
      // Measure widths to position the two parts
      const mainWidth = ctx.measureText(displayText).width;
      const remWidth = ctx.measureText(remainingText).width;
      const totalWidth = mainWidth + remWidth;
      const startX = Math.round(drop.x - totalWidth / 2);

      // Main part (white)
      ctx.textAlign = "left";
      ctx.fillStyle = "#f8fafc";
      ctx.strokeText(displayText, startX, textY);
      ctx.fillText(displayText, startX, textY);

      // Remaining part (bright accent — the thing to factor)
      ctx.fillStyle = "#fbbf24";
      ctx.strokeText(remainingText, Math.round(startX + mainWidth), textY);
      ctx.fillText(remainingText, Math.round(startX + mainWidth), textY);
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = drop.revealed ? "#94a3b8" : "#f8fafc";
      ctx.strokeText(displayText, textX, textY);
      ctx.fillText(displayText, textX, textY);
      if (reduceCueText) {
        const cueSize = Math.max(10, Math.round(fontSize * 0.58));
        ctx.font = `700 ${cueSize}px Space Grotesk, Trebuchet MS, sans-serif`;
        ctx.lineWidth = Math.max(2.5, Math.round(cueSize * 0.22));
        ctx.fillStyle = drop.reduceInvalidReason ? "#fca5a5" : "#fbbf24";
        ctx.strokeText(reduceCueText, textX, Math.round(textY + fontSize * 0.9));
        ctx.fillText(reduceCueText, textX, Math.round(textY + fontSize * 0.9));
      }
    }
    ctx.restore();
  }

  drawLaser();
  drawPlayerShip();
  drawChallengeStatus();
  drawBossStunOverlay();
}

// Compact shield + status readout near the player base, shown during the boss
// Wave 1/Wave 2 challenge and during Test Me (same shield mechanic).
function drawChallengeStatus() {
  let lines;
  let low;
  if (state.bossMode?.active && state.bossMode.phase === "challenge") {
    const shield = Math.max(0, Math.round(state.bossMode.blitzShield || 0));
    const shieldMax = state.bossMode.blitzShieldMax || BLITZ_SHIELD_MAX;
    const isWave = state.bossMode.challengeType === "wave";
    lines = [
      `🛡 ${shield}/${shieldMax}`,
      isWave
        ? `Best ${state.bossMode.waveMaxLoadCleared || 0} · Try ${state.bossMode.challengeLoad}`
        : `Blitz ${formatDuration(getBlitzSurvivalMs())}`,
    ];
    low = getBlitzShieldRatio() <= 0.28;
  } else if (isPlacementActive()) {
    const shield = Math.max(0, Math.round(state.placementState.shield ?? PLACEMENT_SHIELD_START));
    lines = [
      `🛡 ${shield}/${PLACEMENT_SHIELD_MAX}`,
      `Test Me · Level ${state.placementState.level}`,
    ];
    low = shield / PLACEMENT_SHIELD_MAX <= 0.34;
  } else {
    return;
  }

  ctx.save();
  ctx.font = "700 13px Space Grotesk";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const padX = 12;
  const lineH = 17;
  const boxW = widest + padX * 2;
  const boxH = lineH * lines.length + 10;
  const cx = state.canvasW / 2;
  const boxTop = state.canvasH - 20 - 44 - boxH;

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
  if (state.starfield.length) return;
  for (let i = 0; i < 70; i += 1) {
    state.starfield.push({
      x: Math.random() * state.canvasW,
      y: Math.random() * state.canvasH,
      r: 0.5 + Math.random() * 1.6,
      speed: 20 + Math.random() * 90,
    });
  }
}

function updateStarfield(dt) {
  if (!isBossActive() || !state.starfield.length) return;
  const sec = dt / 1000;
  for (const star of state.starfield) {
    star.y += star.speed * sec;
    if (star.y > state.canvasH) {
      star.y = 0;
      star.x = Math.random() * state.canvasW;
    }
  }
}

function drawStarfield() {
  if (!isBossActive()) return;
  ensureStarfield();
  ctx.save();
  ctx.fillStyle = "#cbd5e1";
  for (const star of state.starfield) {
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
  if (!state.bossMode?.active || state.bossMode.mode !== "full") return;
  if (!["announce", "challenge", "challengeComplete"].includes(state.bossMode.phase)) return;

  // Wave 1 barely shows the underside; Wave 2 comes noticeably closer.
  const reveal = state.bossMode.challengeType === "wave" ? 0.34 : 0.14;
  const w = Math.min(560, Math.max(340, state.canvasW * 0.74));
  const h = Math.min(185, Math.max(138, state.canvasH * 0.32));
  const left = (state.canvasW - w) / 2;
  const top = -h * (1 - reveal) + Math.sin(state.gameTime / 700) * 6;

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
  if (!state.bossMode?.active || !["boss", "victory"].includes(state.bossMode.phase)) return;
  updateBossPartPositions();
  const { left, top, w, h } = state.bossMode.shipBounds;
  const cx = left + w * 0.5;
  const pulse = 0.5 + Math.sin(state.gameTime / 420) * 0.5;

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

  for (const part of state.bossMode.parts) {
    drawBossPart(part);
  }
  // Second pass: draw problem nodes on top so no later part's body can cover them.
  for (const part of state.bossMode.parts) {
    if (part.destroyed || part.locked) continue;
    part.problems.filter((problem) => !problem.destroyed && problem.revealed).forEach(drawBossProblemNode);
  }
  drawBossDebris();
  ctx.restore();
}

function drawChallengeBurst() {
  if (!state.bossMode?.active || !state.bossMode.burstMs) return;
  const rawProgress = clamp(0, 1, 1 - state.bossMode.burstMs / CHALLENGE_TRANSITION_MS);
  const progress = smoothProgress(rawProgress);
  const fadeIn = clamp(0, 1, rawProgress / 0.12);
  const fadeOut = clamp(0, 1, (1 - rawProgress) / 0.2);
  const alpha = Math.min(fadeIn, fadeOut);
  const beamY = lerp(state.canvasH + 90, -70, progress);
  const beamHeight = clamp(42, 78, state.canvasH * 0.09);
  const beamCore = clamp(10, 18, state.canvasH * 0.02);
  const glowTop = beamY - beamHeight * 2.4;
  const glowBottom = beamY + beamHeight * 1.8;
  const shimmer = Math.sin(state.gameTime / 58) * 0.5 + 0.5;

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
  ctx.fillRect(0, glowTop, state.canvasW, glowBottom - glowTop);

  const beam = ctx.createLinearGradient(0, beamY - beamHeight / 2, 0, beamY + beamHeight / 2);
  beam.addColorStop(0, "rgba(56, 189, 248, 0)");
  beam.addColorStop(0.32, "rgba(125, 211, 252, 0.42)");
  beam.addColorStop(0.47, "rgba(255, 255, 255, 0.95)");
  beam.addColorStop(0.54, "rgba(255, 255, 255, 0.98)");
  beam.addColorStop(0.7, "rgba(253, 224, 71, 0.42)");
  beam.addColorStop(1, "rgba(253, 224, 71, 0)");
  ctx.fillStyle = beam;
  ctx.fillRect(0, beamY - beamHeight / 2, state.canvasW, beamHeight);

  ctx.shadowColor = "rgba(125, 211, 252, 0.92)";
  ctx.shadowBlur = 28 + shimmer * 18;
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fillRect(0, beamY - beamCore / 2, state.canvasW, beamCore);

  ctx.shadowColor = "rgba(251, 191, 36, 0.72)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(251, 191, 36, 0.76)";
  ctx.fillRect(0, beamY + beamCore * 0.78, state.canvasW, 3);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha * 0.44;
  ctx.strokeStyle = "rgba(186, 230, 253, 0.72)";
  ctx.lineWidth = 1;
  for (let x = 18; x < state.canvasW; x += 48) {
    const offset = Math.sin((state.gameTime + x * 7) / 140) * 8;
    ctx.beginPath();
    ctx.moveTo(x + offset, Math.max(0, beamY - beamHeight * 2.2));
    ctx.lineTo(x - offset * 0.35, Math.min(state.canvasH, beamY - beamHeight * 0.22));
    ctx.stroke();
  }

  ctx.globalAlpha = alpha * 0.9;
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 83 + state.gameTime * 0.08) % (state.canvasW + 80)) - 40;
    const y = beamY + Math.sin((state.gameTime + i * 37) / 90) * beamHeight * 0.42;
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
  ctx.fillRect(0, 0, state.canvasW, state.canvasH);
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
  if (!state.bossMode?.debris?.length) return;
  state.bossMode.debris.forEach(drawBossDebrisPiece);
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
  const isTargeted = state.factorTargetId === problem.id;
  const fill = problem.partKind === "core"
    ? "rgba(248, 113, 113, 0.92)"
    : "rgba(15, 23, 42, 0.9)";
  const stroke = isTargeted
    ? "rgba(251, 191, 36, 0.95)"
    : problem.partKind === "shield"
      ? "rgba(186, 230, 253, 0.86)"
      : "rgba(255, 255, 255, 0.42)";
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = isTargeted ? 3 : 1.8;

  ctx.beginPath();
  ctx.moveTo(problem.x, y - 1);
  ctx.bezierCurveTo(x, y + problem.h * 0.28, x + problem.w * 0.08, y + problem.h * 0.78, problem.x, y + problem.h + 1);
  ctx.bezierCurveTo(x + problem.w * 0.92, y + problem.h * 0.78, x + problem.w, y + problem.h * 0.28, problem.x, y - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha = 0.32;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.ellipse(problem.x - problem.w * 0.18, problem.y - problem.h * 0.16, problem.w * 0.1, problem.h * 0.16, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // While factoring a targeted node, show what is left to factor.
  let label = problem.text;
  if (problem.opKey === "factor" && Number.isFinite(problem.factorRemaining)
    && problem.factorRemaining !== problem.factorOriginal) {
    label = String(problem.factorRemaining);
  } else if (problem.opKey === "reduce") {
    label = getReduceDisplayText(problem);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const nodeFontSize = getScaledFontSize(11, 18);
  const nodeTextX = Math.round(problem.x);
  const nodeTextY = Math.round(problem.y + 1);
  ctx.font = `800 ${nodeFontSize}px Space Grotesk, Trebuchet MS, sans-serif`;
  ctx.lineWidth = Math.max(3.5, nodeFontSize * 0.24);
  ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";
  ctx.fillStyle = "#f8fafc";
  ctx.strokeText(label, nodeTextX, nodeTextY);
  ctx.fillText(label, nodeTextX, nodeTextY);
}

function drawBossStunOverlay() {
  if (!isBossStunned()) return;
  ctx.save();
  ctx.fillStyle = "rgba(248, 113, 113, 0.16)";
  ctx.fillRect(0, 0, state.canvasW, state.canvasH);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 24px Space Grotesk";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.9)";
  ctx.fillStyle = "#f8fafc";
  const text = `Stunned ${(state.bossMode.stunMs / 1000).toFixed(1)}s`;
  ctx.strokeText(text, state.canvasW / 2, state.canvasH / 2);
  ctx.fillText(text, state.canvasW / 2, state.canvasH / 2);
  ctx.restore();
}

// ============================================================
// 8. Splash Effects
// ============================================================

// Splash particle effects live in src/engine/splashes.js (imported at the top).

// ============================================================
// 8b. Laser and Player Ship
// ============================================================

// Unified shield state for the player-base shield visual, shared by the boss
// Wave 1/2 challenge and Test Me (which uses the same shield mechanic).
function getShieldRenderState() {
  if (state.bossMode?.active && ["challenge", "challengeComplete"].includes(state.bossMode.phase)) {
    return {
      ratio: state.bossMode.phase === "challengeComplete" ? 0 : getBlitzShieldRatio(),
      pulse: clamp(0, 1, (state.bossMode.blitzShieldPulseMs || 0) / BLITZ_SHIELD_PULSE_MS),
      hit: clamp(0, 1, (state.bossMode.blitzShieldHitMs || 0) / BLITZ_SHIELD_HIT_MS),
      forceLow: state.bossMode.phase === "challengeComplete",
    };
  }
  if (isPlacementActive()) {
    return {
      ratio: clamp(0, 1, (state.placementState.shield ?? PLACEMENT_SHIELD_START) / PLACEMENT_SHIELD_MAX),
      pulse: clamp(0, 1, (state.placementState.shieldPulseMs || 0) / BLITZ_SHIELD_PULSE_MS),
      hit: clamp(0, 1, (state.placementState.shieldHitMs || 0) / BLITZ_SHIELD_HIT_MS),
      forceLow: false,
    };
  }
  return null;
}

// ============================================================
// 9. Input Handling
// ============================================================

function isDropVisible(drop) {
  return drop.y > 0;
}

function isAnswerTargetVisible(target) {
  if (target.targetType === "bossProblem") {
    return isBossActive() && state.bossMode.phase === "boss" && !target.destroyed && !target.locked;
  }
  return isDropVisible(target) && !target.revealed;
}

function getAnswerTargets() {
  return [...state.drops, ...getActiveBossParts()];
}

function isDropClickable(drop) {
  return isDropVisible(drop) && !drop.revealed;
}

function hitTestDrop(drop, x, y) {
  // Simple distance check against the drop center
  const dx = x - drop.x;
  const dy = y - (drop.y - 2); // center offset
  const radius = 26 * Math.min(getTextScale(), 1.28);
  return dx * dx + dy * dy <= radius * radius;
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
  const numericValue = parseNumericAnswer(value);
  const hasNumeric = Number.isFinite(numericValue);

  for (const drop of getAnswerTargets()) {
    if (!isAnswerTargetVisible(drop)) continue;
    // Factor drops require Enter + typed factorization
    if (drop.opKey === "factor") {
      if (enterPressed && matchesFactorDrop(value, drop)) return drop;
      continue;
    }
    // Fraction simplification requires Enter and lowest terms.
    if (drop.opKey === "reduce") {
      if (enterPressed && checkSimplifiedAnswer(drop.reduceOriginalNum, drop.reduceOriginalDen, value)) return drop;
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
    if (hasNumeric && Math.abs(drop.answer - numericValue) < 1e-9) return drop;
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
  const hasReduceDrops = getAnswerTargets().some((d) => d.opKey === "reduce" && isAnswerTargetVisible(d));
  if (hasReduceDrops && /^\d+(\/\d*)?$/.test(inputValue)) return true;
  const visible = getAnswerTargets().filter((d) => isAnswerTargetVisible(d) && d.opKey !== "si" && d.opKey !== "factor" && d.opKey !== "reduce");
  // Fraction entry (e.g. 9/2 for 4.5): allow while it is still being typed, and
  // accept it once it evaluates to a visible answer. A bare integer can also be
  // the numerator of a fraction when a fractional-answer drop is on screen.
  if (/^-?\d+\/\d*$/.test(inputValue)) {
    const fracValue = parseNumericAnswer(inputValue);
    if (!Number.isFinite(fracValue)) return true;
    return visible.some((drop) => Math.abs(drop.answer - fracValue) < 1e-9);
  }
  if (/^-?\d+$/.test(inputValue) && visible.some((drop) => !Number.isInteger(drop.answer))) return true;
  const typed = normalizeTypedValue(inputValue, { allowIncomplete: true });
  if (!typed) return true;
  return visible.some((drop) => {
    const text = drop.answerText || String(drop.answer);
    const normalizedAnswer = normalizeTypedValue(text, {
      allowIncomplete: false,
    });
    return normalizedAnswer.startsWith(typed);
  });
}

// During boss/challenge play the header "Cleared" slot shows live stage progress
// (Blitz survival, Wave load, mothership nodes) instead of the frozen session
// score.
function getScoreReadout() {
  if (isPlacementActive()) {
    const shield = Math.max(0, Math.round(state.placementState.shield ?? PLACEMENT_SHIELD_START));
    return {
      label: "Test Me",
      value: `L${state.placementState.level} · 🛡 ${shield}/${PLACEMENT_SHIELD_MAX}`,
    };
  }
  if (!state.bossMode?.active) return { label: "Cleared", value: String(state.score) };
  const phase = state.bossMode.phase;
  const isMothership = phase === "boss" || phase === "victory";
  // Stage label: standalone replays read Blitz/Wave/Boss; the full boss reads
  // Wave 1 (shield endurance), Wave 2 (load ladder), then Boss (mothership).
  const label = state.bossMode.mode === "blitz" ? "Blitz"
    : state.bossMode.mode === "wave" ? "Wave"
      : isMothership ? (state.bossMode.mode === "boss" ? "Worksheet" : "Boss")
        : state.bossMode.challengeType === "wave" ? "Wave 2" : "Wave 1";
  if (isMothership) {
    const { problemsTotal, problemsRemaining } = getBossPartCount();
    const cleared = Math.max(0, problemsTotal - problemsRemaining);
    const time = phase === "boss" ? getBossWorksheetElapsedMs() : state.bossMode.bossFinalDurationMs;
    return { label, value: `${cleared}/${problemsTotal} · ${formatDuration(time)}` };
  }
  if (phase === "challenge" || phase === "challengeComplete") {
    // Wave 1 ramps drop time; Wave 2 ramps simultaneous load.
    return {
      label,
      value: state.bossMode.challengeType === "wave"
        ? `${state.bossMode.waveMaxLoadCleared || 0} best · trying ${state.bossMode.challengeLoad}`
        : `${formatDuration(getBlitzSurvivalMs())} · ${formatDropSeconds(getBlitzDropSeconds())}`,
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
  resetCannonOverload();
  if (state.factorTargetId === match.id) state.factorTargetId = null;
  recordLearningResult(match, "correct");
  if (state.bossMode?.phase === "challenge" && match.bossKind === "bomb") {
    changeBlitzShield(BLITZ_CORRECT_SHIELD_GAIN, "correct");
  }
  if (!isBossActive()) state.score += 1;
  if (isPlacementDrop(match)) {
    handlePlacementDropFinished(match, true, "correct");
  }
  updateScoreDisplay();
  if (match.targetType === "bossProblem") {
    handleBossProblemDestroyed(match);
  } else {
    state.drops = state.drops.filter((d) => d.id !== match.id);
    if (match.bossKind === "bomb" && state.bossMode?.phase === "boss" && match.bossSourceNodeId) {
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
  state.currentInput = "";
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
  const enterRequired = visibleTargets.filter((drop) => drop.opKey === "si" || drop.opKey === "factor" || drop.opKey === "reduce");
  const target = getMostUrgentVisibleTarget(enterRequired.length ? enterRequired : visibleTargets);
  return target ? [target] : [];
}

function handleWrongInput({ targets = null } = {}) {
  if (state.isPaused || isBossStunned()) return;
  if (isCannonOverloaded()) {
    clearCurrentAnswerInput();
    updateInputHint();
    return;
  }
  clearAmbiguousTimer();
  const visibleTargets = getAnswerTargets().filter((drop) => isAnswerTargetVisible(drop));
  const targetsToRecord = Array.isArray(targets)
    ? targets.filter(Boolean)
    : state.bossMode?.phase === "challenge" && visibleTargets.length > 0
      ? [getMostUrgentVisibleTarget(visibleTargets)]
      : [];
  for (const drop of targetsToRecord) {
    recordLearningResult(drop, "wrong");
    if (isPlacementDrop(drop)) {
      handlePlacementDropFinished(drop, false, "wrong");
    }
  }
  if (targetsToRecord.length === 0) {
    heartbeatActiveSession({ persist: true });
  }
  if (targetsToRecord.some(isPlacementDrop)) {
    const placementIds = new Set(targetsToRecord.filter(isPlacementDrop).map((drop) => drop.id));
    state.drops = state.drops.filter((drop) => !placementIds.has(drop.id));
  }
  // A wrong typed answer does not drain shields — consistent with normal play,
  // where a wrong answer simply doesn't clear. Only landed bombs cost shields.
  playWrongInput();
  registerWrongSubmission();
  clearCurrentAnswerInput();
  updateInputHint();
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
  if (state.ambiguousTimer !== null) {
    clearTimeout(state.ambiguousTimer);
    state.ambiguousTimer = null;
  }
}

function processInput(value) {
  if (state.isPaused || isBossStunned()) return;
  if (!value) return;
  if (isCannonOverloaded()) {
    clearCurrentAnswerInput();
    updateInputHint();
    return;
  }
  clearAmbiguousTimer();

  // ── Targeting mode: step through factorization or fraction cancellation. ──
  if (isInFactorTargetMode()) {
    const target = getTargetedFactorDrop();
    if (!target) {
      exitFactorTargeting();
      return;
    }
    if (isReduceProblem(target)) {
      handleReduceTargetInput(target, value);
      return;
    }
    if (target.factorComplete) return; // waiting for Enter
    if (/[*^]/.test(value)) return; // a full a^b*c expression is completed on Enter, not stepwise
    const typedNum = Number(value);
    const isValidDivisor = !Number.isNaN(typedNum) && Number.isInteger(typedNum) && typedNum >= 2;
    if (isValidDivisor && target.factorRemaining % typedNum === 0) {
      advanceFactorDrop(target, typedNum, { fromTargeting: true });
      heartbeatActiveSession({ persist: true });
      answerInput.value = "";
      state.currentInput = "";
    } else if (isValidDivisor && target.factorRemaining % typedNum !== 0) {
      // Valid number but doesn't divide remaining
      handleWrongInput({ targets: [target] });
    } else if (!couldMatchTargetedFactor(value)) {
      handleWrongInput({ targets: [target] });
    }
    return;
  }

  // ── Normal mode: regular immediate-answer drops only; Enter-required drops wait. ──
  const match = findDropMatch(value);
  if (match) {
    if (hasLongerMatch(value)) {
      state.ambiguousTimer = setTimeout(() => {
        state.ambiguousTimer = null;
        const stillThere = state.drops.find((d) => d.id === match.id);
        if (stillThere && state.currentInput === value) {
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

function handleReduceTargetInput(target, value) {
  if (!isReduceProblem(target)) return;
  if (value.includes("*") || value.includes("^")) {
    handleWrongInput({ targets: [target] });
    return;
  }
  if (/^\d+$/.test(value)) {
    const factor = Number(value);
    const step = fractionCancelStep(target.reduceNum, target.reduceDen, factor);
    if (step) {
      setReducePreview(target, factor);
    } else {
      target.reducePreviewFactor = null;
      target.reduceInvalidReason = "";
      target.text = getReduceDisplayText(target);
    }
    return;
  }
  if (/^\d+\/\d*$/.test(value)) {
    target.reducePreviewFactor = null;
    target.reduceInvalidReason = "";
    target.text = getReduceDisplayText(target);
    return;
  }
  handleWrongInput({ targets: [target] });
}

function commitTargetedReduceAnswer(target, value) {
  if (!isReduceProblem(target)) return false;
  const typed = String(value || "").trim();
  if (!typed) {
    if (isReducedFraction(target.reduceNum, target.reduceDen)) {
      handleCorrectAnswer(target);
    } else {
      target.reduceInvalidReason = "keep reducing";
      handleWrongInput({ targets: [target] });
    }
    return true;
  }
  if (checkSimplifiedAnswer(target.reduceOriginalNum, target.reduceOriginalDen, typed)) {
    handleCorrectAnswer(target);
    return true;
  }
  if (/^\d+$/.test(typed)) {
    const factor = Number(typed);
    if (setReducePreview(target, factor) && commitReducePreview(target)) {
      heartbeatActiveSession({ persist: true });
      playPop();
      answerInput.value = "";
      state.currentInput = "";
      updateKpDisplay();
      return true;
    }
    target.reduceInvalidReason = "must divide both";
    handleWrongInput({ targets: [target] });
    return true;
  }
  handleWrongInput({ targets: [target] });
  return true;
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

// ── Step Targeting (prime factors and fraction cancellation) ──

function isInFactorTargetMode() {
  return state.factorTargetId !== null;
}

function getTargetedFactorDrop() {
  if (state.factorTargetId === null) return null;
  // Include boss ship nodes so a targeted node (even fully factored, awaiting
  // Enter) is still found; only destroyed/cleared targets release targeting.
  const pool = isBossActive() ? [...getActiveBossParts(), ...state.drops] : state.drops;
  const target = pool.find((d) => d.id === state.factorTargetId);
  if (!target || target.destroyed) {
    state.factorTargetId = null;
    return null;
  }
  if (!isBossActive() && target.revealed) {
    state.factorTargetId = null;
    return null;
  }
  return target;
}

function clearTargetStepPreview() {
  if (state.factorTargetId === null) return;
  const target = getTargetedFactorDrop();
  if (!isReduceProblem(target)) return;
  target.reducePreviewFactor = null;
  target.reduceInvalidReason = "";
  target.text = getReduceDisplayText(target);
}

function isTargetableStepProblem(problem) {
  if (!problem) return false;
  if (problem.opKey === "factor") return !problem.factorComplete;
  if (problem.opKey === "reduce") return !problem.revealed && !problem.destroyed;
  return false;
}

// Stepwise problems that can be targeted right now. In boss mode that means
// active ship nodes plus falling bombs; otherwise visible falling drops.
function getTargetableFactorProblems() {
  if (isBossActive()) {
    const nodes = getActiveBossParts().filter(isTargetableStepProblem);
    const bombs = state.drops.filter((d) => d.bossKind === "bomb" && isDropVisible(d) && isTargetableStepProblem(d));
    return [...nodes, ...bombs];
  }
  return state.drops.filter((d) => isDropVisible(d) && isTargetableStepProblem(d));
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
  state.factorTargetId = drop ? drop.id : null;
  answerInput.value = "";
  state.currentInput = "";
  answerInput.focus();
  updateKpDisplay();
}

function exitFactorTargeting() {
  state.factorTargetId = null;
  answerInput.value = "";
  state.currentInput = "";
  answerInput.focus();
  updateKpDisplay();
}

// ============================================================
// 10. Game Loop
// ============================================================

// When factor or reduce is the only operation in play, auto-target the most
// urgent stepwise drop so the player can work it without pressing Tab first.
// With other operations enabled, targeting stays manual to avoid surprises.
function maybeAutoTargetFactor() {
  const stepOpActive = isBossActive()
    ? ["factor", "reduce"].includes(state.bossMode.opKey)
    : (() => {
      const enabled = getEnabledOps();
      return enabled.length === 1 && ["factor", "reduce"].includes(enabled[0]);
    })();
  if (!stepOpActive) return;
  if (state.factorTargetId !== null && getTargetedFactorDrop()) return; // keep a valid current target
  const candidates = getTargetableFactorProblems();
  if (candidates.length === 0) return;
  const target = getMostUrgentVisibleTarget(candidates) || candidates[0];
  if (target) state.factorTargetId = target.id;
}

function tick(timestamp) {
  if (!state.lastTime) state.lastTime = timestamp;
  const dt = timestamp - state.lastTime;
  state.lastTime = timestamp;
  updateCannonOverload(dt);

  if (!state.isPaused && !isGameplayOverlayOpen()) {
    state.gameTime += dt;

    if (isBossActive()) {
      updateBossMode(dt);
      updateStarfield(dt);
    } else if (isPlacementActive()) {
      updatePlacementMode(dt);
    } else if (state.isBreatherMode) {
      maybeExitBreatherMode();
    } else if (state.dropLimit > 0) {
      // Spawn drops
      state.spawnTimer += dt;
      const interval = getSpawnInterval();
      let spawns = 0;
      while (state.spawnTimer >= interval && spawns < 2) {
        if (state.drops.length >= getMaxDrops()) {
          state.spawnTimer = Math.min(state.spawnTimer, interval);
          break;
        }
        const created = createDrop();
        if (!created) {
          state.spawnTimer = 0;
          break;
        }
        state.spawnTimer -= interval;
        spawns += 1;
      }
      if (state.spawnTimer >= interval) {
        state.spawnTimer = 0;
      }
    }

    if (!isBossStunned() && !state.isBreatherMode) {
      updateDrops(dt);
    }
    maybeAutoTargetFactor();
    updateSplashes(dt);
    updatePlayerShip(dt);
    updateLaser(dt);
    if (state.groundFlash > 0) state.groundFlash = Math.max(0, state.groundFlash - dt);
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
    || document.getElementById("shareBadgeOverlay")
    || document.getElementById("placementOverlay")
    || (feedback && !feedback.classList.contains("hidden"))
  );
}

// ============================================================
// 11. Audio
// ============================================================

// Audio sound effects live in src/audio.js (imported at the top of this file).

// ============================================================
// 12. Canvas Resize
// ============================================================

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  state.canvasDpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * state.canvasDpr));
  const height = Math.max(1, Math.round(rect.height * state.canvasDpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(state.canvasDpr, 0, 0, state.canvasDpr, 0, 0);
  resetCanvasPaintState();
  state.canvasW = Math.max(1, rect.width);
  state.canvasH = Math.max(1, rect.height);
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
  round: "\u2248",
  reduce: "\u00bd",
  si: "SI",
  shapes: "\u25b1",
  pow: "x\u207f",
  factor: "p\u00b7q",
};

const opDisplayNames = {
  add: "Add",
  sub: "Subtract",
  mul: "Multiply",
  div: "Divide",
  f10: "Factors of 10",
  round: "Rounding",
  reduce: "Simplify Fractions",
  si: "SI Conversions",
  shapes: "Shapes (P & A)",
  pow: "Powers & Roots",
  factor: "Prime Factors",
};


// When an operation first reaches mastery, interrupt briefly with a choice. The
// game loop pauses under modal overlays, so this does not cost drops.
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
  const skill = getProgressSkill(opKey);
  const level = opConfig[opKey]?.difficulty;
  const canAdvance = level < 10;
  const ready = Boolean(skill?.bossReady);
  const overlay = document.createElement("div");
  overlay.className = "overlay boss-offer-overlay";
  overlay.id = "bossOfferOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", ready ? "Level mastered" : "Level unlocked");

  const card = document.createElement("div");
  card.className = "card boss-offer";

  const title = document.createElement("h2");
  title.textContent = ready ? "Level Mastered" : "Level Unlocked";

  const msg = document.createElement("span");
  msg.className = "boss-offer-msg";
  if (ready) {
    msg.textContent = canAdvance
      ? `${opDisplayNames[opKey]} Level ${level} is mastered. Keep practicing, try the boss, or move to Level ${level + 1}.`
      : `${opDisplayNames[opKey]} Level ${level} is mastered. Keep practicing or try the boss.`;
  } else {
    msg.textContent = canAdvance
      ? `${opDisplayNames[opKey]} Level ${level} is already unlocked. Keep practicing, try the boss, or move to Level ${level + 1}.`
      : `${opDisplayNames[opKey]} Level ${level} is already unlocked. Keep practicing or try the boss.`;
  }

  const actions = document.createElement("div");
  actions.className = "boss-offer-actions";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "boss-offer-start";
  start.textContent = "Boss";
  start.addEventListener("click", () => {
    initAudio();
    closeBossOffer();
    startBossMode(opKey, { force: !getProgressSkill(opKey)?.bossReady });
  });

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "boss-offer-dismiss";
  dismiss.textContent = "Keep Practicing";
  dismiss.addEventListener("click", closeBossOffer);

  const next = document.createElement("button");
  next.type = "button";
  next.className = "boss-offer-next";
  next.textContent = "Next Level";
  next.hidden = !canAdvance;
  next.addEventListener("click", () => {
    initAudio();
    closeBossOffer();
    advanceMasteredLevel(opKey);
  });

  actions.appendChild(dismiss);
  actions.appendChild(start);
  actions.appendChild(next);
  card.appendChild(title);
  card.appendChild(msg);
  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  (canAdvance ? next : start).focus();
}

function closeBossVictoryPopup() {
  const existing = document.getElementById("bossVictoryOverlay");
  if (existing) existing.remove();
}

// End-of-run celebration after a full boss clear: congratulations, the three
// stage results (Wave 1 / Wave 2 / Worksheet), and a button to move on.
function closeShareBadgePopup() {
  const existing = document.getElementById("shareBadgeOverlay");
  if (existing) existing.remove();
}

function cloneRecapBest(best, fields) {
  if (!best) return null;
  const out = {};
  fields.forEach((field) => {
    if (best[field] !== undefined && best[field] !== null) out[field] = best[field];
  });
  if (best.level !== undefined && best.level !== null) out.level = best.level;
  if (best.at) out.at = best.at;
  return Object.keys(out).length > 0 ? out : null;
}

function hasBossClearForLevel(skill, level) {
  return Boolean(skill?.bossAttempts?.some((attempt) => (
    attempt.level === level && attempt.result === "cleared"
  )));
}

function getShareBadgeData(opKey, level) {
  const skill = state.progressProfile.skills?.[opKey];
  if (!skill) return null;
  const numericLevel = clamp(1, 10, Math.round(Number(level) || skill.currentLevel || 1));
  const playerName = state.progressProfile.user?.name && state.progressProfile.user.name !== "Local Player"
    ? state.progressProfile.user.name
    : "A Rain Math player";
  return {
    opKey,
    opName: opDisplayNames[opKey] || opKey,
    level: numericLevel,
    playerName,
    blitz: cloneRecapBest(getBlitzBest(skill, numericLevel), ["durationMs", "fastestDropSeconds", "clearedCount", "score"]),
    wave: cloneRecapBest(getChallengeBest(skill, "wave", numericLevel), ["maxLoadCleared", "maxLoadReached", "clearedCount", "score"]),
    worksheet: cloneRecapBest(getChallengeBest(skill, "boss", numericLevel), ["durationMs", "score"]),
    bossCleared: hasBossClearForLevel(skill, numericLevel),
    at: new Date().toISOString(),
  };
}

function getRecapDisplayData(data) {
  const opKey = data?.opKey || "";
  const level = clamp(1, 10, Math.round(Number(data?.level) || 1));
  const playerName = data?.playerName || data?.name || "A Rain Math player";
  const blitz = data?.blitz || null;
  const wave = data?.wave || null;
  const worksheet = data?.worksheet || null;
  const at = data?.at || new Date().toISOString();
  return {
    opKey,
    opName: data?.opName || opDisplayNames[opKey] || opKey || "Math",
    level,
    playerName,
    blitz,
    wave,
    worksheet,
    bossCleared: Boolean(data?.bossCleared),
    at,
    blitzText: blitz ? formatBlitzResult(blitz) : "not tried yet",
    waveText: wave ? formatWaveResult(wave) : "not tried yet",
    worksheetText: worksheet?.durationMs ? formatDuration(worksheet.durationMs) : "not tried yet",
    bossText: data?.bossCleared ? "cleared" : "not cleared yet",
    dateText: formatSessionStartedAt(at),
  };
}

function buildRecapPayload(data) {
  const display = getRecapDisplayData(data);
  const content = {
    v: 1,
    kind: "recap",
    name: display.playerName,
    opKey: display.opKey,
    level: display.level,
    blitz: display.blitz,
    wave: display.wave,
    worksheet: display.worksheet,
    bossCleared: display.bossCleared,
    at: display.at,
  };
  content.id = makeShareId(content);
  return content;
}

async function getRecapShareCode(data) {
  return encodeSharePayload(buildRecapPayload(data));
}

async function getRecapShareLink(data) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#recap=${await getRecapShareCode(data)}`;
}

function getShareBadgeText(data, recapLink = "") {
  const display = getRecapDisplayData(data);
  const leadVerb = display.bossCleared ? "cleared" : "reached";
  const lines = [
    `${display.playerName} ${leadVerb} ${display.opName} Level ${display.level}!`,
    `Blitz: ${display.blitzText}`,
    `Wave: ${display.waveText}`,
    `Worksheet: ${display.worksheetText}`,
    `Boss: ${display.bossText}`,
  ];
  if (recapLink) lines.push(recapLink);
  else if (window.location.protocol.startsWith("http")) lines.push(window.location.origin);
  return lines.join("\n");
}

async function copyShareBadge(data, statusEl) {
  if (statusEl) statusEl.textContent = "Preparing recap link…";
  await copyTextToClipboard(await getRecapShareLink(data), statusEl, "Copied recap link.");
}

async function shareBadge(data, statusEl) {
  if (statusEl) statusEl.textContent = "Preparing recap link…";
  const url = await getRecapShareLink(data);
  if (navigator.share) {
    try {
      await navigator.share({ title: "Rain Math recap", url });
      if (statusEl) statusEl.textContent = "Share sheet opened.";
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyShareBadge(data, statusEl);
}

function buildRecapCard(data) {
  const display = getRecapDisplayData(data);
  const badge = document.createElement("div");
  badge.className = "share-badge-art";
  const title = document.createElement("div");
  title.className = "share-badge-title";
  title.textContent = `${display.opName} Level ${display.level}`;
  const name = document.createElement("div");
  name.className = "share-badge-name";
  name.textContent = display.playerName;
  const rows = document.createElement("div");
  rows.className = "share-badge-rows";
  [
    ["Blitz", display.blitzText],
    ["Wave", display.waveText],
    ["Worksheet", display.worksheetText],
    ["Boss", display.bossText],
    ["Date", display.dateText],
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "share-badge-row";
    const l = document.createElement("span");
    l.textContent = label;
    const v = document.createElement("strong");
    v.textContent = value;
    row.append(l, v);
    rows.appendChild(row);
  });
  badge.append(title, name, rows);
  return badge;
}

function showShareBadge(opKey, level) {
  const data = getShareBadgeData(opKey, level);
  if (!data) return;
  closeShareBadgePopup();

  const overlay = document.createElement("div");
  overlay.className = "overlay share-badge-overlay";
  overlay.id = "shareBadgeOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Rain Math recap");
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeShareBadgePopup();
  });

  const card = document.createElement("div");
  card.className = "card share-badge-card";
  const badge = buildRecapCard(data);

  const shareText = document.createElement("pre");
  shareText.className = "share-badge-text";
  shareText.textContent = getShareBadgeText(data, "Preparing recap link…");
  getRecapShareLink(data)
    .then((link) => { shareText.textContent = getShareBadgeText(data, link); })
    .catch(() => { shareText.textContent = getShareBadgeText(data); });

  const status = document.createElement("div");
  status.className = "share-badge-status";
  status.setAttribute("aria-live", "polite");

  const buttons = document.createElement("div");
  buttons.className = "share-badge-buttons";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", closeShareBadgePopup);
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy";
  copy.addEventListener("click", () => copyShareBadge(data, status));
  const share = document.createElement("button");
  share.type = "button";
  share.className = "primary";
  share.textContent = navigator.share ? "Share" : "Copy to Share";
  share.addEventListener("click", () => shareBadge(data, status));
  buttons.append(close, copy, share);

  const donateNote = document.createElement("p");
  donateNote.className = "share-badge-donate-note";
  donateNote.append("Rain Math is ad-free, tracking-free, and runs with no server. Thank you for ");
  const donate = document.createElement("a");
  donate.className = "share-badge-donate";
  donate.href = SUPPORT_URL;
  donate.target = "_blank";
  donate.rel = "noopener noreferrer";
  donate.textContent = "donating";
  donateNote.appendChild(donate);
  donateNote.append(".");

  card.append(badge, shareText, status, buttons, donateNote);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  share.focus();
}

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
    ["Blitz", formatBlitzResult(info.wave1)],
    ["Wave", formatWaveResult(info.wave2)],
    ["Worksheet time", info.bossTimeMs != null ? formatDuration(info.bossTimeMs) : "—"],
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
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "boss-victory-badge";
  badge.textContent = "Recap";
  badge.addEventListener("click", () => showShareBadge(info.opKey, info.level));
  buttons.append(next, grid, badge);

  card.append(heading, sub, scores, buttons);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function getBossButtonTitle(skill) {
  if (skill?.bossReady) return "Choose boss, next level, or more practice";
  if (skill?.levelAdvancedForLevel || skill?.bossAttemptedForLevel) {
    return "This level is already unlocked. Choose boss, next level, or more practice.";
  }
  return `Choices unlock when ${BOSS_READY_SCORE}% of current-level problems have at least 3 attempts and 90% current accuracy.`;
}

function getReplayChallengeLevel(opKey, skill) {
  const selectedLevel = opConfig[opKey]?.difficulty || 1;
  const unlockedLevel = skill?.unlockedLevel || skill?.blitzUnlockedLevel || 0;
  if (selectedLevel <= unlockedLevel) return selectedLevel;
  const currentLevel = skill?.currentLevel || selectedLevel;
  return getReplayLockReason({
    selectedLevel,
    unlockedLevel,
    currentLevel,
    bossReady: Boolean(skill?.bossReady),
  }) ? 0 : selectedLevel;
}

function getChallengeLockReason(opKey, skill) {
  const selectedLevel = opConfig[opKey]?.difficulty || 1;
  const unlockedLevel = skill?.unlockedLevel || skill?.blitzUnlockedLevel || 0;
  const currentLevel = skill?.currentLevel || selectedLevel;
  return getReplayLockReason({
    selectedLevel,
    unlockedLevel,
    currentLevel,
    bossReady: Boolean(skill?.bossReady),
  });
}

function formatBlitzText(opKey, skill) {
  const level = getReplayChallengeLevel(opKey, skill);
  if (!level) return "";
  return formatBlitzBestText(level, getBlitzBest(state.progressProfile.skills?.[opKey], level));
}

function formatWaveText(opKey, skill) {
  const level = getReplayChallengeLevel(opKey, skill);
  if (!level) return "";
  return formatWaveBestText(level, getChallengeBest(state.progressProfile.skills?.[opKey], "wave", level));
}

function formatBossReplayText(opKey, skill) {
  const level = getReplayChallengeLevel(opKey, skill);
  if (!level) return "";
  return formatBossReplayBestText(level, getChallengeBest(state.progressProfile.skills?.[opKey], "boss", level));
}

function formatBadgeText(opKey, skill) {
  const level = getReplayChallengeLevel(opKey, skill);
  return level ? `Recap L${level}` : "";
}

function formatOpChitTip(opKey, baseTip) {
  const level = opConfig[opKey]?.difficulty || 1;
  const progress = getCourseProgressPercent(level);
  const fallbackTitle = opDisplayNames[opKey] || opKey;
  const lines = String(baseTip || fallbackTitle).split("\n");
  const title = lines.shift() || fallbackTitle;
  return [
    title,
    `Level ${level} of 10 · Course ${progress}%`,
    ...lines,
  ].join("\n");
}

function updateOpChitProgress() {
  document.querySelectorAll(".op-chit").forEach((btn) => {
    const opKey = btn.dataset.op;
    if (!opKey || !opConfig[opKey]) return;
    const baseTip = btn.dataset.baseTip || btn.dataset.tip || "";
    if (!btn.dataset.baseTip) btn.dataset.baseTip = baseTip;
    const level = opConfig[opKey].difficulty;
    const progress = getCourseProgressPercent(level);
    const tip = formatOpChitTip(opKey, baseTip);
    btn.dataset.tip = tip;
    btn.dataset.level = String(level);
    btn.dataset.courseProgress = String(progress);
    btn.style.setProperty("--course-progress", `${progress}%`);
    btn.setAttribute("aria-label", `${tip.replace(/\s+/g, " ")}. ${opConfig[opKey].enabled ? "On" : "Off"}.`);
    btn.setAttribute("aria-pressed", String(Boolean(opConfig[opKey].enabled)));
  });
}

function updateOpChits() {
  document.querySelectorAll(".op-chit").forEach((btn) => {
    const opKey = btn.dataset.op;
    if (!opKey || !opConfig[opKey]) return;
    btn.classList.toggle("active", opConfig[opKey].enabled);
    btn.disabled = isControlLocked();
  });
  updateOpChitProgress();
  buildDiffCards();
  buildKpDiffStrip();
  updateInputHint();
}

function updateInputHint() {
  const el = document.getElementById("inputHint");
  if (!el) return;
  if (isCannonOverloaded()) {
    const text = getCannonOverloadText();
    el.textContent = text;
    if (kpHint) kpHint.textContent = text;
    return;
  }
  if (isPlacementActive()) {
    const text = "Test Me: answer the falling problem. Missed problems repeat soon.";
    el.textContent = text;
    if (kpHint) kpHint.textContent = text;
    return;
  }
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
  const hasPow = enabled.includes("pow");
  const hasFactor = enabled.includes("factor");
  const hasReduce = enabled.includes("reduce");
  if (hasBasic || hasShapes || hasPow) hints.push("Type answer to clear");
  if (hasShapes) hints.push("Shapes: type the value; ○ is the π coefficient");
  if (hasPow) hints.push("Powers/roots: type the value (e.g. 7² → 49, √81 → 9)");
  if (hasReduce) hints.push("½: type 2/3 + Enter, or Tab to cancel common factors");
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
  return getReplayChallengeLevel(opKey, skill) > 0;
}

function buildDiffCards() {
  const container = document.getElementById("diffCards");
  if (!container) return;
  container.innerHTML = "";
  const enabled = getEnabledOps();
  const progressSummary = summarizeProfile(state.progressProfile);
  enabled.forEach((opKey) => {
    const config = opConfig[opKey];
    const range = getDifficultyRange(opKey, config.difficulty);
    const skill = progressSummary.skills[opKey];
    const replayLockReason = getChallengeLockReason(opKey, skill);

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
    downBtn.disabled = isControlLocked();
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      initAudio();
      setDifficulty(opKey, config.difficulty - 1);
    });

    const val = document.createElement("span");
    val.className = "diff-value";
    val.dataset.op = opKey;
    val.textContent = config.difficulty;

    const upBtn = document.createElement("button");
    upBtn.className = "diff-btn";
    upBtn.tabIndex = -1;
    upBtn.textContent = "+";
    upBtn.disabled = isControlLocked();
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

    const levelFeedback = document.createElement("div");
    levelFeedback.className = "diff-level-feedback";
    levelFeedback.dataset.op = opKey;
    levelFeedback.hidden = true;

    const rangeText = document.createElement("div");
    rangeText.className = "diff-range";
    rangeText.textContent = `${range.min}\u2013${range.max}`;

    const readyText = document.createElement("button");
    readyText.type = "button";
    readyText.className = "diff-ready";
    readyText.dataset.op = opKey;
    readyText.textContent = formatReadyText(skill);
    readyText.classList.toggle("is-qualified", Boolean(skill.bossAttemptedForLevel));
    readyText.classList.toggle("is-locked", !canOpenLevelChoices(skill));
    readyText.classList.toggle("is-ready-attention", shouldPromptBossAttempt(skill));
    readyText.disabled = isControlLocked();
    readyText.title = getBossButtonTitle(skill);
    readyText.setAttribute("aria-pressed", skill.bossAttemptedForLevel ? "true" : "false");
    readyText.addEventListener("click", (e) => {
      e.stopPropagation();
      initAudio();
      if (!canOpenLevelChoices(getProgressSkill(opKey))) {
        showMasteryGateFeedback(opKey);
        return;
      }
      showBossOffer(opKey);
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
    blitzBtn.textContent = formatBlitzText(opKey, skill);
    blitzBtn.hidden = Boolean(replayLockReason);
    blitzBtn.disabled = isControlLocked();
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
    waveBtn.textContent = formatWaveText(opKey, skill);
    waveBtn.hidden = Boolean(replayLockReason);
    waveBtn.disabled = isControlLocked();
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
    bossReplayBtn.textContent = formatBossReplayText(opKey, skill);
    bossReplayBtn.hidden = Boolean(replayLockReason);
    bossReplayBtn.disabled = isControlLocked();
    bossReplayBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      startBossReplayMode(opKey);
    });

    const badgeBtn = document.createElement("button");
    badgeBtn.type = "button";
    badgeBtn.className = "diff-challenge diff-badge";
    badgeBtn.dataset.op = opKey;
    badgeBtn.dataset.challenge = "badge";
    badgeBtn.textContent = formatBadgeText(opKey, skill);
    badgeBtn.hidden = Boolean(replayLockReason);
    badgeBtn.disabled = isControlLocked();
    badgeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      const level = getReplayChallengeLevel(opKey, summarizeProfile(state.progressProfile).skills[opKey]);
      if (level) showShareBadge(opKey, level);
    });

    const challengeRow = document.createElement("div");
    challengeRow.className = "diff-challenge-row";
    const challengeLock = document.createElement("div");
    challengeLock.className = "diff-challenge-lock";
    challengeLock.dataset.op = opKey;
    challengeLock.textContent = replayLockReason ? `Locked: ${replayLockReason}` : "";
    challengeLock.hidden = !replayLockReason;
    challengeRow.appendChild(challengeLock);
    challengeRow.appendChild(blitzBtn);
    challengeRow.appendChild(waveBtn);
    challengeRow.appendChild(bossReplayBtn);
    challengeRow.appendChild(badgeBtn);

    card.addEventListener("click", () => {
      showStatsPopup(opKey);
    });

    header.appendChild(label);
    header.appendChild(gridHint);
    card.appendChild(header);
    card.appendChild(controls);
    card.appendChild(levelFeedback);
    card.appendChild(readyText);
    card.appendChild(challengeRow);
    card.appendChild(readyMeter);
    card.appendChild(rangeText);
    container.appendChild(card);
  });
}

function updateReadinessDisplays() {
  const progressSummary = summarizeProfile(state.progressProfile);

  document.querySelectorAll(".diff-ready[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatReadyText(skill);
    el.classList.toggle("is-qualified", Boolean(skill?.bossAttemptedForLevel));
    el.classList.toggle("is-locked", !canOpenLevelChoices(skill));
    el.classList.toggle("is-ready-attention", shouldPromptBossAttempt(skill));
    el.classList.remove("needs-ready");
    el.disabled = isControlLocked();
    el.title = getBossButtonTitle(skill);
    el.setAttribute("aria-pressed", skill?.bossAttemptedForLevel ? "true" : "false");
  });

  document.querySelectorAll(".diff-level-feedback[data-op], .kp-diff-feedback[data-op]").forEach((el) => {
    el.textContent = "";
    el.hidden = true;
    el.classList.remove("is-visible");
  });

  document.querySelectorAll(".diff-value[data-op], .kp-diff-val[data-op]").forEach((el) => {
    el.classList.remove("needs-ready");
  });

  document.querySelectorAll(".diff-ready-fill[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.style.width = formatReadinessPercent(skill);
  });

  document.querySelectorAll(".diff-blitz[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = formatBlitzText(el.dataset.op, skill);
    el.hidden = Boolean(lockReason);
    el.disabled = isControlLocked();
  });

  document.querySelectorAll(".diff-wave[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = formatWaveText(el.dataset.op, skill);
    el.hidden = Boolean(lockReason);
    el.disabled = isControlLocked();
  });

  document.querySelectorAll(".diff-boss[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = formatBossReplayText(el.dataset.op, skill);
    el.hidden = Boolean(lockReason);
    el.disabled = isControlLocked();
  });

  document.querySelectorAll(".diff-badge[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = formatBadgeText(el.dataset.op, skill);
    el.hidden = Boolean(lockReason);
    el.disabled = isControlLocked();
  });

  document.querySelectorAll(".diff-challenge-lock[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = lockReason ? `Locked: ${lockReason}` : "";
    el.hidden = !lockReason;
  });

  document.querySelectorAll(".kp-diff-ready[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    el.textContent = formatReadyText(skill);
    el.classList.toggle("is-qualified", Boolean(skill?.bossAttemptedForLevel));
    el.classList.toggle("is-locked", !canOpenLevelChoices(skill));
    el.classList.toggle("is-ready-attention", shouldPromptBossAttempt(skill));
    el.classList.remove("needs-ready");
    el.disabled = isControlLocked();
    el.title = getBossButtonTitle(skill);
    el.setAttribute("aria-pressed", skill?.bossAttemptedForLevel ? "true" : "false");
  });

  document.querySelectorAll(".kp-diff-blitz[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = formatBlitzText(el.dataset.op, skill);
    el.hidden = Boolean(lockReason);
    el.disabled = isControlLocked();
  });

  document.querySelectorAll(".kp-diff-wave[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = formatWaveText(el.dataset.op, skill);
    el.hidden = Boolean(lockReason);
    el.disabled = isControlLocked();
  });

  document.querySelectorAll(".kp-diff-boss[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = formatBossReplayText(el.dataset.op, skill);
    el.hidden = Boolean(lockReason);
    el.disabled = isControlLocked();
  });

  document.querySelectorAll(".kp-diff-badge[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = formatBadgeText(el.dataset.op, skill);
    el.hidden = Boolean(lockReason);
    el.disabled = isControlLocked();
  });

  document.querySelectorAll(".kp-diff-lock[data-op]").forEach((el) => {
    const skill = progressSummary.skills[el.dataset.op];
    const lockReason = getChallengeLockReason(el.dataset.op, skill);
    el.textContent = lockReason ? `Locked: ${lockReason}` : "";
    el.hidden = !lockReason;
  });
}

// ============================================================
// 13b. Stats Popup
// ============================================================

function getVisualAccuracy(opKey, statsKey, asked, correct) {
  const problem = opKey && statsKey ? getProgressProblem(opKey, statsKey) : null;
  if (problem && isPlacementPlacedOut(problem) && (problem.attempts || 0) <= 0) return 1;
  if (problem?.attempts > 0) return problemCurrentAccuracy(problem);
  if (!asked) return 0;
  return correct / asked;
}

function isProblemPlacedOut(opKey, statsKey) {
  return Boolean(isPlacementPlacedOut(getProgressProblem(opKey, statsKey)));
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
  const placedOut = isProblemPlacedOut(opKey, statsKey);
  const accuracy = getVisualAccuracy(opKey, statsKey, asked, correct);
  const rgb = getAccuracyRGB(accuracy, asked > 0 || placedOut);
  if (!rgb) return "#1a1a2e"; // never asked — dark
  const alpha = placedOut && asked === 0 ? 0.78 : getConfidenceAlpha(asked);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(2)})`;
}

function getAccuracyText(asked, correct, opKey = null, statsKey = null) {
  return formatAccuracyText(asked, correct, isProblemPlacedOut(opKey, statsKey));
}

function getProgressProblem(opKey, statsKey) {
  return state.progressProfile.skills?.[opKey]?.problems?.[statsKey] || null;
}

function getStatsTooltip(opKey, statsKey, label, asked, correct) {
  const problem = getProgressProblem(opKey, statsKey);
  return buildStatsTooltip(problem, { label, asked, correct });
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
  note.textContent = "These colors match the falling drops: black is unseen, hue shows accuracy from red to yellow to green, brighter color means more attempts, and placed-out facts are green placement credit.";
  card.appendChild(note);

  if (opKey === "si") {
    card.appendChild(buildSIReferenceTable());
    card.appendChild(buildListStats(opKey, stats));
  } else if (opKey === "f10" || opKey === "round" || opKey === "factor" || opKey === "shapes" || opKey === "pow") {
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

function getReportSessions(limit = 20) {
  if (Array.isArray(state.reportViewReports)) {
    return state.reportViewReports.slice(0, Math.max(0, Math.round(limit)));
  }
  return summarizeSessionLog(getReportProfile(), limit).map(createSessionReportViewModel);
}

function getSessionSummaryById(sessionId) {
  return getReportSessions(20).find((session) => session.id === sessionId) || null;
}

// When set, the Session Log / Report popups render this shared (read-only)
// profile instead of the live one, so a parent opening a kid's share link sees
// exactly the same popups. Only the data source differs.

function getReportProfile() {
  return state.reportViewProfile || state.progressProfile;
}

function isViewingSharedReport() {
  return Boolean(state.reportViewProfile || state.reportViewReports);
}

function isViewingSharedRecap() {
  return Boolean(state.recapViewData);
}

// Generic clipboard copy with a textarea fallback, shared by the recap and the
// share-link buttons.
async function copyTextToClipboard(text, statusEl, okMsg = "Copied.") {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.setAttribute("readonly", "readonly");
      temp.style.position = "fixed";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
    if (statusEl) statusEl.textContent = okMsg;
    return true;
  } catch {
    if (statusEl) statusEl.textContent = "Copy failed. Select the link and copy it manually.";
    return false;
  }
}

// Public, read-only share blob: just the name + recent session log, which is all
// the log/report popups render. Encoded as URL-safe base64 (unicode-safe).
// A share blob carries the name plus session(s). Pass a sessionId to share just
// that one session's report (the common "share what I did today" case); omit it
// to share the recent log (capped so the link stays sendable).
// Baked-in salt for the share checksum. This is not real security (it lives in
// client JS), just tamper-evidence: someone who edits the decoded JSON and
// re-encodes will not know to recompute the hash hidden in the id.
const SHARE_SALT = "rm.aurora.v1";
const BACKUP_CODE_PREFIX = "RMBAK1:";

// The checksum is disguised as the trailing segment of a plausible export id, so
// a tamperer editing scores/name won't realize a sibling field must be updated.
// (Canonical content string + checksum logic live in game-core.)
// The bare tamper checksum over the content. `verifyShareChecksum` reads the
// part after the last "-", so a plain hash (no dashes) validates as-is.
function makeShareId(content) {
  return computeShareChecksum(content, SHARE_SALT);
}

function isShareChecksumValid(payload) {
  return verifyShareChecksum(payload, SHARE_SALT);
}

function buildSharedReportPayload(profile = state.progressProfile, sessionId = null) {
  const all = summarizeSessionLog(profile, 20).map(createSessionReportViewModel);
  const sessions = sessionId ? all.filter((s) => s.id === sessionId) : all.slice(0, 10);
  const content = {
    v: 2,
    n: profile?.user?.name || "Player",
    r: sessions.map((session, i) => compactSessionReportViewModel(session, i)),
  };
  content.id = makeShareId(content);
  return content;
}

async function deflateRawToB64url(str) {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(str));
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return bytesToB64url(new Uint8Array(buf));
}

async function inflateRawFromB64url(b64) {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(b64urlToBytes(b64));
  writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(buf);
}

// The share code is one scheme tag + body: "1" = deflate-raw (huge size win on
// the repetitive session JSON, and decoded bytes aren't human-readable), "0" =
// plain base64 fallback. Anything else is treated as a legacy untagged plain code.
async function encodeSharePayload(payload) {
  if (typeof CompressionStream === "function") {
    try {
      return `1${await deflateRawToB64url(JSON.stringify(payload))}`;
    } catch {
      /* fall back to plain */
    }
  }
  return `0${encodeShareString(payload)}`;
}

async function getShareReportCode(profile = state.progressProfile, sessionId = null) {
  return encodeSharePayload(buildSharedReportPayload(profile, sessionId));
}

async function decodeShareReportCode(code) {
  if (!code) return null;
  const tag = code[0];
  const body = code.slice(1);
  try {
    if (tag === "1") {
      if (typeof DecompressionStream !== "function") return null;
      return JSON.parse(await inflateRawFromB64url(body));
    }
    if (tag === "0") return decodeShareString(body);
    return decodeShareString(code); // legacy untagged plain b64
  } catch {
    return null;
  }
}

async function getSharedReportLink(profile = state.progressProfile, sessionId = null) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#report=${await getShareReportCode(profile, sessionId)}`;
}

function buildProfileBackupPayload(profile = state.progressProfile) {
  const content = {
    v: 1,
    app: PROFILE_VERSION,
    kind: "backup",
    profile: JSON.parse(JSON.stringify(profile)),
  };
  content.id = makeShareId(content);
  return content;
}

async function getProfileBackupCode(profile = state.progressProfile) {
  return `${BACKUP_CODE_PREFIX}${await encodeSharePayload(buildProfileBackupPayload(profile))}`;
}

async function decodeProfileBackupCode(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed.startsWith(BACKUP_CODE_PREFIX)) {
    return { ok: false, message: "This backup code is not recognized." };
  }
  const payload = await decodeShareReportCode(trimmed.slice(BACKUP_CODE_PREFIX.length));
  if (!payload || payload.kind !== "backup" || payload.v !== 1 || !payload.profile) {
    return { ok: false, message: "This backup looks damaged." };
  }
  if (Number.isFinite(payload.app) && payload.app > PROFILE_VERSION) {
    return { ok: false, message: "This backup is from a newer version of Rain Math." };
  }
  if (!isShareChecksumValid(payload)) {
    return { ok: false, message: "This backup looks damaged." };
  }
  return { ok: true, payload, profile: payload.profile };
}

function getBackupProfileConflict(profile) {
  const id = String(profile?.user?.id || "");
  const name = String(profile?.user?.name || "").trim().toLowerCase();
  return getProfileList().find((candidate) => (
    (id && candidate.id === id)
    || (name && String(candidate.name || "").trim().toLowerCase() === name)
  )) || null;
}

async function restoreProfileBackupCode(code, { confirmReplace = true } = {}) {
  const decoded = await decodeProfileBackupCode(code);
  if (!decoded.ok) return decoded;
  const conflict = getBackupProfileConflict(decoded.profile);
  if (conflict && confirmReplace) {
    const ok = window.confirm(`Restore will replace ${conflict.name}'s progress — continue?`);
    if (!ok) return { ok: false, message: "Restore cancelled." };
  }
  saveProfile(state.progressProfile);
  const restored = importStoredProfile(decoded.profile);
  activateProfile(restored);
  return {
    ok: true,
    profile: JSON.parse(JSON.stringify(restored)),
    replaced: Boolean(conflict),
    message: `${restored.user?.name || "Player"} restored.`,
  };
}

function getBackupFileName(profile = state.progressProfile) {
  const safeName = String(profile?.user?.name || "player")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "player";
  return `rainmath-${safeName}-backup.txt`;
}

// Share a single report with a parent: native share sheet when available
// ("send it to their parents"), otherwise copy the link to the clipboard.
async function shareReportWithParent(sessionId, statusEl) {
  if (statusEl) statusEl.textContent = "Preparing link…";
  const url = await getSharedReportLink(state.progressProfile, sessionId);
  if (navigator.share) {
    try {
      await navigator.share({ title: "Rain Math report", url });
      if (statusEl) statusEl.textContent = "Shared.";
      return;
    } catch {
      /* cancelled or unsupported — fall back to copying */
    }
  }
  copyTextToClipboard(url, statusEl, "Report link copied.");
}

function openSharedReportView(payload) {
  if (!payload) return false;
  let sessions;
  if (payload.v === 2) {
    sessions = Array.isArray(payload.r) ? payload.r.map(expandCompactSessionReportViewModel) : [];
    state.reportViewReports = sessions;
    state.reportViewProfile = {
      user: { name: typeof payload.n === "string" ? payload.n : "Player" },
      sessionLog: [],
      skills: {},
    };
  } else if (payload.v === 1) {
    sessions = Array.isArray(payload.sessionLog)
      ? summarizeSessionLog({ sessionLog: payload.sessionLog }, 20).map(createSessionReportViewModel)
      : [];
    state.reportViewReports = null;
    state.reportViewProfile = {
      user: { name: typeof payload.name === "string" ? payload.name : "Player" },
      sessionLog: payload.sessionLog || [],
      skills: {},
    };
  } else {
    return false;
  }
  // A single shared session opens straight to its report; a multi-session log
  // opens the list.
  if (sessions.length === 1) buildSessionReportPopup(sessions[0].id);
  else buildSessionLogPopup();
  return true;
}

function exitSharedReportView() {
  state.reportViewProfile = null;
  state.reportViewReports = null;
  closeSessionLogPopup();
  closeSessionReportPopup();
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  answerInput.focus();
}

function recapDataFromPayload(payload) {
  if (!payload || payload.kind !== "recap" || payload.v !== 1) return null;
  const opKey = typeof payload.opKey === "string" ? payload.opKey : "";
  return {
    opKey,
    opName: opDisplayNames[opKey] || opKey || "Math",
    level: clamp(1, 10, Math.round(Number(payload.level) || 1)),
    playerName: typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : "A Rain Math player",
    blitz: payload.blitz || null,
    wave: payload.wave || null,
    worksheet: payload.worksheet || null,
    bossCleared: Boolean(payload.bossCleared),
    at: typeof payload.at === "string" ? payload.at : new Date().toISOString(),
  };
}

function openSharedRecapView(payload) {
  const data = recapDataFromPayload(payload);
  if (!data) return false;
  state.recapViewData = data;
  closeWelcomeMenu({ focus: false });
  closeTutorialOverlay({ focus: false });
  closeLoginPopup();
  closeStatsPopup();
  closeSessionLogPopup();
  closeSessionReportPopup();
  closeShareBadgePopup();

  const overlay = document.createElement("div");
  overlay.className = "overlay share-badge-overlay";
  overlay.id = "shareBadgeOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Shared Rain Math recap");
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) exitSharedRecapView();
  });

  const card = document.createElement("div");
  card.className = "card share-badge-card share-badge-card-shared";
  const banner = document.createElement("p");
  banner.className = "share-badge-shared";
  banner.textContent = "Shared recap (read-only).";
  card.appendChild(banner);
  card.appendChild(buildRecapCard(data));

  const actions = document.createElement("div");
  actions.className = "share-badge-buttons";
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "primary";
  exit.textContent = "Exit shared view";
  exit.addEventListener("click", exitSharedRecapView);
  actions.appendChild(exit);
  card.appendChild(actions);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  exit.focus();
  return true;
}

function exitSharedRecapView() {
  state.recapViewData = null;
  closeShareBadgePopup();
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  answerInput.focus();
}

function getReportHashCode() {
  const match = window.location.hash.match(/^#report=(.+)$/);
  return match ? match[1] : null;
}

function getRecapHashCode() {
  const match = window.location.hash.match(/^#recap=(.+)$/);
  return match ? match[1] : null;
}

// Brief toast (reuses the boss-offer styling) shown when a shared link can't be
// decoded — usually because it was truncated/duplicated when copied.
function showSharedReportError() {
  closeBossOffer();
  const toast = document.createElement("div");
  toast.className = "boss-offer";
  toast.id = "bossOfferToast";
  const msg = document.createElement("span");
  msg.className = "boss-offer-msg";
  msg.textContent = "That shared link looks broken or incomplete — ask for a fresh one.";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "boss-offer-dismiss";
  dismiss.textContent = "✕";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.addEventListener("click", closeBossOffer);
  toast.append(msg, dismiss);
  document.body.appendChild(toast);
  window.setTimeout(() => {
    if (document.getElementById("bossOfferToast") === toast) toast.remove();
  }, 9000);
}

// Open a shared #report link. Used both at cold load and on hashchange (when the
// site is already open in a tab and only the hash changes — no reload fires).
function openSharedReportFromCode(code) {
  if (!code) return;
  decodeShareReportCode(code).then((payload) => {
    // Reject decode failures and tampered payloads (checksum mismatch) the same
    // way — the player just sees "looks broken or incomplete".
    if (!(payload && isShareChecksumValid(payload) && openSharedReportView(payload))) {
      showSharedReportError();
    }
  });
}

function openSharedRecapFromCode(code) {
  if (!code) return;
  decodeShareReportCode(code).then((payload) => {
    if (!(payload && isShareChecksumValid(payload) && openSharedRecapView(payload))) {
      showSharedReportError();
    }
  });
}

window.addEventListener("hashchange", () => {
  if (isViewingSharedReport() || isViewingSharedRecap()) return;
  const reportCode = getReportHashCode();
  if (reportCode) {
    openSharedReportFromCode(reportCode);
    return;
  }
  const recapCode = getRecapHashCode();
  if (recapCode) openSharedRecapFromCode(recapCode);
});

function buildSessionLogPopup() {
  closeWelcomeMenu({ focus: false });
  closeTutorialOverlay({ focus: false });
  closeLoginPopup();
  closeStatsPopup();
  closeSessionLogPopup();
  closeSessionReportPopup();
  const viewing = isViewingSharedReport();
  if (!viewing) heartbeatActiveSession({ persist: true });

  const sessions = getReportSessions(20);
  const overlay = document.createElement("div");
  overlay.className = "overlay session-log-overlay";
  overlay.id = "sessionLogOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Session log");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) (viewing ? exitSharedReportView() : closeSessionLogPopup());
  });

  const card = document.createElement("div");
  card.className = "card session-log-card";

  const header = document.createElement("div");
  header.className = "session-log-header";
  const title = document.createElement("h2");
  title.textContent = "Session Log";
  const active = document.createElement("div");
  active.className = "session-log-active";
  active.textContent = getReportProfile()?.user?.name || getActiveProfileName();
  header.appendChild(title);
  header.appendChild(active);
  card.appendChild(header);

  const sub = document.createElement("p");
  sub.className = "session-log-sub";
  sub.textContent = viewing
    ? `Viewing ${active.textContent}'s shared progress (read-only). Open any session for its report.`
    : "A sitting stays in one local session across brief reloads; a long break or player switch starts a new one. Boss/challenge work is listed separately from ordinary practice accuracy.";
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
      row.classList.toggle("is-current", session.id === state.activeSessionId);

      const top = document.createElement("div");
      top.className = "session-log-row-top";
      const when = document.createElement("div");
      when.className = "session-log-when";
      when.textContent = `${formatSessionStartedAt(session.startedAt)}${session.id === state.activeSessionId ? " · current" : ""}`;
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
      details.textContent = formatSessionLogDetails(session);

      row.appendChild(top);
      row.appendChild(details);
      list.appendChild(row);
    });
  }

  card.appendChild(list);

  const closeBtn = document.createElement("button");
  closeBtn.className = "primary";
  closeBtn.textContent = viewing ? "Exit shared view" : "Close";
  closeBtn.addEventListener("click", () => (viewing ? exitSharedReportView() : closeSessionLogPopup()));
  card.appendChild(closeBtn);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function closeSessionLogPopup() {
  const existing = document.getElementById("sessionLogOverlay");
  if (existing) existing.remove();
}

function buildSessionReportPopup(sessionId) {
  if (!isViewingSharedReport()) heartbeatActiveSession({ persist: true });
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
  const viewing = isViewingSharedReport();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) (viewing ? exitSharedReportView() : closeSessionReportPopup());
  });

  const card = document.createElement("div");
  card.className = "card session-report-card";

  const header = document.createElement("div");
  header.className = "session-report-header";
  const title = document.createElement("h2");
  title.textContent = viewing
    ? `${getReportProfile()?.user?.name || "Shared"}'s Report`
    : "Session Report";
  const meta = document.createElement("div");
  meta.className = "session-report-meta";
  meta.textContent = `${formatSessionStartedAt(session.startedAt)} · ${formatDuration(session.durationMs)}`;
  header.appendChild(title);
  header.appendChild(meta);
  card.appendChild(header);

  const sub = document.createElement("p");
  sub.className = "session-report-sub";
  sub.textContent = viewing
    ? "Shared progress (read-only)."
    : "Per-operation progress for this saved session. Time is engaged problem time, capped per problem so idle tabs do not inflate it.";
  card.appendChild(sub);

  if (!viewing) {
    const share = document.createElement("div");
    share.className = "session-report-share";
    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.id = "sessionReportShare";
    shareBtn.className = "session-report-share-btn";
    shareBtn.textContent = "Send report";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.id = "sessionReportCopy";
    copyBtn.className = "session-report-share-btn";
    copyBtn.textContent = "Copy link";
    const shareStatus = document.createElement("span");
    shareStatus.className = "session-report-share-status";
    shareStatus.setAttribute("aria-live", "polite");
    shareBtn.addEventListener("click", () => shareReportWithParent(session.id, shareStatus));
    copyBtn.addEventListener("click", async () => {
      shareStatus.textContent = "Preparing link…";
      copyTextToClipboard(await getSharedReportLink(state.progressProfile, session.id), shareStatus, "Report link copied.");
    });
    share.append(shareBtn, copyBtn, shareStatus);
    card.appendChild(share);
  }

  const summary = document.createElement("div");
  summary.className = "session-report-summary";
  summary.textContent = formatSessionSummary(session);
  card.appendChild(summary);

  if (session.challenges.started || session.challenges.completed) {
    const challengeSummary = document.createElement("div");
    challengeSummary.className = "session-report-summary";
    challengeSummary.textContent = formatSessionChallengeBreakdown(session.challenges);
    card.appendChild(challengeSummary);
  }

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
      formatSessionOperationStats(operation).forEach((piece) => {
        const line = document.createElement("div");
        line.className = "session-report-stat-line";
        line.textContent = piece;
        stats.appendChild(line);
      });

      const mastery = document.createElement("div");
      mastery.className = "session-report-mastery";
      const levels = getSessionReportLevels(operation);
      const masteryTitle = document.createElement("div");
      masteryTitle.className = "session-report-mastery-title";
      masteryTitle.textContent = "Mastery by level";
      mastery.appendChild(masteryTitle);
      levels.forEach((level) => {
        const line = document.createElement("div");
        line.className = "session-report-level-line";
        line.textContent = formatSessionLevelProgress(level);
        mastery.appendChild(line);
      });

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
  backBtn.hidden = viewing;
  backBtn.addEventListener("click", () => {
    closeSessionReportPopup();
    buildSessionLogPopup();
  });
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "primary";
  closeBtn.textContent = viewing ? "Exit shared view" : "Close";
  closeBtn.addEventListener("click", () => (viewing ? exitSharedReportView() : closeSessionReportPopup()));
  if (!viewing) actions.appendChild(backBtn);
  actions.appendChild(closeBtn);
  card.appendChild(actions);

  const donateNote = document.createElement("p");
  donateNote.className = "session-report-donate-note";
  donateNote.append("Rain Math is ad-free, tracking-free, and runs with no server. Thank you for ");
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

function buildWelcomeMenu({ firstVisit = false } = {}) {
  closeWelcomeMenu({ focus: false });
  closeTutorialOverlay({ focus: false });
  closePlacementOverlay({ focus: false });
  closeShareBadgePopup();
  closeBossVictoryPopup();
  closeBossOffer();
  closeLoginPopup();
  closeStatsPopup();
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
  const playerCurrent = document.createElement("div");
  playerCurrent.className = "welcome-current-player";
  const currentName = getActiveProfileName() === "Local Player"
    ? getText("welcome.localPlayer")
    : getActiveProfileName();
  playerCurrent.textContent = formatText(getText("welcome.currentPlayer"), { playerName: currentName });
  playerPanel.appendChild(playerTitle);
  playerPanel.appendChild(playerSub);
  playerPanel.appendChild(playerCurrent);

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
    startRun();
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

  const testBtn = document.createElement("button");
  testBtn.type = "button";
  testBtn.className = "welcome-test";
  testBtn.id = "welcomeTestMe";
  testBtn.textContent = getText("welcome.testMe");
  testBtn.addEventListener("click", () => {
    closeWelcomeMenu({ focus: false });
    showPlacementOverlay();
  });

  const loginBtn = document.createElement("button");
  loginBtn.type = "button";
  loginBtn.className = "welcome-login";
  loginBtn.id = "welcomeLogin";
  loginBtn.textContent = getText("welcome.fullLoginMenu");
  loginBtn.addEventListener("click", () => {
    openLoginPopup({ keepWelcome: true });
  });

  actions.appendChild(playBtn);
  actions.appendChild(tutorialBtn);
  actions.appendChild(testBtn);
  actions.appendChild(loginBtn);

  const supportBox = document.createElement("div");
  supportBox.className = "welcome-support";
  const supportTitleText = getText("support.welcomeTitle", "").trim();
  const supportBodyText = getText("support.welcomeBody", "").trim();
  if (supportTitleText) {
    const supportTitle = document.createElement("div");
    supportTitle.className = "welcome-support-title";
    supportTitle.textContent = supportTitleText;
    supportBox.appendChild(supportTitle);
  }
  if (supportBodyText) {
    const supportBody = document.createElement("p");
    supportBody.textContent = supportBodyText;
    supportBox.appendChild(supportBody);
  }
  const supportAnchor = document.createElement("a");
  supportAnchor.href = SUPPORT_URL;
  supportAnchor.target = "_blank";
  supportAnchor.rel = "noopener noreferrer";
  supportAnchor.textContent = getText("support.welcomeLink");
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

function removePlacementOverlay() {
  const existing = document.getElementById("placementOverlay");
  if (existing) existing.remove();
}

function closePlacementOverlay({ focus = true } = {}) {
  removePlacementOverlay();
  const runId = state.placementState?.runId;
  if (runId) {
    state.drops = state.drops.filter((drop) => drop.placementRunId !== runId);
  }
  state.placementState = null;
  updateScoreDisplay();
  updateInputHint();
  updateOpChits();
  updateControlDisplay();
  if (focus) answerInput.focus();
}

function makePlacementProblem(opKey, level) {
  const config = createDefaultOpConfig();
  if (config[opKey]) config[opKey].difficulty = clamp(1, 10, Math.round(level || 1));
  const problem = generateProblem(opKey, config);
  if (problem.opKey === "factor") {
    problem.answerText = getFullFactorization(problem.factorOriginal);
  }
  return problem;
}

function getPlacementCorrectAnswer(problem) {
  if (!problem) return "";
  if (problem.opKey === "factor") return getFullFactorization(problem.factorOriginal);
  return String(problem.answerText ?? problem.answer ?? "");
}

function isPlacementAnswerCorrect(problem, value) {
  const typed = String(value || "").trim();
  if (!typed || !problem) return false;
  if (problem.opKey === "factor") return matchesFactorDrop(typed, problem);
  if (problem.opKey === "reduce") return checkSimplifiedAnswer(problem.reduceOriginalNum, problem.reduceOriginalDen, typed);
  if (problem.opKey === "si") return typed === problem.answerText;
  const normalizedTyped = normalizeTypedValue(typed, { allowIncomplete: false });
  const normalizedAnswer = normalizeTypedValue(getPlacementCorrectAnswer(problem), { allowIncomplete: false });
  return normalizedTyped === normalizedAnswer;
}

function getPlacementFrontierProblems(opKey, level) {
  const current = getSkillUniverseProblems(opKey, level);
  if (level <= 1) return current;
  const prior = new Set(getSkillUniverseProblems(opKey, level - 1).map((problem) => problem.statsKey));
  const frontier = current.filter((problem) => !prior.has(problem.statsKey));
  return frontier.length > 0 ? frontier : current;
}

function makePlacementDrop(entry) {
  if (!state.placementState?.opKey) return null;
  const problem = makeProblemFromUniverseEntry(state.placementState.opKey, entry, state.placementState.level)
    || makePlacementProblem(state.placementState.opKey, state.placementState.level);
  if (!problem) return null;
  const padding = 42;
  const left = padding;
  const right = Math.max(padding + 20, state.canvasW - padding);
  const drop = {
    id: state.nextDropId++,
    x: randInt(left, right),
    y: -24,
    baseSpeed: Math.max(46, (state.canvasH + 60) / placementDropSeconds(state.placementState.opKey)),
    placementRunId: state.placementState.runId,
    placementLevel: state.placementState.level,
    placementEntry: { statsKey: entry.statsKey, text: entry.text, retry: Boolean(entry.retry) },
    createdAtMs: performance.now(),
  };
  copyProblemToTarget(problem, drop);
  drop.placementEntry = {
    statsKey: drop.statsKey || entry.statsKey,
    text: drop.text || entry.text,
    retry: Boolean(entry.retry),
  };
  return drop;
}

function preparePlacementLevel(level) {
  if (!state.placementState?.active) return;
  const nextLevel = clamp(1, 10, Math.round(level || 1));
  const queue = shuffleArray(getPlacementFrontierProblems(state.placementState.opKey, nextLevel));
  state.placementState.level = nextLevel;
  state.placementState.stage = "running";
  state.placementState.queue = queue.map((entry) => ({ ...entry, retry: false }));
  state.placementState.levelTotal = state.placementState.queue.length;
  state.placementState.levelAsked = 0;
  state.placementState.levelCorrect = 0;
  state.placementState.levelMistakes = 0;
  state.placementState.shield = PLACEMENT_SHIELD_START;
  state.placementState.pendingDropMs = 0;
  state.placementState.currentDropId = null;
  updateScoreDisplay();
  updateInputHint();
}

function startPlacementRun(opKey, level = 1) {
  if (!opConfig[opKey]) return;
  removePlacementOverlay();
  clearAmbiguousTimer();
  resetCannonOverload({ clearCooldown: true });
  for (const key of Object.keys(opConfig)) {
    opConfig[key].enabled = key === opKey;
  }
  state.drops = [];
  state.factorTargetId = null;
  state.spawnTimer = 0;
  state.placementState = {
    active: true,
    stage: "running",
    runId: `placement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    opKey,
    level: clamp(1, 10, Math.round(level || 1)),
    passedLevel: 0,
    totalAsked: 0,
    totalCorrect: 0,
    totalMistakes: 0,
    history: [],
    levelSummaries: [],
    recommendedLevel: null,
    reason: "",
    queue: [],
    levelTotal: 0,
    levelAsked: 0,
    levelCorrect: 0,
    levelMistakes: 0,
    shield: PLACEMENT_SHIELD_START,
    pendingDropMs: 0,
    currentDropId: null,
  };
  preparePlacementLevel(state.placementState.level);
  state.hasStarted = true;
  state.isPaused = false;
  updatePauseControlLabels();
  updateOpChits();
  updateControlDisplay();
  drawDrops();
  answerInput.focus();
}

function startPlacementForOp(opKey, level = 1) {
  startPlacementRun(opKey, level);
}

function queuePlacementRetry(drop) {
  if (!state.placementState?.active || !drop) return;
  const retry = {
    ...(drop.placementEntry || { statsKey: drop.statsKey || drop.text, text: drop.text }),
    retry: true,
  };
  const firstSlot = Math.min(1, state.placementState.queue.length);
  for (let i = 0; i < PLACEMENT_RETRY_COUNT; i += 1) {
    if (i === 0) {
      state.placementState.queue.splice(firstSlot, 0, { ...retry });
    } else {
      state.placementState.queue.push({ ...retry });
    }
  }
}

function recordPlacementLevelSummary() {
  if (!state.placementState?.active) return;
  const accuracy = state.placementState.levelAsked > 0
    ? state.placementState.levelCorrect / state.placementState.levelAsked
    : 0;
  const last = state.placementState.levelSummaries.at(-1);
  if (last?.level === state.placementState.level && last.asked === state.placementState.levelAsked) {
    return accuracy;
  }
  state.placementState.levelSummaries.push({
    level: state.placementState.level,
    asked: state.placementState.levelAsked,
    correct: state.placementState.levelCorrect,
    mistakes: state.placementState.levelMistakes,
    accuracy,
  });
  return accuracy;
}

// Shield filled — the player is comfortable at this level, so climb to the next
// (or finish if they cleared the top level).
function climbPlacementLevel() {
  if (!state.placementState?.active) return;
  recordPlacementLevelSummary();
  state.placementState.passedLevel = Math.max(state.placementState.passedLevel, state.placementState.level);
  if (state.placementState.level >= 10) {
    finishPlacementRun({ recommendedLevel: 10, reason: "cleared every level" });
  } else {
    preparePlacementLevel(state.placementState.level + 1);
  }
}

function handlePlacementDropFinished(drop, correct, outcome = correct ? "correct" : "wrong") {
  if (!isPlacementDrop(drop)) return;
  state.placementState.totalAsked += 1;
  state.placementState.levelAsked += 1;
  if (correct) {
    state.placementState.totalCorrect += 1;
    state.placementState.levelCorrect += 1;
    state.placementState.shield = Math.min(PLACEMENT_SHIELD_MAX, state.placementState.shield + PLACEMENT_SHIELD_GAIN);
    state.placementState.shieldPulseMs = BLITZ_SHIELD_PULSE_MS;
  } else {
    state.placementState.totalMistakes += 1;
    state.placementState.levelMistakes += 1;
    state.placementState.shield = Math.max(0, state.placementState.shield - PLACEMENT_SHIELD_LOSS);
    state.placementState.shieldHitMs = BLITZ_SHIELD_HIT_MS;
    queuePlacementRetry(drop);
  }
  state.placementState.history.push({
    level: state.placementState.level,
    text: drop.text,
    statsKey: drop.statsKey,
    outcome,
  });
  state.placementState.currentDropId = null;
  state.placementState.pendingDropMs = PLACEMENT_NEXT_DROP_MS;
  updateScoreDisplay();

  // Shield resolves the level (decision logic lives in game-core, unit-tested).
  const decision = resolvePlacementOutcome(
    {
      shield: state.placementState.shield,
      level: state.placementState.level,
      levelAsked: state.placementState.levelAsked,
    },
    {
      shieldMax: PLACEMENT_SHIELD_MAX,
      shieldStart: PLACEMENT_SHIELD_START,
      attemptCap: PLACEMENT_LEVEL_ATTEMPT_CAP,
    }
  );
  if (decision.action === "climb") {
    climbPlacementLevel();
  } else if (decision.action === "finish") {
    finishPlacementRun({ recommendedLevel: decision.recommendedLevel, reason: decision.reason });
  }
}

function spawnNextPlacementDrop() {
  if (!state.placementState?.active) return false;
  // The shield (not an exhausted queue) ends a level, so refill when empty.
  if (state.placementState.queue.length === 0) {
    state.placementState.queue = shuffleArray(getPlacementFrontierProblems(state.placementState.opKey, state.placementState.level))
      .map((entry) => ({ ...entry, retry: false }));
  }
  const entry = state.placementState.queue.shift();
  const drop = entry ? makePlacementDrop(entry) : null;
  if (!drop) return false;
  state.placementState.currentDropId = drop.id;
  state.drops.push(drop);
  return true;
}

function updatePlacementMode(dt) {
  if (!state.placementState?.active) return;
  // Decay the shield pulse/crack animations every frame.
  state.placementState.shieldPulseMs = Math.max(0, (state.placementState.shieldPulseMs || 0) - dt);
  state.placementState.shieldHitMs = Math.max(0, (state.placementState.shieldHitMs || 0) - dt);
  if (state.drops.some(isPlacementDrop)) return;
  state.placementState.pendingDropMs = Math.max(0, (state.placementState.pendingDropMs || 0) - dt);
  if (state.placementState.pendingDropMs > 0) return;
  spawnNextPlacementDrop();
}

function finishPlacementRun({ recommendedLevel, reason = "" } = {}) {
  if (!state.placementState) return;
  const runId = state.placementState.runId;
  if (state.placementState.active && state.placementState.levelAsked > 0) {
    recordPlacementLevelSummary();
  }
  state.placementState.active = false;
  state.placementState.stage = "result";
  state.placementState.reason = reason;
  state.placementState.recommendedLevel = clamp(1, 10, Math.round(recommendedLevel || state.placementState.level || 1));
  state.drops = state.drops.filter((drop) => drop.placementRunId !== runId);
  if (state.factorTargetId !== null && !state.drops.some((drop) => drop.id === state.factorTargetId)) {
    state.factorTargetId = null;
  }
  showPlacementResultOverlay();
  updateOpChits();
  updateControlDisplay();
  updateScoreDisplay();
  updateInputHint();
  drawDrops();
}

function acceptPlacementLevel(level = state.placementState?.recommendedLevel || state.placementState?.passedLevel || state.placementState?.level || 1) {
  if (!state.placementState?.opKey) return;
  const opKey = state.placementState.opKey;
  const runId = state.placementState.runId;
  const nextLevel = clamp(1, 10, Math.round(level || 1));
  const set = getOpSet(opKey);
  for (const key of Object.keys(opConfig)) {
    if (key === opKey) {
      opConfig[key].enabled = true;
    } else if (opConfig[key].enabled && getOpSet(key) !== set) {
      opConfig[key].enabled = false;
    }
  }
  state.drops = state.drops.filter((drop) => drop.placementRunId !== runId && opConfig[drop.opKey]?.enabled);
  state.progressProfile = recordPlacementCredit(state.progressProfile, opKey, {
    level: nextLevel,
    placedOutThrough: nextLevel - 1,
    source: "test-me",
  });
  saveProfile(state.progressProfile);
  resetProblemStats(problemStats);
  mirrorLegacyProblemStats(state.progressProfile, problemStats);
  setDifficulty(opKey, nextLevel, { force: true });
  syncProgressSettings();
  markWelcomeSeen();
  closePlacementOverlay();
  updateOpChits();
  updateControlDisplay();
  updateScoreDisplay();
  drawDrops();
}

function submitPlacementAnswer(value) {
  if (!state.placementState?.active) return;
  const drop = state.drops.find(isPlacementDrop);
  if (!drop) return;
  if (isPlacementAnswerCorrect(drop, value)) {
    handleCorrectAnswer(drop);
  } else {
    handleWrongInput({ targets: [drop] });
  }
}

function renderPlacementHeader(card) {
  const title = document.createElement("h2");
  title.textContent = getText("placement.title");
  const sub = document.createElement("p");
  sub.className = "placement-sub";
  sub.textContent = getText("placement.subtitle");
  card.append(title, sub);
}

function renderPlacementSelect(card) {
  renderPlacementHeader(card);
  const grid = document.createElement("div");
  grid.className = "placement-op-grid";
  Object.keys(opConfig).forEach((opKey) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "placement-op";
    btn.dataset.op = opKey;
    const symbol = document.createElement("strong");
    symbol.textContent = opDisplayLabels[opKey] || opKey;
    const name = document.createElement("span");
    name.textContent = opDisplayNames[opKey] || opKey;
    btn.append(symbol, name);
    btn.addEventListener("click", () => startPlacementForOp(opKey));
    grid.appendChild(btn);
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "placement-close";
  close.textContent = getText("common.close");
  close.addEventListener("click", () => closePlacementOverlay());
  card.append(grid, close);
}

function renderPlacementResult(card) {
  const opName = opDisplayNames[state.placementState.opKey] || state.placementState.opKey;
  const result = formatPlacementResult(state.placementState, opName);
  const level = result.level;
  const title = document.createElement("h2");
  title.textContent = result.title;
  const body = document.createElement("p");
  body.className = "placement-sub";
  body.textContent = result.body;
  const details = document.createElement("div");
  details.className = "placement-note";
  details.textContent = result.details;
  const actions = document.createElement("div");
  actions.className = "placement-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => closePlacementOverlay());
  const use = document.createElement("button");
  use.type = "button";
  use.className = "primary";
  use.textContent = `Use Level ${level}`;
  use.addEventListener("click", () => acceptPlacementLevel(level));
  actions.append(close, use);
  if (level < 10) {
    const tryNext = document.createElement("button");
    tryNext.type = "button";
    tryNext.textContent = `Try Level ${level + 1}`;
    tryNext.addEventListener("click", () => startPlacementRun(state.placementState.opKey, level + 1));
    actions.append(tryNext);
  }
  card.append(title, body, details, actions);
  setTimeout(() => use.focus(), 0);
}

function showPlacementResultOverlay() {
  if (!state.placementState) return;
  removePlacementOverlay();
  renderPlacementOverlay();
}

function renderPlacementOverlay() {
  if (!state.placementState) state.placementState = { stage: "select" };
  removePlacementOverlay();
  const overlay = document.createElement("div");
  overlay.className = "overlay placement-overlay";
  overlay.id = "placementOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", getText("placement.ariaLabel"));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closePlacementOverlay();
  });
  const card = document.createElement("div");
  card.className = "card placement-card";
  if (state.placementState.stage === "result") {
    renderPlacementResult(card);
  } else {
    renderPlacementSelect(card);
  }
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function showPlacementOverlay() {
  closeWelcomeMenu({ focus: false });
  closeTutorialOverlay({ focus: false });
  closeLoginPopup();
  closeStatsPopup();
  closeSessionLogPopup();
  closeSessionReportPopup();
  closeShareBadgePopup();
  closeBossVictoryPopup();
  closeBossOffer();
  state.placementState = { stage: "select" };
  renderPlacementOverlay();
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
  state.tutorialStepIndex = 0;
  state.tutorialFromWelcome = fromWelcome;
  renderTutorialStep();
}

function renderTutorialStep({ fromWelcome = state.tutorialFromWelcome } = {}) {
  state.tutorialFromWelcome = fromWelcome;
  closeTutorialOverlay({ focus: false });
  const step = TUTORIAL_STEPS[state.tutorialStepIndex] || TUTORIAL_STEPS[0];
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
    dot.classList.toggle("active", index === state.tutorialStepIndex);
    dot.setAttribute("aria-hidden", "true");
    progress.appendChild(dot);
  });

  const kicker = document.createElement("div");
  kicker.className = "tutorial-kicker";
  kicker.textContent = formatText(getText("tutorial.progressLabel"), {
    kicker: step.kicker,
    current: state.tutorialStepIndex + 1,
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
  backBtn.disabled = state.tutorialStepIndex === 0;
  backBtn.addEventListener("click", () => {
    state.tutorialStepIndex = Math.max(0, state.tutorialStepIndex - 1);
    renderTutorialStep({ fromWelcome });
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "primary tutorial-next";
  nextBtn.textContent = state.tutorialStepIndex === TUTORIAL_STEPS.length - 1
    ? getText("common.play")
    : getText("common.next");
  nextBtn.addEventListener("click", () => {
    if (state.tutorialStepIndex >= TUTORIAL_STEPS.length - 1) {
      closeTutorialOverlay({ markSeen: true });
      return;
    }
    state.tutorialStepIndex += 1;
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
  state.tutorialStepIndex = Math.min(TUTORIAL_STEPS.length - 1, state.tutorialStepIndex + 1);
  renderTutorialStep();
}

function showPreviousTutorialStep() {
  if (!document.getElementById("tutorialOverlay")) return;
  state.tutorialStepIndex = Math.max(0, state.tutorialStepIndex - 1);
  renderTutorialStep();
}

// ============================================================
// 13e. Login Popup
// ============================================================

function getActiveProfileName() {
  return state.progressProfile?.user?.name || "Login";
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
  const testMeText = getText("welcome.testMe");
  ["testMeLink", "touchTestMeLink"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = testMeText;
  });
  const finishText = getText("common.finish") || "Finish";
  ["finishBtn", "touchFinishLink"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = finishText;
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

// Login popup lives in src/popups/login-popup.js. openLoginPopup() builds the
// engine context it needs.
function openLoginPopup({ keepWelcome = false } = {}) {
  buildLoginPopupView({
    getProgressProfile: () => state.progressProfile,
    getActiveProfileName,
    formatProfileUpdatedAt,
    createBackupCode: async () => {
      saveProfile(state.progressProfile);
      return getProfileBackupCode(state.progressProfile);
    },
    getBackupFileName: () => getBackupFileName(state.progressProfile),
    restoreBackupCode: restoreProfileBackupCode,
    copyTextToClipboard,
    heartbeatActiveSession,
    deleteProfile: deleteStoredProfile,
    activateProfile,
    onProfileChanged: rebuildWelcomeMenu,
    closeOtherPopups: () => {
      if (!keepWelcome) closeWelcomeMenu({ focus: false });
      closeTutorialOverlay({ focus: false });
      closePlacementOverlay({ focus: false });
      closeShareBadgePopup();
      closeStatsPopup();
    },
  });
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
      const placedOut = isProblemPlacedOut(opKey, key);

      const inRange = a <= currentRange.max && b <= currentRange.max;
      const label = `${a} ${operators[opKey]?.symbol || ""} ${b} = ${
        opKey === "div" ? a : operators[opKey].fn(a, b)
      }`;
      td.className = "stats-cell"
        + (inRange ? "" : " stats-cell-outside")
        + (placedOut ? " stats-cell-placed-out" : "");
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
  const rows = getSIReferenceRows(opConfig.si.difficulty);

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

  for (const row of rows) {
    const tr = document.createElement("tr");
    if (!row.active) tr.style.opacity = "0.3";

    const tdName = document.createElement("td");
    tdName.textContent = row.name;

    const tdSym = document.createElement("td");
    tdSym.textContent = row.sym || "—";
    tdSym.style.fontWeight = "700";

    const tdBase10 = document.createElement("td");
    tdBase10.textContent = row.base10;

    const tdFactor = document.createElement("td");
    tdFactor.textContent = row.factor;

    tr.appendChild(tdName);
    tr.appendChild(tdSym);
    tr.appendChild(tdBase10);
    tr.appendChild(tdFactor);
    table.appendChild(tr);
  }

  wrap.appendChild(table);
  return wrap;
}

function buildListStats(opKey, stats) {
  const entries = opKey === "round"
    ? getRoundUniverse(opConfig.round.difficulty).map((problem) => [
        problem.statsKey,
        stats[problem.statsKey] || { asked: 0, correct: 0 },
      ])
    : opKey === "reduce"
      ? getReduceUniverse(opConfig.reduce.difficulty).map((problem) => [
          problem.statsKey,
          stats[problem.statsKey] || { asked: 0, correct: 0 },
        ])
      : Object.entries(stats);
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
    row.classList.toggle("stats-row-placed-out", isProblemPlacedOut(opKey, text));
    const label = formatStatsKeyLabel(opKey, text);
    attachStatsTooltip(row, getStatsTooltip(opKey, text, label, entry.asked, entry.correct));

    const problem = document.createElement("span");
    problem.className = "stats-f10-text";
    problem.textContent = label;

    const pct = document.createElement("span");
    pct.className = "stats-f10-pct";
    pct.textContent = getAccuracyText(entry.asked, entry.correct, opKey, text);

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
    speedSlider.value = String(state.gameSpeed);
    speedSlider.disabled = isControlLocked();
  }
  if (speedValueEl) {
    speedValueEl.textContent = `${state.gameSpeed}%`;
  }
  if (dropLimitSlider) {
    dropLimitSlider.value = String(state.dropLimit);
    dropLimitSlider.disabled = isControlLocked();
  }
  if (dropLimitValueEl) {
    dropLimitValueEl.textContent = String(state.dropLimit);
  }
  if (textSizeSelect) {
    textSizeSelect.value = normalizeTextSizeSetting(state.textSize);
    textSizeSelect.disabled = isControlLocked();
  }
  if (textSizeValueEl) {
    textSizeValueEl.textContent = getTextSizeLabel();
  }
  const kpSpeedVal = document.getElementById("kpSpeedVal");
  if (kpSpeedVal) kpSpeedVal.textContent = `${state.gameSpeed}%`;
  const kpDropsVal = document.getElementById("kpDropsVal");
  if (kpDropsVal) kpDropsVal.textContent = String(state.dropLimit);
  const kpTextSizeBtn = document.getElementById("kpTextSizeBtn");
  if (kpTextSizeBtn) kpTextSizeBtn.textContent = getTextSizeLabel();
  document.querySelectorAll(".kp-sbtn").forEach((btn) => {
    btn.disabled = isControlLocked();
  });
  document.querySelectorAll(".op-chit").forEach((btn) => {
    btn.disabled = isControlLocked();
  });
}

// The single Start/Pause/Resume control label, derived from run state: a fresh
// (not-yet-started) run shows "Start"; after that it's Pause/Resume.
function pauseControlLabel() {
  if (!state.hasStarted) return "Start";
  return state.isPaused ? "Resume" : "Pause";
}

function updatePauseControlLabels() {
  if (pauseBtn) pauseBtn.textContent = pauseControlLabel();
  if (kpPauseBtn) kpPauseBtn.textContent = pauseControlLabel();
}

// Begin a ready run (the player pressed Start / Play). Toggling problem types
// before this only stages them — nothing spawns until here.
function startRun() {
  state.hasStarted = true;
  state.isPaused = false;
  state.lastTime = 0;
  updatePauseControlLabels();
  answerInput.focus();
}

// The Start/Pause/Resume button: Start a ready run, otherwise toggle pause.
function togglePauseOrStart() {
  if (!state.hasStarted) {
    startRun();
    return;
  }
  togglePause();
}

function togglePause() {
  state.isPaused = !state.isPaused;
  if (state.isPaused) exitBreatherMode();
  updatePauseControlLabels();
  if (!state.isPaused) {
    state.lastTime = 0;
    answerInput.focus();
  }
}

function restartGame() {
  resetRunState();
}

function finishCurrentSession() {
  initAudio();
  clearAmbiguousTimer();
  closeBossOffer();
  closeBossVictoryPopup();
  closeShareBadgePopup();
  closeStatsPopup();
  closeLoginPopup();
  closeSessionLogPopup();
  closeSessionReportPopup();
  closeWelcomeMenu({ focus: false });
  closeTutorialOverlay({ focus: false });
  closePlacementOverlay({ focus: false });

  state.bossMode = null;
  state.isBreatherMode = false;
  state.factorTargetId = null;
  state.drops = [];
  state.spawnTimer = 0;
  state.lastTime = 0;
  state.currentInput = "";
  answerInput.value = "";
  resetCannonOverload({ clearCooldown: true });
  Object.keys(opConfig).forEach((opKey) => {
    opConfig[opKey].enabled = false;
  });
  heartbeatActiveSession({ persist: true });

  updateOpChits();
  updateDifficultyDisplays();
  updateControlDisplay();
  updateScoreDisplay();
  updateReadinessDisplays();
  updateBossHud();
  updateBreatherHud();
  updateInputHint();
  updateKpDisplay();
  updatePauseControlLabels();
  drawDrops();
  buildSessionReportPopup(state.activeSessionId);
}

// Answer input handler — single path for all input processing
answerInput.addEventListener("input", (event) => {
  initAudio();
  if (isCannonOverloaded()) {
    clearCurrentAnswerInput();
    updateInputHint();
    return;
  }
  const value = answerInput.value;

  // Prevent spaces
  if (value.includes(" ")) {
    answerInput.value = value.replace(/\s/g, "");
  }

  state.currentInput = answerInput.value;
  processInput(state.currentInput);
  if (isBossStunned()) {
    answerInput.value = "";
    state.currentInput = "";
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

  if (isCannonOverloaded()) {
    event.preventDefault();
    clearCurrentAnswerInput();
    updateInputHint();
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    clearCurrentAnswerInput();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (state.isPaused || isBossStunned()) return;

    if (isInFactorTargetMode()) {
      const target = getTargetedFactorDrop();
      if (target && isReduceProblem(target)) {
        commitTargetedReduceAnswer(target, answerInput.value.trim());
        return;
      }
      if (target && target.factorComplete) {
        handleCorrectAnswer(target);
        return;
      }
      // Exit targeting mode so typed factorization can be checked
      state.factorTargetId = null; // exit silently without clearing input
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
  if (document.getElementById("shareBadgeOverlay")) {
    if (event.key === "Escape") {
      closeShareBadgePopup();
      event.preventDefault();
    }
    return;
  }
  if (document.getElementById("placementOverlay")) {
    if (event.key === "Escape") {
      closePlacementOverlay();
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
  if (event.key === "Tab" && !state.isPaused) {
    const factorDrops = getVisibleFactorDrops();
    if (factorDrops.length > 0) {
      event.preventDefault();
      if (event.shiftKey) {
        const prev = getPrevFactorDrop(state.factorTargetId);
        if (prev) {
          enterFactorTargeting(prev);
        } else {
          exitFactorTargeting();
        }
      } else {
        const next = getNextFactorDrop(state.factorTargetId);
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
    if (document.activeElement === answerInput && state.currentInput) {
      answerInput.value = "";
      state.currentInput = "";
      event.preventDefault();
      return;
    }
    togglePause();
    event.preventDefault();
    return;
  }

  // Focus input and insert character when not paused and input not focused
  if (
    !state.isPaused &&
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
    togglePauseOrStart();
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

// Finish button
if (finishBtn) {
  finishBtn.tabIndex = -1;
  finishBtn.addEventListener("click", finishCurrentSession);
}

// Practice controls
if (speedSlider) {
  speedSlider.addEventListener("input", () => {
    if (isControlLocked()) return;
    initAudio();
    setPracticeControls({ speed: Number(speedSlider.value) });
  });
}

if (dropLimitSlider) {
  dropLimitSlider.addEventListener("input", () => {
    if (isControlLocked()) return;
    initAudio();
    setPracticeControls({ drops: Number(dropLimitSlider.value) });
  });
}

if (textSizeSelect) {
  textSizeSelect.addEventListener("change", () => {
    if (isControlLocked()) return;
    initAudio();
    setTextSize(textSizeSelect.value);
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
  if (state.isPaused) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Check drops in reverse order (topmost drawn last)
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const drop = state.drops[i];
    if (!isDropClickable(drop)) continue;
    if (hitTestDrop(drop, x, y)) {
      if (drop.opKey === "factor" || drop.opKey === "reduce") {
        // Click a stepwise drop to enter targeting mode on it
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
const testMeLink = document.getElementById("testMeLink");
const loginLink = document.getElementById("loginLink");
const sessionLogLink = document.getElementById("sessionLogLink");
const feedbackLink = document.getElementById("feedbackLink");
const fbCancel = document.getElementById("fbCancel");

if (menuLink) {
  menuLink.addEventListener("click", (e) => {
    e.preventDefault();
    buildWelcomeMenu({ firstVisit: false });
  });
}
if (testMeLink) {
  testMeLink.addEventListener("click", (e) => {
    e.preventDefault();
    showPlacementOverlay();
  });
}
if (loginLink) {
  loginLink.addEventListener("click", (e) => {
    e.preventDefault();
    openLoginPopup();
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
    touchBrand.innerHTML = `<div class="logo">MR</div><div class="touch-score"><span id="touchScoreLabel">Cleared</span>: <span id="touchScore">0</span></div><a href="#" class="touch-menu" id="touchMenuLink">${getText("welcome.menuLink")}</a><a href="#" class="touch-test" id="touchTestMeLink">${getText("welcome.testMe")}</a><a href="#" class="touch-login" id="touchLoginLink">Login</a><a href="#" class="touch-finish" id="touchFinishLink">Finish</a><a href="#" class="touch-log" id="touchSessionLogLink">Log</a><a href="${SUPPORT_URL}" class="touch-support" id="touchSupportLink" target="_blank" rel="noopener noreferrer">${getText("support.shortLabel")}</a><a href="#" class="touch-fb" id="touchFbLink">?</a>`;
    controlsBar.insertBefore(touchBrand, opChits);
    const touchMenuLink = document.getElementById("touchMenuLink");
    if (touchMenuLink) {
      touchMenuLink.addEventListener("click", (e) => {
        e.preventDefault();
        buildWelcomeMenu({ firstVisit: false });
      });
    }
    const touchLoginLink = document.getElementById("touchLoginLink");
    const touchTestMeLink = document.getElementById("touchTestMeLink");
    if (touchTestMeLink) {
      touchTestMeLink.addEventListener("click", (e) => {
        e.preventDefault();
        showPlacementOverlay();
      });
    }
    if (touchLoginLink) {
      touchLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        openLoginPopup();
      });
    }
    const touchSessionLogLink = document.getElementById("touchSessionLogLink");
    if (touchSessionLogLink) {
      touchSessionLogLink.addEventListener("click", (e) => {
        e.preventDefault();
        buildSessionLogPopup();
      });
    }
    const touchFinishLink = document.getElementById("touchFinishLink");
    if (touchFinishLink) {
      touchFinishLink.addEventListener("click", (e) => {
        e.preventDefault();
        finishCurrentSession();
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
    togglePauseOrStart();
  });
  wireKpButton(kpRestartBtn, () => {
    restartGame();
  });

  wireKpButton(document.getElementById("kpSpeedDn"), () => {
    if (!isControlLocked()) setPracticeControls({ speed: state.gameSpeed - 10 });
  });
  wireKpButton(document.getElementById("kpSpeedUp"), () => {
    if (!isControlLocked()) setPracticeControls({ speed: state.gameSpeed + 10 });
  });
  wireKpButton(document.getElementById("kpDropsDn"), () => {
    if (!isControlLocked()) setPracticeControls({ drops: state.dropLimit - 1 });
  });
  wireKpButton(document.getElementById("kpDropsUp"), () => {
    if (!isControlLocked()) setPracticeControls({ drops: state.dropLimit + 1 });
  });
  wireKpButton(document.getElementById("kpTextSizeBtn"), () => {
    if (!isControlLocked()) cycleTextSize();
  });

  updateControlDisplay();
}

// Build inline diff items in the keypad controls row
function buildKpDiffStrip() {
  const strip = document.getElementById("kpDiffStrip");
  if (!strip) return;
  strip.innerHTML = "";
  const enabled = getEnabledOps();
  const progressSummary = summarizeProfile(state.progressProfile);
  enabled.forEach((opKey) => {
    const config = opConfig[opKey];
    const skill = progressSummary.skills[opKey];
    const replayLockReason = getChallengeLockReason(opKey, skill);
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
    downBtn.disabled = isControlLocked();
    wireKpButton(downBtn, () => setDifficulty(opKey, opConfig[opKey].difficulty - 1));

    const val = document.createElement("span");
    val.className = "kp-diff-val";
    val.dataset.op = opKey;
    val.textContent = config.difficulty;

    const levelFeedback = document.createElement("span");
    levelFeedback.className = "kp-diff-feedback";
    levelFeedback.dataset.op = opKey;
    levelFeedback.hidden = true;

    const ready = document.createElement("button");
    ready.type = "button";
    ready.className = "kp-diff-ready";
    ready.dataset.op = opKey;
    ready.textContent = formatReadyText(skill);
    ready.classList.toggle("is-qualified", Boolean(skill.bossAttemptedForLevel));
    ready.classList.toggle("is-locked", !canOpenLevelChoices(skill));
    ready.disabled = isControlLocked();
    ready.title = getBossButtonTitle(skill);
    ready.setAttribute("aria-pressed", skill.bossAttemptedForLevel ? "true" : "false");
    wireKpButton(ready, () => {
      if (!canOpenLevelChoices(getProgressSkill(opKey))) {
        showMasteryGateFeedback(opKey);
        return;
      }
      showBossOffer(opKey);
    });

    const blitz = document.createElement("button");
    blitz.type = "button";
    blitz.className = "kp-diff-challenge kp-diff-blitz";
    blitz.dataset.op = opKey;
    blitz.textContent = formatBlitzText(opKey, skill);
    blitz.hidden = Boolean(replayLockReason);
    blitz.disabled = isControlLocked();
    wireKpButton(blitz, () => startBlitzMode(opKey));

    const wave = document.createElement("button");
    wave.type = "button";
    wave.className = "kp-diff-challenge kp-diff-wave";
    wave.dataset.op = opKey;
    wave.textContent = formatWaveText(opKey, skill);
    wave.hidden = Boolean(replayLockReason);
    wave.disabled = isControlLocked();
    wireKpButton(wave, () => startWaveMode(opKey));

    const bossReplay = document.createElement("button");
    bossReplay.type = "button";
    bossReplay.className = "kp-diff-challenge kp-diff-boss";
    bossReplay.dataset.op = opKey;
    bossReplay.textContent = formatBossReplayText(opKey, skill);
    bossReplay.hidden = Boolean(replayLockReason);
    bossReplay.disabled = isControlLocked();
    wireKpButton(bossReplay, () => startBossReplayMode(opKey));

    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "kp-diff-challenge kp-diff-badge";
    badge.dataset.op = opKey;
    badge.textContent = formatBadgeText(opKey, skill);
    badge.hidden = Boolean(replayLockReason);
    badge.disabled = isControlLocked();
    wireKpButton(badge, () => {
      const level = getReplayChallengeLevel(opKey, summarizeProfile(state.progressProfile).skills[opKey]);
      if (level) showShareBadge(opKey, level);
    });

    const challengeLock = document.createElement("span");
    challengeLock.className = "kp-diff-lock";
    challengeLock.dataset.op = opKey;
    challengeLock.textContent = replayLockReason ? `Locked: ${replayLockReason}` : "";
    challengeLock.hidden = !replayLockReason;

    const upBtn = document.createElement("button");
    upBtn.className = "kp-diff-btn";
    upBtn.textContent = "+";
    upBtn.disabled = isControlLocked();
    wireKpButton(upBtn, () => setDifficulty(opKey, opConfig[opKey].difficulty + 1));

    item.appendChild(label);
    item.appendChild(gridHint);
    item.appendChild(downBtn);
    item.appendChild(val);
    item.appendChild(upBtn);
    item.appendChild(levelFeedback);
    item.appendChild(ready);
    item.appendChild(challengeLock);
    item.appendChild(blitz);
    item.appendChild(wave);
    item.appendChild(bossReplay);
    item.appendChild(badge);

    // Click the item (not buttons) to show stats
    item.addEventListener("click", (e) => {
      if ([downBtn, upBtn, ready, blitz, wave, bossReplay, badge, levelFeedback, challengeLock].includes(e.target)) return;
      showStatsPopup(opKey);
    });

    strip.appendChild(item);
  });
}

function updateKpDisplay() {
  if (!kpDisplay) return;
  if (isCannonOverloaded()) {
    kpDisplay.textContent = "OVERLOAD";
    return;
  }
  kpDisplay.textContent = state.currentInput || "\u00a0";
}

function handleKeypadPress(key) {
  if (isBossStunned()) {
    answerInput.value = "";
    state.currentInput = "";
    updateKpDisplay();
    return;
  }
  if (isCannonOverloaded()) {
    clearCurrentAnswerInput();
    updateInputHint();
    return;
  }

  if (key === "Backspace") {
    clearCurrentAnswerInput();
    return;
  }

  if (key === "Enter") {
    if (state.isPaused) return;
    if (isInFactorTargetMode()) {
      const target = getTargetedFactorDrop();
      if (target && isReduceProblem(target)) {
        commitTargetedReduceAnswer(target, state.currentInput.trim());
        updateKpDisplay();
        return;
      }
      if (target && target.factorComplete) {
        handleCorrectAnswer(target);
        updateKpDisplay();
        return;
      }
      state.factorTargetId = null;
    }
    const value = state.currentInput.trim();
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
    if (state.isPaused) return;
    const factorDrops = getVisibleFactorDrops();
    if (factorDrops.length > 0) {
      const next = getNextFactorDrop(state.factorTargetId);
      if (next) {
        enterFactorTargeting(next);
      } else {
        exitFactorTargeting();
      }
    }
    return;
  }

  // Character key (digit, *, ^, /, -, .)
  state.currentInput = state.currentInput + key;
  answerInput.value = state.currentInput;
  processInput(state.currentInput);
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
    score: state.score,
    scoreReadout: cloneForTest(getScoreReadout()),
    drops: state.drops.map((drop) => ({ ...drop, factorCollected: { ...(drop.factorCollected || {}) } })),
    opConfig: cloneForTest(opConfig),
    problemStats: cloneForTest(problemStats),
    progressProfile: cloneForTest(state.progressProfile),
    progressSummary: cloneForTest(summarizeProfile(state.progressProfile)),
    sessionLog: cloneForTest(summarizeSessionLog(state.progressProfile)),
    activeSessionId: state.activeSessionId,
    bossMode: cloneForTest(state.bossMode),
    laser: cloneForTest(getLaser()),
    playerShip: cloneForTest(getPlayerShip()),
    currentPressure: cloneForTest(getCurrentPressure()),
    gameSpeed: state.gameSpeed,
    dropLimit: state.dropLimit,
    textSize: state.textSize,
    isPaused: state.isPaused,
    hasStarted: state.hasStarted,
    isBreatherMode: state.isBreatherMode,
    cannonOverloadMs: state.cannonOverloadMs,
    wrongSubmissionCount: state.wrongSubmissionTimes.length,
    factorTargetId: state.factorTargetId,
    currentInput: state.currentInput,
    welcomeVisible: Boolean(document.getElementById("welcomeOverlay")),
    tutorialVisible: Boolean(document.getElementById("tutorialOverlay")),
    placementVisible: Boolean(document.getElementById("placementOverlay")),
    placementState: cloneForTest(state.placementState),
    tutorialStepIndex: state.tutorialStepIndex,
    viewingSharedReport: isViewingSharedReport(),
    viewingSharedRecap: isViewingSharedRecap(),
    recapViewData: cloneForTest(state.recapViewData),
    reportProfileName: getReportProfile()?.user?.name || null,
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
    id: overrides.id ?? state.nextDropId++,
    x: overrides.x ?? state.canvasW / 2,
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

  if (opKey === "reduce") {
    drop.reduceOriginalNum = overrides.reduceOriginalNum ?? 12;
    drop.reduceOriginalDen = overrides.reduceOriginalDen ?? 18;
    drop.reduceNum = overrides.reduceNum ?? drop.reduceOriginalNum;
    drop.reduceDen = overrides.reduceDen ?? drop.reduceOriginalDen;
    drop.reduceCase = overrides.reduceCase ?? "repeated";
    drop.reduceBand = overrides.reduceBand ?? "small";
    drop.reducePreviewFactor = overrides.reducePreviewFactor ?? null;
    drop.reduceInvalidReason = overrides.reduceInvalidReason ?? "";
    drop.reduceComplete = overrides.reduceComplete ?? isReducedFraction(drop.reduceNum, drop.reduceDen);
    drop.text = overrides.text ?? formatFractionText(drop.reduceNum, drop.reduceDen);
    const reduced = reduceFraction(drop.reduceOriginalNum, drop.reduceOriginalDen);
    drop.answerText = overrides.answerText ?? formatFractionText(reduced.num, reduced.den);
    drop.answer = drop.answerText;
    drop.statsKey = overrides.statsKey ?? `red:${drop.reduceBand}:${drop.reduceCase}`;
  }

  return drop;
}

function installTestHooks() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("test")) return;

  // Under ES modules the core/progress APIs are no longer global; re-expose them
  // for browser-side test instrumentation (e.g. e2e reads window.RainMathProgress).
  window.RainMathCore = RainMathCore;
  window.RainMathProgress = RainMathProgress;

  window.__RAIN_MATH_TEST__ = {
    reset({ clearStats = true } = {}) {
      clearAmbiguousTimer();
      resetSettingsForTest();
      if (clearStats) {
        resetProblemStats(problemStats);
        state.progressProfile = resetStoredProfile();
      }
      state.drops = [];
      resetSplashes();
      resetLaser();
      resetPlayerShipVisuals();
      state.bossMode = null;
      state.isBreatherMode = false;
      state.score = 0;
      state.spawnTimer = 0;
      state.lastTime = 0;
      state.gameTime = 0;
      state.groundFlash = 0;
      state.currentInput = "";
      resetCannonOverload({ clearCooldown: true });
      state.factorTargetId = null;
      state.reportViewProfile = null;
      state.reportViewReports = null;
      state.recapViewData = null;
      answerInput.value = "";
      state.isPaused = false;
      closeWelcomeMenu({ focus: false });
      closeTutorialOverlay({ focus: false });
      closePlacementOverlay({ focus: false });
      closeShareBadgePopup();
      setPracticeControls({ speed: 30, drops: 3 }, { persist: false });
      setTextSize("normal", { persist: false });
      updateOpChits();
      updateDifficultyDisplays();
      updateControlDisplay();
      updateScoreDisplay();
      updateLoginLink();
      updateBossHud();
      updateBreatherHud();
      state.hasStarted = true;
      state.isPaused = false;
      updatePauseControlLabels();
      startVisitSession({ forceNew: true });
      drawDrops();
      return getTestState();
    },
    stageReadyRun() {
      // Force the real-user "ready/Start" gate (tests otherwise auto-start).
      state.hasStarted = false;
      state.isPaused = true;
      state.drops = [];
      updatePauseControlLabels();
      drawDrops();
      return getTestState();
    },
    backdateActiveSession(msAgo = SESSION_RESUME_GRACE_MS + 1000, { deactivate = false } = {}) {
      const session = state.progressProfile.sessionLog?.find((item) => item.id === state.activeSessionId);
      if (session) {
        const at = new Date(Date.now() - Math.max(0, Number(msAgo) || 0)).toISOString();
        session.lastSeenAt = at;
        session.endedAt = at;
        saveProfile(state.progressProfile);
        if (deactivate) state.activeSessionId = null;
      }
      return getTestState();
    },
    finishSession() {
      finishCurrentSession();
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
    showPlacement() {
      showPlacementOverlay();
      return getTestState();
    },
    startPlacement(opKey, level = 1) {
      startPlacementForOp(opKey, level);
      return getTestState();
    },
    answerPlacement(value) {
      submitPlacementAnswer(value);
      return getTestState();
    },
    acceptPlacement(level) {
      acceptPlacementLevel(level);
      return getTestState();
    },
    recordSessionChallenge(event) {
      recordActiveSessionChallenge(event);
      return getTestState();
    },
    recordChallengeAttempt(opKey, options = {}) {
      state.progressProfile = recordChallengeAttempt(state.progressProfile, opKey, options);
      saveProfile(state.progressProfile);
      return getTestState();
    },
    recordBlitzAttempt(opKey, options = {}) {
      state.progressProfile = recordBlitzAttempt(state.progressProfile, opKey, options);
      saveProfile(state.progressProfile);
      return getTestState();
    },
    recordBossClear(opKey, options = {}) {
      state.progressProfile = recordBossAttempt(state.progressProfile, opKey, options);
      saveProfile(state.progressProfile);
      return getTestState();
    },
    getShareReportCode(sessionId = null) {
      return getShareReportCode(state.progressProfile, sessionId); // async — resolved by page.evaluate
    },
    getTamperedReportCode(sessionId = null) {
      // Edit the decoded content but leave the disguised checksum stale, as a
      // tamperer who edits the JSON and re-encodes would.
      const payload = buildSharedReportPayload(state.progressProfile, sessionId);
      if (payload.v === 2) payload.n = "TAMPERED";
      else payload.name = "TAMPERED";
      return encodeSharePayload(payload); // async
    },
    getRecapCode(opKey, level = null) {
      const data = getShareBadgeData(opKey, level || opConfig[opKey]?.difficulty || 1);
      return data ? getRecapShareCode(data) : ""; // async
    },
    async getTamperedRecapCode(opKey, level = null) {
      const data = getShareBadgeData(opKey, level || opConfig[opKey]?.difficulty || 1);
      if (!data) return "";
      const payload = buildRecapPayload(data);
      payload.level = Math.min(10, (payload.level || 1) + 1);
      return encodeSharePayload(payload);
    },
    getBackupCode() {
      saveProfile(state.progressProfile);
      return getProfileBackupCode(state.progressProfile); // async
    },
    async getTamperedBackupCode() {
      const payload = buildProfileBackupPayload(state.progressProfile);
      payload.profile.user.name = "TAMPERED";
      return `${BACKUP_CODE_PREFIX}${await encodeSharePayload(payload)}`;
    },
    async getNewerBackupCode() {
      const payload = buildProfileBackupPayload(state.progressProfile);
      payload.app = PROFILE_VERSION + 1;
      payload.id = makeShareId(payload);
      return `${BACKUP_CODE_PREFIX}${await encodeSharePayload(payload)}`;
    },
    restoreBackup(code, options = {}) {
      return restoreProfileBackupCode(code, {
        confirmReplace: options.confirmReplace ?? false,
      }); // async
    },
    deletePlayer(userId) {
      saveProfile(state.progressProfile);
      const active = deleteStoredProfile(userId);
      activateProfile(active);
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
      const skill = state.progressProfile.skills?.[opKey];
      if (!skill) return getTestState();
      const problems = getSkillUniverseProblems(opKey, opConfig[opKey].difficulty);
      for (const problem of problems) {
        for (let i = 0; i < attempts; i += 1) {
          state.progressProfile = recordProgressEvent(state.progressProfile, {
            opKey,
            statsKey: problem.statsKey,
            text: problem.text,
            outcome: "correct",
            responseMs,
          });
        }
      }
      resetProblemStats(problemStats);
      mirrorLegacyProblemStats(state.progressProfile, problemStats);
      saveProfile(state.progressProfile);
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
      updateCannonOverload(Math.max(0, Number(ms) || 0));
      if (state.bossMode?.active) {
        updateBossMode(Math.max(0, Number(ms) || 0));
      }
      drawDrops();
      return getTestState();
    },
    advanceDrops(ms = 16) {
      const dt = Math.max(0, Number(ms) || 0);
      updateCannonOverload(dt);
      if (isPlacementActive()) {
        updatePlacementMode(dt);
      }
      updateDrops(dt);
      drawDrops();
      return getTestState();
    },
    skipToBossFight() {
      if (state.bossMode?.active) {
        startBossFight();
        updateBossPartPositions();
      }
      drawDrops();
      return getTestState();
    },
    forceBossVictory() {
      if (state.bossMode?.active) {
        const core = state.bossMode.parts.find((part) => part.id === "core");
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
      if (state.bossMode?.active) {
        applyBossStun();
      }
      drawDrops();
      return getTestState();
    },
    setControls({ speed, drops, pressure, pressureTier, textSize: nextTextSize } = {}) {
      if (pressure !== undefined || pressureTier !== undefined) {
        const tier = getPressureTier(pressure ?? pressureTier);
        setPracticeControls({ speed: tier.speed, drops: tier.rate });
      } else {
        setPracticeControls({ speed, drops });
      }
      if (nextTextSize !== undefined) setTextSize(nextTextSize);
      updateControlDisplay();
      return getTestState();
    },
    addDrop(overrides) {
      const drop = makeTestDrop(overrides);
      state.drops.push(drop);
      drawDrops();
      return cloneForTest(drop);
    },
    clearDrops() {
      state.drops = [];
      state.factorTargetId = null;
      drawDrops();
      return getTestState();
    },
    seedStats(opKey, stats) {
      problemStats[opKey] = cloneForTest(stats);
      return getTestState();
    },
    getDropVisual(id) {
      const drop = state.drops.find((candidate) => candidate.id === id);
      return drop ? cloneForTest(getDropAccuracyVisual(drop)) : null;
    },
    submit(value, { enter = false } = {}) {
      if (isCannonOverloaded()) {
        clearCurrentAnswerInput();
        drawDrops();
        return getTestState();
      }
      answerInput.value = String(value);
      state.currentInput = answerInput.value;
      if (enter) {
        const target = isInFactorTargetMode() ? getTargetedFactorDrop() : null;
        if (target && isReduceProblem(target)) {
          commitTargetedReduceAnswer(target, state.currentInput.trim());
        } else if (target && target.factorComplete) {
          handleCorrectAnswer(target);
        } else {
          if (target) state.factorTargetId = null;
          const match = findDropMatch(state.currentInput, { enterPressed: true });
          if (match) {
            handleCorrectAnswer(match);
          } else {
            handleWrongInput({ targets: getWrongSubmissionTargets() });
          }
        }
      } else {
        processInput(state.currentInput);
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

  // Real users land at the ready/Start gate (frozen until Start / welcome Play);
  // tests auto-play so the suite behaves as before.
  state.hasStarted = IS_TEST_MODE;
  state.isPaused = !state.hasStarted;
  updatePauseControlLabels();

  setupTouchKeypad();
  updateStaticText();
  updateLoginLink();
  installTestHooks();
  window.__RAIN_MATH_READY__ = true;
  const sharedCode = getReportHashCode();
  const sharedRecapCode = getRecapHashCode();
  if (sharedCode) {
    // Parent opened a shared report link — decode (async) and open the read-only
    // view, skipping the welcome menu (or show an error if the link is broken).
    openSharedReportFromCode(sharedCode);
  } else if (sharedRecapCode) {
    openSharedRecapFromCode(sharedRecapCode);
  } else if (shouldShowWelcomeOnLoad()) {
    buildWelcomeMenu({ firstVisit: true });
  } else {
    answerInput.focus();
  }
  requestAnimationFrame(tick);
}

init();
