const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const eloEl = document.getElementById("elo");
const eloBoardEl = document.getElementById("eloBoard");
const answerInput = document.getElementById("answer");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const setupOverlay = document.getElementById("setup");
const startBtn = document.getElementById("startBtn");
const versionEl = document.getElementById("version");

const levelButtons = document.querySelectorAll("#levelSelect button");
const eloButtons = document.querySelectorAll("#eloSelect button");

const GAME_HEIGHT = 520;
const GAME_WIDTH = 900;
const VERSION = "2026-02-03.4";

let drops = [];
let score = 0;
let elo = 800;
let baseSpawnMs = 1400;
let baseSpeed = 40;
let spawnTimer = 0;
let lastTime = 0;
let isPaused = true;
let settings = null;
let audioCtx = null;
let bossMusicTimer = null;
let splashes = [];
let laser = null;

const ELO_MIN = 400;
const ELO_MAX = 2000;
const SPEED_GAIN = 12;
const SPEED_LOSS = 16;
const ACCURACY_SMOOTH = 12;
const LEVEL_STEP = 18;
const BOSS_MULTIPLIER = 2;
const BOSS_CLEAR_TARGET = 8;
const PRE_BOSS_BREAK_MS = 1800;
const RANGE_MIN_START = 4;
const RANGE_MAX = 12;

const opLabels = {
  add: "Add",
  sub: "Sub",
  mul: "Mul",
  div: "Div",
};

let opElo = {};
let opState = {};

const operators = {
  add: { symbol: "+", fn: (a, b) => a + b },
  sub: { symbol: "-", fn: (a, b) => a - b },
  mul: { symbol: "×", fn: (a, b) => a * b },
  div: { symbol: "÷", fn: (a, b) => a / b },
};

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function updateStats() {
  scoreEl.textContent = score;
  eloEl.textContent = Math.round(elo);
  if (versionEl) versionEl.textContent = VERSION;
}

function pickSettings() {
  const selectedOps = Array.from(
    document.querySelectorAll('.checks input[type="checkbox"]')
  )
    .filter((box) => box.checked)
    .map((box) => box.value);

  if (selectedOps.length === 0) {
    selectedOps.push("add");
  }

  return {
    ops: selectedOps,
  };
}

function pickActive(buttons) {
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function getActiveValue(buttons, attr) {
  const active = Array.from(buttons).find((btn) => btn.classList.contains("active"));
  return active ? Number(active.dataset[attr]) : 1;
}

function generateProblem(opKey) {
  const { ops } = settings;
  const key = opKey || ops[Math.floor(Math.random() * ops.length)];
  const op = operators[key];
  const maxValue = getRangeMax(key);

  let a = 0;
  let b = 0;
  let answer = 0;

  if (key === "div") {
    const quotient = randInt(1, maxValue);
    b = randInt(1, maxValue);
    a = quotient * b;
    answer = quotient;
  } else if (key === "sub") {
    a = randInt(1, maxValue);
    b = randInt(1, maxValue);
    if (b > a) {
      [a, b] = [b, a];
    }
    answer = op.fn(a, b);
  } else {
    a = randInt(1, maxValue);
    b = randInt(1, maxValue);
    answer = op.fn(a, b);
  }

  return {
    text: `${a} ${op.symbol} ${b}`,
    answer,
    opKey: key,
  };
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createDrop(opKey, isBoss = false) {
  const problem = generateProblem(opKey);
  const rect = canvas.getBoundingClientRect();
  const padding = 36;
  const left = padding;
  const right = Math.max(padding + 20, rect.width - padding);
  const x = randInt(left, right);
  const speed = getSpeedForOp(problem.opKey) * (0.7 + Math.random() * 0.6);

  drops.push({
    id: Date.now() + Math.random(),
    x,
    y: -20,
    speed,
    text: problem.text,
    answer: problem.answer,
    opKey: problem.opKey,
    isBoss,
  });
}

function createSplash(drop) {
  const baseColor = drop.isBoss ? "251, 191, 36" : "125, 211, 252";
  const count = drop.isBoss ? 8 : 6;
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

function updateDrops(dt) {
  for (const drop of drops) {
    drop.y += (drop.speed * dt) / 1000;
  }

  const bottom = canvas.getBoundingClientRect().height - 30;
  const survived = [];

  for (const drop of drops) {
    if (drop.y >= bottom) {
      adjustSpeed(drop.opKey, -SPEED_LOSS);
      recordAccuracy(drop.opKey, false);
    } else {
      survived.push(drop);
    }
  }

  drops = survived;
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

function updateLaser(dt) {
  if (!laser) return;
  laser.life -= dt;
  if (laser.life <= 0) {
    laser = null;
  }
}

function drawDrops() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawSplashes();

  for (const drop of drops) {
    const dropTop = drop.y - 26;
    const dropBottom = drop.y + 22;
    const dropRadius = 22;

    const fillColor = drop.isBoss ? "rgba(251, 191, 36, 0.92)" : "rgba(125, 211, 252, 0.92)";
    const strokeColor = drop.isBoss ? "rgba(253, 230, 138, 0.95)" : "rgba(186, 230, 253, 0.9)";
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
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

    ctx.font = "600 16px Space Grotesk";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(11, 18, 32, 0.75)";
    ctx.fillStyle = "#e2e8f0";
    ctx.strokeText(drop.text, drop.x, drop.y + 2);
    ctx.fillText(drop.text, drop.x, drop.y + 2);
  }

  drawLaser();
  drawGun();
}

function drawSplashes() {
  for (const splash of splashes) {
    const alpha = Math.max(0, splash.life / splash.maxLife);
    ctx.fillStyle = splash.color.replace("{a}", alpha.toFixed(2));
    ctx.beginPath();
    ctx.ellipse(splash.x, splash.y, splash.rx, splash.ry, splash.rotation, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLaser() {
  if (!laser) return;
  const alpha = Math.max(0, laser.life / laser.maxLife);
  ctx.strokeStyle = `rgba(248, 113, 113, ${alpha.toFixed(2)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(laser.x1, laser.y1);
  ctx.lineTo(laser.x2, laser.y2);
  ctx.stroke();
}

function drawGun() {
  const rect = canvas.getBoundingClientRect();
  const gunY = rect.height - 20;
  const gunX = rect.width / 2;
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(gunX - 26, gunY - 12, 52, 18, 6);
  } else {
    ctx.rect(gunX - 26, gunY - 12, 52, 18);
  }
  ctx.fill();
  ctx.fillStyle = "#475569";
  ctx.fillRect(gunX - 4, gunY - 22, 8, 12);
}

function fireLaser(target) {
  const rect = canvas.getBoundingClientRect();
  const gunY = rect.height - 22;
  const gunX = rect.width / 2;
  laser = {
    x1: gunX,
    y1: gunY,
    x2: target.x,
    y2: target.y,
    life: 140,
    maxLife: 140,
  };
}

function updateDifficulty() {
  const avgSpeedElo = getAverageElo("speed");
  const t = (avgSpeedElo - ELO_MIN) / (ELO_MAX - ELO_MIN);
  const clamped = Math.min(1, Math.max(0, t));
  baseSpawnMs = 1700 - clamped * 1200;
  baseSpeed = 30 + clamped * 60;
  const avgAccuracy = getAverageAccuracy();
  elo = calculateOverallRating(avgSpeedElo, avgAccuracy);
}

function checkAnswer(inputValue) {
  if (!inputValue) return;
  const value = Number(inputValue);
  if (Number.isNaN(value)) return;

  const match = drops.find((drop) => drop.answer === value);
  if (!match) return;

  const answerValue = match.answer;
  const cleared = [];
  const remaining = [];

  for (const drop of drops) {
    if (drop.answer === answerValue) {
      cleared.push(drop);
    } else {
      remaining.push(drop);
    }
  }

  drops = remaining;
  score += cleared.length;

  const clearedByOp = {};
  const clearedBossByOp = {};
  for (const drop of cleared) {
    clearedByOp[drop.opKey] = (clearedByOp[drop.opKey] || 0) + 1;
    if (drop.isBoss) {
      clearedBossByOp[drop.opKey] = (clearedBossByOp[drop.opKey] || 0) + 1;
    }
  }

  for (const [opKey, count] of Object.entries(clearedByOp)) {
    const state = opState[opKey];
    if (!state) continue;
    if (state.bossActive) {
      state.bossCleared += clearedBossByOp[opKey] || 0;
    } else {
      const nextGate = Math.floor(state.progress / LEVEL_STEP) * LEVEL_STEP + (LEVEL_STEP - 1);
      const total = state.progress + count;
      state.progress = Math.min(total, nextGate);
      if (total > nextGate) {
        state.pendingProgress = (state.pendingProgress || 0) + (total - nextGate);
      }
    }
  }

  for (const [opKey, count] of Object.entries(clearedByOp)) {
    adjustSpeed(opKey, SPEED_GAIN * count);
    for (let i = 0; i < count; i += 1) {
      recordAccuracy(opKey, true);
    }
  }
  cleared.forEach((drop) => createSplash(drop));
  playPop();
  fireLaser(match);
  answerInput.value = "";
  updateBossState();
  updateEloBoard();
}

function tick(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (!isPaused) {
    updateBossQueues(dt);

    spawnTimer += dt;
    const activeBossOp = getActiveBossOp();
    const bossState = activeBossOp ? opState[activeBossOp] : null;
    const bossLocked = bossState ? bossState.bossSpawnLocked : false;
    const spawnInterval = activeBossOp ? baseSpawnMs / BOSS_MULTIPLIER : baseSpawnMs;
    const maxSpawns = activeBossOp ? 4 : 2;
    let spawns = 0;
    while (spawnTimer >= spawnInterval && spawns < maxSpawns && !(activeBossOp && bossLocked)) {
      const opKey = activeBossOp || pickSpawnOp();
      if (!opKey) {
        spawnTimer = 0;
        break;
      }
      createDrop(opKey, Boolean(activeBossOp));
      spawnTimer -= spawnInterval;
      spawns += 1;
    }
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
    }

    updateDrops(dt);
    updateSplashes(dt);
    updateLaser(dt);
    updateBossState();
    updateDifficulty();
    updateStats();
    drawDrops();

  }

  requestAnimationFrame(tick);
}

function startGame() {
  initAudio();
  settings = pickSettings();
  settings.startLevel = getActiveValue(levelButtons, "level");
  elo = getActiveValue(eloButtons, "elo");
  opElo = {};
  opState = {};
  settings.ops.forEach((op) => {
    opElo[op] = { speed: elo, correct: 0, total: 0 };
    opState[op] = {
      level: settings.startLevel,
      progress: 0,
      pendingProgress: 0,
      bossActive: false,
      bossCleared: 0,
      bossTarget: BOSS_CLEAR_TARGET,
      bossSpawnLocked: false,
      bossQueued: false,
      preBossBreakMs: 0,
    };
  });
  score = 0;
  drops = [];
  splashes = [];
  spawnTimer = 0;
  lastTime = 0;
  baseSpawnMs = 1400;
  baseSpeed = 40;
  stopBossMusic();
  laser = null;
  isPaused = false;
  pauseBtn.textContent = "Pause";
  updateStats();
  updateEloBoard();
  setupOverlay.classList.add("hidden");
  setupOverlay.setAttribute("aria-hidden", "true");
  answerInput.focus();
}

function togglePause() {
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  if (isPaused) {
    stopBossMusic();
  } else if (getActiveBossOp()) {
    startBossMusic();
  }
  if (!isPaused) {
    answerInput.focus();
  }
}

function restartGame() {
  setupOverlay.classList.remove("hidden");
  setupOverlay.setAttribute("aria-hidden", "false");
  stopBossMusic();
}

function adjustSpeed(opKey, delta) {
  if (!opElo[opKey]) return;
  opElo[opKey].speed = clamp(ELO_MIN, ELO_MAX, opElo[opKey].speed + delta);
  updateEloBoard();
}

function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

function getAverageElo(type) {
  const values = Object.values(opElo).map((entry) => entry[type]);
  if (values.length === 0) return 800;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function getAverageAccuracy() {
  const values = Object.values(opElo).map((entry) => getAccuracy(entry));
  if (values.length === 0) return 0.8;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function getAccuracy(entry) {
  const total = entry.total;
  if (!total) return 0.8;
  return entry.correct / total;
}

function recordAccuracy(opKey, isCorrect) {
  const entry = opElo[opKey];
  if (!entry) return;
  entry.total += 1;
  if (isCorrect) entry.correct += 1;
  updateEloBoard();
}

function getSpeedForOp(opKey) {
  const entry = opElo[opKey];
  if (!entry) return baseSpeed;
  const t = (entry.speed - ELO_MIN) / (ELO_MAX - ELO_MIN);
  const clamped = clamp(0, 1, t);
  return 30 + clamped * 70;
}

function getDropRateForOp(opKey) {
  const entry = opElo[opKey];
  if (!entry) return 60000 / baseSpawnMs;
  const t = (entry.speed - ELO_MIN) / (ELO_MAX - ELO_MIN);
  const clamped = clamp(0, 1, t);
  const spawnMs = 1700 - clamped * 1200;
  return 60000 / spawnMs;
}

function getRangeMax(opKey) {
  const entry = opElo[opKey];
  const dynamicRange = getRangeForOp(opKey);
  if (!entry) return dynamicRange;
  const accuracy = getAccuracy(entry);
  const smoothed = clamp(0, 1, (accuracy * ACCURACY_SMOOTH + 0.5) / (ACCURACY_SMOOTH + 1));
  const low = Math.max(2, Math.round(dynamicRange * 0.45));
  const maxVal = Math.round(low + (dynamicRange - low) * smoothed);
  return clamp(1, dynamicRange, maxVal);
}

function getRangeForOp(opKey) {
  const state = opState[opKey];
  if (!state) return RANGE_MIN_START;
  const baseRange = clamp(RANGE_MIN_START, RANGE_MAX, RANGE_MIN_START + (state.level - 1) * 2);
  const accuracy = getAccuracy(opElo[opKey] || { correct: 0, total: 0 });
  const bonus = accuracy >= 0.85 ? 1 : 0;
  return clamp(2, RANGE_MAX, baseRange + bonus);
}

function calculateOverallRating(avgSpeedElo, avgAccuracy) {
  const speedComponent = clamp(0, 1, (avgSpeedElo - ELO_MIN) / (ELO_MAX - ELO_MIN));
  const accuracyComponent = clamp(0, 1, avgAccuracy);
  const combined = 0.65 * speedComponent + 0.35 * accuracyComponent;
  return ELO_MIN + combined * (ELO_MAX - ELO_MIN);
}

function getOpProgressPct(opKey) {
  const state = opState[opKey];
  if (!state) return 0;
  if (state.bossActive) {
    return Math.min(100, Math.round((state.bossCleared / state.bossTarget) * 100));
  }
  if (state.bossQueued && state.preBossBreakMs === 0) {
    return 100;
  }
  const count = state.progress || 0;
  return Math.min(100, Math.round(((count % LEVEL_STEP) / LEVEL_STEP) * 100));
}

function updateEloBoard() {
  if (!eloBoardEl || !settings) return;
  eloBoardEl.innerHTML = "";
  settings.ops.forEach((op) => {
    const entry = opElo[op];
    const state = opState[op];
    const row = document.createElement("div");
    row.className = "elo-row";
    const accuracyPct = Math.round(getAccuracy(entry) * 100);
    const dropRate = getDropRateForOp(op);
    const progressPct = getOpProgressPct(op);
    const rangeValue = getRangeForOp(op);
    const levelValue = state ? state.level : settings.startLevel;
    const bossLabel = state?.bossActive ? "Boss" : state?.bossQueued ? "Boss Soon" : "";
    row.innerHTML = `
      <div class="elo-tag">${opLabels[op]}</div>
      <div class="elo-metric"><strong>Lv ${levelValue}</strong><span>${bossLabel || "Level"}</span></div>
      <div class="elo-metric"><strong>${rangeValue}</strong><span>Range</span></div>
      <div class="elo-metric"><strong>${dropRate.toFixed(1)}</strong><span>Avg Drop Rate</span></div>
      <div class="elo-metric"><strong>${accuracyPct}%</strong><span>Accuracy</span></div>
      <div class="elo-progress" aria-hidden="true"><span style="width: ${progressPct}%"></span></div>
    `;
    eloBoardEl.appendChild(row);
  });
}

function updateBossQueues(dt) {
  if (!settings) return;
  let changed = false;
  settings.ops.forEach((opKey) => {
    const state = opState[opKey];
    if (!state || state.bossActive) return;
    const atGate = state.progress > 0 && state.progress % LEVEL_STEP === LEVEL_STEP - 1;
    if (atGate && !state.bossQueued) {
      state.bossQueued = true;
      state.preBossBreakMs = PRE_BOSS_BREAK_MS;
      changed = true;
    }
    if (state.bossQueued && state.preBossBreakMs > 0) {
      const nextValue = Math.max(0, state.preBossBreakMs - dt);
      if (nextValue === 0 && state.preBossBreakMs !== 0) {
        changed = true;
      }
      state.preBossBreakMs = nextValue;
    }
  });

  if (!getActiveBossOp()) {
    const nextBoss = getQueuedBossOp();
    if (nextBoss) startBossBattle(nextBoss);
  }

  if (changed) {
    updateEloBoard();
  }
}

function updateBossState() {
  if (!settings) return;
  const activeBossOp = getActiveBossOp();
  if (!activeBossOp) return;
  const state = opState[activeBossOp];
  if (!state) return;

  if (state.bossCleared >= state.bossTarget) {
    state.bossSpawnLocked = true;
  }

  if (state.bossCleared >= state.bossTarget && !hasBossDrops(activeBossOp)) {
    finishBossBattle(activeBossOp);
  }
}

function startBossBattle(opKey) {
  const state = opState[opKey];
  if (!state) return;
  state.bossActive = true;
  state.bossCleared = 0;
  state.bossTarget = BOSS_CLEAR_TARGET;
  state.bossSpawnLocked = false;
  state.bossQueued = false;
  state.preBossBreakMs = 0;
  startBossMusic();
  updateEloBoard();
}

function finishBossBattle(opKey) {
  const state = opState[opKey];
  if (!state) return;
  state.bossActive = false;
  state.bossCleared = 0;
  state.bossSpawnLocked = false;
  const currentIndex = Math.floor(state.progress / LEVEL_STEP);
  state.level = state.level + 1;
  state.progress = (currentIndex + 1) * LEVEL_STEP + (state.pendingProgress || 0);
  state.pendingProgress = 0;
  playVictory();
  if (!getActiveBossOp()) {
    stopBossMusic();
  }
  updateEloBoard();
}

function hasBossDrops(opKey) {
  return drops.some((drop) => drop.isBoss && drop.opKey === opKey);
}

function getActiveBossOp() {
  if (!settings) return null;
  return settings.ops.find((opKey) => opState[opKey]?.bossActive) || null;
}

function getQueuedBossOp() {
  if (!settings) return null;
  return (
    settings.ops.find(
      (opKey) => opState[opKey]?.bossQueued && opState[opKey]?.preBossBreakMs === 0
    ) || null
  );
}

function pickSpawnOp() {
  const available = settings.ops.filter((opKey) => {
    const state = opState[opKey];
    if (!state) return false;
    if (state.bossActive) return false;
    if (state.bossQueued && state.preBossBreakMs > 0) return false;
    return true;
  });
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

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

function playTone(frequency, duration, gainValue = 0.18) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(gainValue, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function startBossMusic() {
  if (bossMusicTimer) return;
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const pattern = [220, 262, 294, 330, 294, 262];
  let step = 0;
  bossMusicTimer = setInterval(() => {
    if (!getActiveBossOp() || isPaused) return;
    const freq = pattern[step % pattern.length];
    playTone(freq, 0.18, 0.14);
    step += 1;
  }, 200);
}

function stopBossMusic() {
  if (!bossMusicTimer) return;
  clearInterval(bossMusicTimer);
  bossMusicTimer = null;
}

function playVictory() {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const melody = [440, 554, 659, 880];
  melody.forEach((freq, index) => {
    setTimeout(() => playTone(freq, 0.22, 0.2), index * 160);
  });
}

pickActive(levelButtons);
pickActive(eloButtons);

answerInput.addEventListener("input", (event) => {
  initAudio();
  checkAnswer(event.target.value.trim());
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    event.preventDefault();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    checkAnswer(answerInput.value.trim());
    answerInput.value = "";
  }
});

pauseBtn.addEventListener("click", togglePause);
restartBtn.addEventListener("click", restartGame);
startBtn.addEventListener("click", () => {
  const selectedOps = Array.from(
    document.querySelectorAll('.checks input[type="checkbox"]')
  ).filter((box) => box.checked);

  if (selectedOps.length === 0) {
    selectedOps.push(document.querySelector('.checks input[value="add"]'));
    selectedOps[0].checked = true;
  }

  startGame();
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
requestAnimationFrame(tick);
