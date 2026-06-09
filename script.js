const {
  advanceFactorDrop: advanceFactorDropCore,
  clamp,
  createDefaultOpConfig,
  createProblemStats,
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

// ============================================================
// 1. Constants and State
// ============================================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const answerInput = document.getElementById("answer");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const speedSlider = document.getElementById("speedSlider");
const speedValueEl = document.getElementById("speedValue");
const rateSlider = document.getElementById("rateSlider");
const rateValueEl = document.getElementById("rateValue");
const paceSlider = document.getElementById("paceSlider");
const paceValueEl = document.getElementById("paceValue");
const pauseOverlayEl = document.getElementById("pauseOverlay");

const opConfig = createDefaultOpConfig();

let drops = [];
let splashes = [];
let score = 0;
let gameSpeed = 30;
let spawnTimer = 0;
let lastTime = 0;
let isPaused = false;
let audioCtx = null;
let nextDropId = 0;
let canvasW = 0;
let canvasH = 0;
let groundFlash = 0;
let currentInput = "";
let gameTime = 0;
let laser = null;
let ambiguousTimer = null;
const AMBIGUOUS_DELAY_MS = 400;
let factorTargetId = null; // id of the targeted factor drop, or null

// Problem stats: tracks every problem ever seen.
// For add/sub/mul/div: keyed by "a,b" (for div: "quotient,divisor").
// For f10: keyed by problem text.
// Each entry: { asked: number, correct: number }
const problemStats = createProblemStats();

function recordProblemResult(drop, correct) {
  recordProblemResultCore(problemStats, drop, correct);
}
let spawnRate = 3;
let pace = 5;

// ============================================================
// 2. Utility Functions
// ============================================================

// ============================================================
// 3. Speed Control
// ============================================================

function setSpeed(value) {
  gameSpeed = clamp(0, 100, Math.round(value));
  if (speedSlider) speedSlider.value = gameSpeed;
  if (speedValueEl) speedValueEl.textContent = gameSpeed + "%";
}

function setRate(value) {
  spawnRate = clamp(0, 10, Math.round(value));
  if (rateSlider) rateSlider.value = spawnRate;
  if (rateValueEl) rateValueEl.textContent = spawnRate;
}

function setPace(value) {
  pace = clamp(1, 10, Math.round(value));
  if (paceSlider) paceSlider.value = pace;
  if (paceValueEl) paceValueEl.textContent = getMaxFallTime() + "s";
}

// Drop fall time model:
//   Pace slider 1-10 controls the max fall time (slowest drop).
//   Pace 1 (bottom) => max 15s (easy). Pace 10 (top) => max 3s (hard).
//   Each drop gets a random fall time between 3s and maxFallTime.
//   baseSpeed (px/sec) = canvasH / fallTime.
//   gameSpeed (0-100%) is then applied as a multiplier on top.
function getMaxFallTime() {
  // pace 1 => 15s, pace 10 => 3s
  const t = (pace - 1) / 9;
  return Math.round(lerp(15, 3, t));
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

function getSpawnInterval() {
  if (spawnRate === 0) return Infinity;
  // rate 1 => ~4000ms, rate 5 => ~1000ms, rate 10 => ~350ms
  const t = (spawnRate - 1) / 9; // 0..1
  return lerp(4000, 350, t);
}

function getMaxDrops() {
  // Scale max active drops with rate: rate 1 => 4, rate 10 => 16
  return Math.round(lerp(4, 16, (spawnRate - 1) / 9));
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

function toggleOp(opKey) {
  if (!opConfig[opKey]) return;
  // All ops can be toggled off — no drops spawn when none are enabled
  opConfig[opKey].enabled = !opConfig[opKey].enabled;
  updateOpChits();
}

function setDifficulty(opKey, level) {
  if (!opConfig[opKey]) return;
  opConfig[opKey].difficulty = clamp(1, 10, level);
  updateDifficultyDisplays();
}

// ============================================================
// 6. Problem Generation
// ============================================================

function generateWeightedProblem(opKey) {
  return generateCoreWeightedProblem(opKey, opConfig, problemStats);
}

function pickRandomEnabledOp() {
  const enabled = getEnabledOps();
  if (enabled.length === 0) return null;
  return enabled[Math.floor(Math.random() * enabled.length)];
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
  if (gameSpeed === 0) return;

  const mult = getSpeedMultiplier();
  for (const drop of drops) {
    drop.y += (drop.baseSpeed * mult * dt) / 1000;
  }

  const bottom = canvasH - 30;
  const survived = [];
  let missCount = 0;

  for (const drop of drops) {
    if (drop.y >= bottom) {
      recordProblemResult(drop, false);
      if (factorTargetId === drop.id) factorTargetId = null;
      missCount += 1;
    } else {
      survived.push(drop);
    }
  }

  if (missCount > 0) {
    groundFlash = 300;
    playMiss();
  }

  drops = survived;
}

function drawDrops() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Ground flash on miss
  if (groundFlash > 0) {
    const alpha = Math.min(1, groundFlash / 300) * 0.35;
    ctx.fillStyle = `rgba(248, 113, 113, ${alpha.toFixed(2)})`;
    ctx.fillRect(0, canvasH - 36, canvasW, 36);
  }

  drawSplashes();

  const inputNum = currentInput !== "" ? Number(currentInput) : NaN;
  const hasNumMatch = !Number.isNaN(inputNum);

  for (const drop of drops) {
    const dropTop = drop.y - 26;
    const dropBottom = drop.y + 22;
    const dropRadius = 22;
    const isFactor = drop.opKey === "factor";
    const factorComplete = isFactor && drop.factorComplete;
    const isTargeted = isFactor && factorTargetId === drop.id;
    const isHighlighted = !drop.revealed && !isFactor && (drop.opKey === "si"
      ? currentInput === drop.answerText
      : hasNumMatch && drop.answer === inputNum);

    let fillColor, strokeColor;
    if (drop.revealed) {
      fillColor = "rgba(148, 163, 184, 0.35)";
      strokeColor = "rgba(148, 163, 184, 0.25)";
    } else if (isFactor && factorComplete) {
      fillColor = "rgba(52, 211, 153, 0.88)";
      strokeColor = "rgba(110, 231, 183, 0.9)";
    } else if (isFactor) {
      fillColor = "rgba(192, 160, 255, 0.88)";
      strokeColor = "rgba(216, 200, 255, 0.9)";
    } else {
      fillColor = "rgba(125, 211, 252, 0.92)";
      strokeColor = "rgba(186, 230, 253, 0.9)";
    }

    if (isHighlighted || isTargeted) {
      ctx.shadowColor = isFactor ? "rgba(192, 160, 255, 0.9)" : "rgba(125, 211, 252, 0.8)";
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
  }

  drawLaser();
  drawGun();
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
// 8b. Laser and Gun
// ============================================================

function fireLaser(target) {
  const gunY = canvasH - 20;
  const gunX = canvasW / 2;
  laser = {
    x1: gunX,
    y1: gunY - 10,
    x2: target.x,
    y2: target.y,
    life: 140,
    maxLife: 140,
  };
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

function drawGun() {
  const gunY = canvasH - 20;
  const gunX = canvasW / 2;
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(gunX - 22, gunY - 10, 44, 16, 5);
  } else {
    ctx.rect(gunX - 22, gunY - 10, 44, 16);
  }
  ctx.fill();
  ctx.fillStyle = "#475569";
  ctx.fillRect(gunX - 3, gunY - 20, 6, 12);
}

// ============================================================
// 9. Input Handling
// ============================================================

function isDropVisible(drop) {
  return drop.y > 0;
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
  drop.revealed = true;
}

function findDropMatch(value, { enterPressed = false } = {}) {
  const normalizedTyped = normalizeTypedValue(value, {
    allowIncomplete: false,
  });
  const numericValue = Number(value);
  const hasNumeric = !Number.isNaN(numericValue);

  for (const drop of drops) {
    if (!isDropVisible(drop)) continue;
    if (drop.revealed) continue;
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
  const hasFactorDrops = drops.some((d) => d.opKey === "factor" && isDropVisible(d) && !d.revealed);
  if (hasFactorDrops && /^\d+$/.test(inputValue)) return true;
  const typed = normalizeTypedValue(inputValue, { allowIncomplete: true });
  if (!typed) return true;
  const visible = drops.filter((d) => isDropVisible(d) && !d.revealed && d.opKey !== "si" && d.opKey !== "factor");
  return visible.some((drop) => {
    const text = drop.answerText || String(drop.answer);
    const normalizedAnswer = normalizeTypedValue(text, {
      allowIncomplete: false,
    });
    return normalizedAnswer.startsWith(typed);
  });
}

function updateScoreDisplay() {
  scoreEl.textContent = score;
  const ts = document.getElementById("touchScore");
  if (ts) ts.textContent = score;
}

function handleCorrectAnswer(match) {
  clearAmbiguousTimer();
  if (factorTargetId === match.id) factorTargetId = null;
  recordProblemResult(match, true);
  score += 1;
  updateScoreDisplay();
  drops = drops.filter((d) => d.id !== match.id);
  createSplash(match);
  fireLaser(match);
  playPop();
  answerInput.value = "";
  currentInput = "";
  updateKpDisplay();
}

function handleWrongInput() {
  if (isPaused) return;
  clearAmbiguousTimer();
  // Ding every visible non-revealed problem as incorrect
  for (const drop of drops) {
    if (isDropVisible(drop) && !drop.revealed) {
      recordProblemResult(drop, false);
    }
  }
  playWrongInput();
  answerInput.value = "";
  currentInput = "";
  updateKpDisplay();
}

function hasLongerMatch(value) {
  // Check if the typed value is a prefix of a DIFFERENT visible drop's answer
  const typed = normalizeTypedValue(value, { allowIncomplete: true });
  if (!typed) return false;
  const visible = drops.filter(isDropVisible);
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
  if (isPaused) return;
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
    const typedNum = Number(value);
    const isValidDivisor = !Number.isNaN(typedNum) && Number.isInteger(typedNum) && typedNum >= 2;
    if (isValidDivisor && target.factorRemaining % typedNum === 0) {
      advanceFactorDrop(target, typedNum, { fromTargeting: true });
      answerInput.value = "";
      currentInput = "";
    } else if (isValidDivisor && target.factorRemaining % typedNum !== 0) {
      // Valid number but doesn't divide remaining
      handleWrongInput();
    } else if (!couldMatchTargetedFactor(value)) {
      handleWrongInput();
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
  const drop = drops.find((d) => d.id === factorTargetId);
  // If the targeted drop is gone (cleared or fell), exit targeting
  if (!drop || drop.revealed) {
    factorTargetId = null;
    return null;
  }
  return drop;
}

function getVisibleFactorDrops() {
  return drops.filter((d) => d.opKey === "factor" && isDropVisible(d) && !d.revealed);
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

function tick(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (!isPaused) {
    gameTime += dt;

    // Spawn drops
    if (spawnRate > 0) {
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

    updateDrops(dt);
    updateSplashes(dt);
    updateLaser(dt);
    if (groundFlash > 0) groundFlash = Math.max(0, groundFlash - dt);
    drawDrops();
  }

  requestAnimationFrame(tick);
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
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvasW = rect.width;
  canvasH = rect.height;
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
  rect: "\u25ad",
  circ: "\u25cb",
  factor: "p\u00b7q",
};

const opDisplayNames = {
  add: "Add",
  sub: "Subtract",
  mul: "Multiply",
  div: "Divide",
  f10: "Factors of 10",
  si: "SI Conversions",
  rect: "Rectangle P & A",
  circ: "Circle C & A",
  factor: "Prime Factors",
};

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
    el.textContent = "Select a problem type to begin.";
    return;
  }
  const hints = [];
  const hasBasic = enabled.some((op) => ["add", "sub", "mul", "div", "f10"].includes(op));
  const hasSI = enabled.includes("si");
  const hasRect = enabled.includes("rect");
  const hasCirc = enabled.includes("circ");
  const hasFactor = enabled.includes("factor");
  if (hasBasic || hasRect) hints.push("Type answer to clear");
  if (hasCirc) hints.push("○: type π coefficient");
  if (hasSI) hints.push("SI: type *1000 or /100 + Enter");
  if (hasFactor) hints.push("p·q: type 2^2*3 + Enter, or Tab to factor");
  const text = hints.join(" · ");
  el.textContent = text;
  if (kpHint) kpHint.textContent = text;
}

function buildDiffCards() {
  const container = document.getElementById("diffCards");
  if (!container) return;
  container.innerHTML = "";
  const enabled = getEnabledOps();
  enabled.forEach((opKey) => {
    const config = opConfig[opKey];
    const range = getDifficultyRange(opKey, config.difficulty);

    const card = document.createElement("div");
    card.className = "diff-card";
    card.tabIndex = 0;
    card.dataset.op = opKey;
    card.setAttribute("role", "spinbutton");
    card.setAttribute("aria-label", `${opDisplayNames[opKey]} difficulty`);
    card.setAttribute("aria-valuenow", config.difficulty);
    card.setAttribute("aria-valuemin", 1);
    card.setAttribute("aria-valuemax", 10);

    const label = document.createElement("div");
    label.className = "diff-card-label";
    label.textContent = opDisplayLabels[opKey] || opKey;

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
      }
    });

    controls.appendChild(downBtn);
    controls.appendChild(val);
    controls.appendChild(upBtn);

    const rangeText = document.createElement("div");
    rangeText.className = "diff-range";
    rangeText.textContent = `${range.min}\u2013${range.max}`;

    card.addEventListener("click", () => {
      showStatsPopup(opKey);
    });

    card.appendChild(label);
    card.appendChild(controls);
    card.appendChild(rangeText);
    container.appendChild(card);
  });
}

// ============================================================
// 13b. Stats Popup
// ============================================================

function getAccuracyRGB(asked, correct) {
  if (asked === 0) return null; // never asked
  const pct = correct / asked;
  if (pct >= 0.95) return [34, 197, 94];   // bright green
  if (pct >= 0.85) return [74, 222, 128];   // green
  if (pct >= 0.75) return [134, 239, 172];  // light green
  if (pct >= 0.65) return [251, 191, 36];   // yellow
  if (pct >= 0.50) return [249, 115, 22];   // orange
  return [239, 68, 68];                      // red
}

function getConfidenceAlpha(asked) {
  if (asked === 0) return 0;
  // 1 attempt => 0.2, 10+ => 1.0
  return clamp(0.2, 1, 0.2 + (Math.min(asked, 10) - 1) * (0.8 / 9));
}

function getAccuracyColor(asked, correct) {
  const rgb = getAccuracyRGB(asked, correct);
  if (!rgb) return "#1a1a2e"; // never asked — dark
  const alpha = getConfidenceAlpha(asked);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(2)})`;
}

function getAccuracyText(asked, correct) {
  if (asked === 0) return "—";
  return `${Math.round((correct / asked) * 100)}% (${correct}/${asked})`;
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

  if (opKey === "si") {
    card.appendChild(buildSIReferenceTable());
    card.appendChild(buildListStats(opKey, stats));
  } else if (opKey === "f10" || opKey === "factor") {
    card.appendChild(buildListStats(opKey, stats));
  } else if (opKey === "rect") {
    card.appendChild(buildRectStats(stats));
  } else if (opKey === "circ") {
    card.appendChild(buildCircStats(stats));
  } else {
    card.appendChild(buildGridStats(opKey, stats));
  }

  // Legend
  const legend = document.createElement("div");
  legend.className = "stats-legend";
  const items = [
    ["#1a1a2e", "Never asked"],
    ["#ef4444", "<50%"],
    ["#f97316", "50–64%"],
    ["#fbbf24", "65–74%"],
    ["#86efac", "75–84%"],
    ["#4ade80", "85–94%"],
    ["#22c55e", "95–100%"],
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
      td.className = "stats-cell" + (inRange ? "" : " stats-cell-outside");
      td.style.background = getAccuracyColor(asked, correct);
      td.title = `${a} ${operators[opKey]?.symbol || ""} ${b} = ${
        opKey === "div" ? a : operators[opKey].fn(a, b)
      }\n${getAccuracyText(asked, correct)}`;

      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  const wrap = document.createElement("div");
  wrap.className = "stats-grid-wrap";
  wrap.appendChild(table);
  return wrap;
}

function getMaxStatOperand(opKey, stats, cap) {
  let max = 0;
  for (const key of Object.keys(stats)) {
    const parts = key.split(",");
    if (parts.length === 2) {
      max = Math.max(max, Number(parts[0]), Number(parts[1]));
    }
  }
  return Math.min(max, cap);
}

function buildRectStats(stats) {
  const gridMax = 20; // full range for rect
  const currentRange = getDifficultyRange("rect", opConfig.rect.difficulty);
  const wrap = document.createElement("div");
  wrap.className = "stats-grid-wrap";

  for (const prefix of ["P", "A"]) {
    const label = document.createElement("h3");
    label.textContent = prefix === "P" ? "Perimeter" : "Area";
    label.style.margin = "12px 0 6px";
    label.style.fontSize = "0.9rem";
    wrap.appendChild(label);

    const table = document.createElement("table");
    table.className = "stats-grid";

    const thead = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = prefix === "P" ? "P" : "A";
    thead.appendChild(corner);
    for (let b = 1; b <= gridMax; b++) {
      const th = document.createElement("th");
      th.textContent = b;
      thead.appendChild(th);
    }
    table.appendChild(thead);

    for (let a = 1; a <= gridMax; a++) {
      const tr = document.createElement("tr");
      const rh = document.createElement("th");
      rh.textContent = a;
      tr.appendChild(rh);
      for (let b = 1; b <= gridMax; b++) {
        const td = document.createElement("td");
        const key = `${prefix},${a},${b}`;
        const entry = stats[key];
        const asked = entry ? entry.asked : 0;
        const correct = entry ? entry.correct : 0;
        const inRange = a <= currentRange.max && b <= currentRange.max;
        td.className = "stats-cell" + (inRange ? "" : " stats-cell-outside");
        td.style.background = getAccuracyColor(asked, correct);
        const ans = prefix === "P" ? 2 * (a + b) : a * b;
        td.title = `${prefix}▭ ${a}×${b} = ${ans}\n${getAccuracyText(asked, correct)}`;
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    wrap.appendChild(table);
  }
  return wrap;
}

function buildCircStats(stats) {
  const gridMax = 12; // full range for circ
  const currentRange = getDifficultyRange("circ", opConfig.circ.difficulty);
  const wrap = document.createElement("div");
  wrap.className = "stats-grid-wrap";

  const table = document.createElement("table");
  table.className = "stats-grid";

  // Header row: values 1..gridMax
  const thead = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = "";
  thead.appendChild(corner);
  for (let v = 1; v <= gridMax; v++) {
    const th = document.createElement("th");
    th.textContent = v;
    thead.appendChild(th);
  }
  table.appendChild(thead);

  const rows = [
    { key: "Cr", label: "C (r)", desc: (v) => `C○ r=${v} = ${2 * v}π` },
    { key: "Cd", label: "C (d)", desc: (v) => `C○ d=${v} = ${v}π` },
    { key: "Ar", label: "A (r)", desc: (v) => `A○ r=${v} = ${v * v}π` },
    { key: "Ad", label: "A (d)", desc: (v) => { const r = v / 2; return `A○ d=${v} = ${r * r}π`; } },
  ];

  for (const row of rows) {
    const tr = document.createElement("tr");
    const rh = document.createElement("th");
    rh.textContent = row.label;
    rh.style.textAlign = "left";
    rh.style.whiteSpace = "nowrap";
    tr.appendChild(rh);
    for (let v = 1; v <= gridMax; v++) {
      const td = document.createElement("td");
      const statsKey = `${row.key},${v}`;
      const entry = stats[statsKey];
      const asked = entry ? entry.asked : 0;
      const correct = entry ? entry.correct : 0;
      const inRange = v <= currentRange.max;
      td.className = "stats-cell" + (inRange ? "" : " stats-cell-outside");
      td.style.background = getAccuracyColor(asked, correct);
      td.title = `${row.desc(v)}\n${getAccuracyText(asked, correct)}`;
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

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
    row.style.borderLeft = `4px solid ${getAccuracyColor(entry.asked, entry.correct)}`;

    const problem = document.createElement("span");
    problem.className = "stats-f10-text";
    problem.textContent = opKey === "si" ? formatSIStatsKey(text) : text;

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

function updateSpeedDisplay() {
  if (speedSlider) speedSlider.value = gameSpeed;
  if (speedValueEl) speedValueEl.textContent = gameSpeed + "%";
  if (rateSlider) rateSlider.value = spawnRate;
  if (rateValueEl) rateValueEl.textContent = spawnRate;
  if (paceSlider) paceSlider.value = pace;
  if (paceValueEl) paceValueEl.textContent = getMaxFallTime() + "s";
}

function togglePause() {
  isPaused = !isPaused;
  if (pauseBtn) {
    pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  }
  if (pauseOverlayEl) {
    pauseOverlayEl.classList.toggle("hidden", !isPaused);
  }
  if (!isPaused) {
    lastTime = 0;
    answerInput.focus();
  }
}

function restartGame() {
  clearAmbiguousTimer();
  factorTargetId = null;
  drops = [];
  splashes = [];
  laser = null;
  score = 0;
  spawnTimer = 0;
  lastTime = 0;
  gameTime = 0;
  groundFlash = 0;
  currentInput = "";
  answerInput.value = "";
  updateScoreDisplay();
  if (isPaused) {
    togglePause();
  }
  answerInput.focus();
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
});

// Input keydown for Enter, Backspace, and space prevention
answerInput.addEventListener("keydown", (event) => {
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
    if (isPaused) return;

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
      handleWrongInput();
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

  initAudio();

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
    // Close stats popup first if open
    if (document.getElementById("statsOverlay")) {
      closeStatsPopup();
      event.preventDefault();
      return;
    }
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
    document.activeElement !== answerInput &&
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    event.preventDefault();
    answerInput.focus();
    answerInput.value = currentInput + event.key;
    currentInput = answerInput.value;
    processInput(currentInput);
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

// Speed slider
if (speedSlider) {
  speedSlider.addEventListener("input", () => {
    setSpeed(Number(speedSlider.value));
  });
}

// Rate slider
if (rateSlider) {
  rateSlider.addEventListener("input", () => {
    setRate(Number(rateSlider.value));
  });
}

// Pace slider
if (paceSlider) {
  paceSlider.addEventListener("input", () => {
    setPace(Number(paceSlider.value));
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

// Pause overlay click to resume
if (pauseOverlayEl) {
  pauseOverlayEl.addEventListener("click", () => {
    if (isPaused) togglePause();
  });
}

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
const feedbackLink = document.getElementById("feedbackLink");
const fbCancel = document.getElementById("fbCancel");

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

  // Add logo + score into the controls bar
  const controlsBar = document.querySelector(".controls-bar");
  const opChits = document.querySelector(".op-chits");
  if (controlsBar && opChits) {
    const touchBrand = document.createElement("div");
    touchBrand.className = "touch-brand";
    touchBrand.innerHTML = `<div class="logo">MR</div><div class="touch-score">Score: <span id="touchScore">0</span></div><a href="#" class="touch-fb" id="touchFbLink">?</a>`;
    controlsBar.insertBefore(touchBrand, opChits);
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

  // Wire inline slider +/- buttons
  function syncKpSliderDisplays() {
    const sv = document.getElementById("kpSpeedVal");
    const rv = document.getElementById("kpRateVal");
    const pv = document.getElementById("kpPaceVal");
    if (sv) sv.textContent = gameSpeed + "%";
    if (rv) rv.textContent = spawnRate;
    if (pv) pv.textContent = getMaxFallTime() + "s";
  }
  wireKpButton(document.getElementById("kpSpeedDn"), () => {
    setSpeed(gameSpeed - 10);
    syncKpSliderDisplays();
  });
  wireKpButton(document.getElementById("kpSpeedUp"), () => {
    setSpeed(gameSpeed + 10);
    syncKpSliderDisplays();
  });
  wireKpButton(document.getElementById("kpRateDn"), () => {
    setRate(spawnRate - 1);
    syncKpSliderDisplays();
  });
  wireKpButton(document.getElementById("kpRateUp"), () => {
    setRate(spawnRate + 1);
    syncKpSliderDisplays();
  });
  wireKpButton(document.getElementById("kpPaceDn"), () => {
    setPace(pace - 1);
    syncKpSliderDisplays();
  });
  wireKpButton(document.getElementById("kpPaceUp"), () => {
    setPace(pace + 1);
    syncKpSliderDisplays();
  });
}

// Build inline diff items in the keypad controls row
function buildKpDiffStrip() {
  const strip = document.getElementById("kpDiffStrip");
  if (!strip) return;
  strip.innerHTML = "";
  const enabled = getEnabledOps();
  enabled.forEach((opKey) => {
    const config = opConfig[opKey];
    const item = document.createElement("div");
    item.className = "kp-diff-item";

    const label = document.createElement("span");
    label.className = "kp-diff-label";
    label.textContent = opDisplayLabels[opKey] || opKey;

    const downBtn = document.createElement("button");
    downBtn.className = "kp-diff-btn";
    downBtn.textContent = "\u2212";
    wireKpButton(downBtn, () => setDifficulty(opKey, opConfig[opKey].difficulty - 1));

    const val = document.createElement("span");
    val.className = "kp-diff-val";
    val.textContent = config.difficulty;

    const upBtn = document.createElement("button");
    upBtn.className = "kp-diff-btn";
    upBtn.textContent = "+";
    wireKpButton(upBtn, () => setDifficulty(opKey, opConfig[opKey].difficulty + 1));

    item.appendChild(label);
    item.appendChild(downBtn);
    item.appendChild(val);
    item.appendChild(upBtn);

    // Click the item (not buttons) to show stats
    item.addEventListener("click", (e) => {
      if (e.target === downBtn || e.target === upBtn) return;
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
      handleWrongInput();
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
    gameSpeed,
    spawnRate,
    pace,
    isPaused,
    factorTargetId,
    currentInput,
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
  };

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
      if (clearStats) resetProblemStats(problemStats);
      drops = [];
      splashes = [];
      laser = null;
      score = 0;
      spawnTimer = 0;
      lastTime = 0;
      gameTime = 0;
      groundFlash = 0;
      currentInput = "";
      factorTargetId = null;
      answerInput.value = "";
      isPaused = false;
      setSpeed(30);
      setRate(0);
      setPace(5);
      updateOpChits();
      updateDifficultyDisplays();
      updateSpeedDisplay();
      updateScoreDisplay();
      if (pauseBtn) pauseBtn.textContent = "Pause";
      if (pauseOverlayEl) pauseOverlayEl.classList.add("hidden");
      drawDrops();
      return getTestState();
    },
    enableOps(opKeys) {
      Object.keys(opConfig).forEach((key) => {
        opConfig[key].enabled = opKeys.includes(key);
      });
      updateOpChits();
      return getTestState();
    },
    setOpDifficulty(opKey, level) {
      setDifficulty(opKey, level);
      return getTestState();
    },
    setControls({ speed, rate, pace: nextPace } = {}) {
      if (speed !== undefined) setSpeed(speed);
      if (rate !== undefined) setRate(rate);
      if (nextPace !== undefined) setPace(nextPace);
      updateSpeedDisplay();
      return getTestState();
    },
    addDrop(overrides) {
      const drop = makeTestDrop(overrides);
      drops.push(drop);
      drawDrops();
      return cloneForTest(drop);
    },
    seedStats(opKey, stats) {
      problemStats[opKey] = cloneForTest(stats);
      return getTestState();
    },
    submit(value, { enter = false } = {}) {
      answerInput.value = String(value);
      currentInput = answerInput.value;
      if (enter) {
        const match = findDropMatch(currentInput, { enterPressed: true });
        if (match) {
          handleCorrectAnswer(match);
        } else {
          handleWrongInput();
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
  updateSpeedDisplay();
  updateScoreDisplay();
  answerInput.tabIndex = -1;

  if (pauseOverlayEl) {
    pauseOverlayEl.classList.add("hidden");
  }
  if (pauseBtn) {
    pauseBtn.textContent = "Pause";
  }

  setupTouchKeypad();
  installTestHooks();
  window.__RAIN_MATH_READY__ = true;
  answerInput.focus();
  requestAnimationFrame(tick);
}

init();
