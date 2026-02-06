const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const eloEl = document.getElementById("elo");
const eloBoardEl = document.getElementById("eloBoard");
const answerInput = document.getElementById("answer");
const pauseBtn = document.getElementById("pauseBtn");
const bossBtn = document.getElementById("bossBtn");
const floodBtn = document.getElementById("floodBtn");
const restartBtn = document.getElementById("restartBtn");
const setupOverlay = document.getElementById("setup");
const startBtn = document.getElementById("startBtn");
const resumeBtn = document.getElementById("resumeBtn");
const versionEl = document.getElementById("version");
const livesDisplayEl = document.getElementById("livesDisplay");
const livesCountEl = document.getElementById("livesCount");
const gameOverEl = document.getElementById("gameOver");
const finalScoreEl = document.getElementById("finalScore");
const finalRatingEl = document.getElementById("finalRating");
const playAgainBtn = document.getElementById("playAgainBtn");
const pauseOverlayEl = document.getElementById("pauseOverlay");
const resumeBtnOverlay = document.getElementById("resumeBtnOverlay");

const levelButtons = document.querySelectorAll("#levelSelect button");
const eloButtons = document.querySelectorAll("#eloSelect button");
const livesButtons = document.querySelectorAll("#livesSelect button");

const GAME_HEIGHT = 520;
const GAME_WIDTH = 900;
const VERSION = "2026-02-05 23:06";

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
let nextDropId = 0;
let canvasW = 0;
let canvasH = 0;
let groundFlash = 0;
let currentInput = "";
let lives = null;
let gameTime = 0;
let eloUpdateTimer = 0;
let inputChurn = 0;
let shipState = null;
let stunnedUntil = 0;

const ELO_MIN = 400;
const ELO_MAX = 2000;
const ACCURACY_SMOOTH = 12;
const LEVEL_STEP = 18;
const BOSS_MULTIPLIER = 2;
const BOSS_CLEAR_TARGET = 8;
const PRE_BOSS_BREAK_MS = 1800;
const RANGE_MIN_START = 4;
const RANGE_MAX = 12;
const ELO_WINDOW_MS = 30000;
const ELO_SMOOTH = 0.2;
const CHURN_MAX = 12;
const ACCURACY_EMA_ALPHA = 0.02;
const SHIP_HULL_COUNT = 5;
const SHIP_WING_COUNT = 2;
const SHIP_GUN_COUNT = 2;
const SHIP_WING_RANGE_BONUS = 2;
const SHIP_GUN_RANGE_BONUS = 1;
const SHIP_SHOT_INTERVAL_MS = 1200;
const SHIP_SHOT_CHANCE = 0.25;
const STUN_MS = 1200;
const SHIP_MISSILE_SPEED_MULT = 2.4;

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
  canvasW = rect.width;
  canvasH = rect.height;
}

function updateStats() {
  scoreEl.textContent = score;
  eloEl.textContent = Math.round(elo);
  if (versionEl) versionEl.textContent = VERSION;
  if (lives !== null) {
    livesDisplayEl.classList.remove("hidden");
    livesCountEl.textContent = lives;
  } else {
    livesDisplayEl.classList.add("hidden");
  }
}

function isStunned() {
  return gameTime < stunnedUntil;
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

function generateProblemWithRange(opKey, maxValue) {
  const key = opKey;
  const op = operators[key];
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

function getShipAnswers() {
  if (!shipState || !shipState.active) return [];
  const answers = [];
  shipState.hull.forEach((p) => answers.push(p.answer));
  shipState.wings.left.forEach((p) => answers.push(p.answer));
  shipState.wings.right.forEach((p) => answers.push(p.answer));
  shipState.guns.left.forEach((p) => answers.push(p.answer));
  shipState.guns.right.forEach((p) => answers.push(p.answer));
  return answers;
}

function getActiveAnswers() {
  const dropAnswers = drops.map((drop) => drop.answer);
  return dropAnswers.concat(getShipAnswers());
}

function createDrop(opKey, isBoss = false, spawnedAt = 0, options = {}) {
  let problem = null;
  let attempts = 0;
  while (attempts < 16) {
    const candidate = generateProblem(opKey);
    const isDuplicate = getActiveAnswers().includes(candidate.answer);
    if (!isDuplicate) {
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
  const speedBase = getSpeedForOp(problem.opKey) * (0.7 + Math.random() * 0.6);
  const speed = speedBase * (options.speedMult || 1);

  drops.push({
    id: nextDropId++,
    x,
    y: -20,
    speed,
    text: problem.text,
    answer: problem.answer,
    opKey: problem.opKey,
    isBoss,
    isMissile: Boolean(options.isMissile),
    spawnedAt,
  });
  return true;
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

  const bottom = canvasH - 30;
  const survived = [];

  let missCount = 0;
  for (const drop of drops) {
    if (drop.y >= bottom) {
      recordEvent(drop.opKey, {
        correct: false,
        timeNorm: getTimeNorm(drop),
        churnNorm: 0,
      });
      applyProgressPenalty(drop.opKey, 1);
      missCount += 1;
      if (drop.isMissile) {
        stunnedUntil = Math.max(stunnedUntil, gameTime + STUN_MS);
      }
    } else {
      survived.push(drop);
    }
  }
  if (missCount > 0) {
    groundFlash = 300;
    playMiss();
    if (lives !== null) {
      lives = Math.max(0, lives - missCount);
      if (lives === 0) {
        triggerGameOver();
      }
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

function createShipBoss(opKey) {
  const usedAnswers = new Set(getActiveAnswers());
  const makeProblems = (count, rangeBonus) => {
    const list = [];
    let attempts = 0;
    while (list.length < count && attempts < 40) {
      const maxValue = clamp(2, RANGE_MAX + rangeBonus, getRangeMax(opKey) + rangeBonus);
      const candidate = generateProblemWithRange(opKey, maxValue);
      if (!usedAnswers.has(candidate.answer)) {
        usedAnswers.add(candidate.answer);
        list.push({
          ...candidate,
          spawnedAt: gameTime,
        });
      }
      attempts += 1;
    }
    return list;
  };

  shipState = {
    active: true,
    opKey,
    spawnedAt: gameTime,
    shotTimer: 0,
    gunsDisabled: false,
    hull: makeProblems(SHIP_HULL_COUNT, 0),
    wings: {
      left: makeProblems(SHIP_WING_COUNT, SHIP_WING_RANGE_BONUS),
      right: makeProblems(SHIP_WING_COUNT, SHIP_WING_RANGE_BONUS),
    },
    guns: {
      left: makeProblems(SHIP_GUN_COUNT, SHIP_GUN_RANGE_BONUS),
      right: makeProblems(SHIP_GUN_COUNT, SHIP_GUN_RANGE_BONUS),
    },
  };
  shipState.totalProblems = getShipRemainingProblems();
}

function isShipDestroyed() {
  if (!shipState || !shipState.active) return false;
  const hullGone = shipState.hull.length === 0;
  const wingsGone = shipState.wings.left.length === 0 && shipState.wings.right.length === 0;
  return hullGone || wingsGone;
}

function isShipGunsDisabled() {
  if (!shipState || !shipState.active) return true;
  return shipState.guns.left.length === 0 && shipState.guns.right.length === 0;
}

function updateShip(dt) {
  if (!shipState || !shipState.active) return;
  if (isShipDestroyed()) return;
  if (isShipGunsDisabled()) return;
  shipState.shotTimer += dt;
  if (shipState.shotTimer < SHIP_SHOT_INTERVAL_MS) return;
  shipState.shotTimer = 0;
  if (Math.random() < SHIP_SHOT_CHANCE) {
    spawnShipMissile();
  }
}

function spawnShipMissile() {
  if (!shipState || !shipState.active) return;
  const maxValue = clamp(2, RANGE_MAX + SHIP_GUN_RANGE_BONUS, getRangeMax(shipState.opKey) + SHIP_GUN_RANGE_BONUS);
  let attempts = 0;
  let problem = null;
  while (attempts < 20) {
    const candidate = generateProblemWithRange(shipState.opKey, maxValue);
    if (!getActiveAnswers().includes(candidate.answer)) {
      problem = candidate;
      break;
    }
    attempts += 1;
  }
  if (!problem) return;
  const x = canvasW / 2 + randInt(-120, 120);
  const speedBase = getSpeedForOp(shipState.opKey) * 1.3;
  drops.push({
    id: nextDropId++,
    x,
    y: 120,
    speed: speedBase * SHIP_MISSILE_SPEED_MULT,
    text: problem.text,
    answer: problem.answer,
    opKey: problem.opKey,
    isBoss: false,
    isMissile: true,
    spawnedAt: gameTime,
  });
}

function findShipMatch(value) {
  if (!shipState || !shipState.active) return null;
  const sections = [
    { key: "hull", side: "center", list: shipState.hull },
    { key: "wings", side: "left", list: shipState.wings.left },
    { key: "wings", side: "right", list: shipState.wings.right },
    { key: "guns", side: "left", list: shipState.guns.left },
    { key: "guns", side: "right", list: shipState.guns.right },
  ];
  for (const section of sections) {
    const index = section.list.findIndex((p) => p.answer === value);
    if (index >= 0) {
      return { ...section, index, problem: section.list[index] };
    }
  }
  return null;
}

function removeShipProblem(match) {
  if (!match || !shipState) return;
  match.list.splice(match.index, 1);
  shipState.gunsDisabled = isShipGunsDisabled();
}

function drawDrops() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (groundFlash > 0) {
    const alpha = Math.min(1, groundFlash / 300) * 0.35;
    ctx.fillStyle = `rgba(248, 113, 113, ${alpha.toFixed(2)})`;
    ctx.fillRect(0, canvasH - 36, canvasW, 36);
  }

  drawShip();
  drawSplashes();

  const inputNum = currentInput !== "" ? Number(currentInput) : NaN;
  const hasMatch = !Number.isNaN(inputNum);

  for (const drop of drops) {
    const dropTop = drop.y - 26;
    const dropBottom = drop.y + 22;
    const dropRadius = 22;
    const isHighlighted = hasMatch && drop.answer === inputNum;

    const fillColor = drop.isMissile
      ? "rgba(248, 113, 113, 0.92)"
      : drop.isBoss
        ? "rgba(251, 191, 36, 0.92)"
        : "rgba(125, 211, 252, 0.92)";
    const strokeColor = drop.isMissile
      ? "rgba(254, 202, 202, 0.95)"
      : drop.isBoss
        ? "rgba(253, 230, 138, 0.95)"
        : "rgba(186, 230, 253, 0.9)";
    if (isHighlighted) {
      ctx.shadowColor = drop.isBoss ? "rgba(251, 191, 36, 0.8)" : "rgba(125, 211, 252, 0.8)";
      ctx.shadowBlur = 18;
    }
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isHighlighted ? 3 : 2;
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
    if (isHighlighted) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

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
  drawStunOverlay();
}

function drawShip() {
  if (!shipState || !shipState.active) return;
  const centerX = canvasW / 2;
  const topY = 80;
  const hullWidth = 220;
  const hullHeight = 70;
  const wingOffsetX = 150;
  const wingOffsetY = 20;
  const gunOffsetX = 120;
  const gunOffsetY = 70;

  ctx.save();
  ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(centerX, topY, hullWidth / 2, hullHeight / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(51, 65, 85, 0.85)";
  ctx.beginPath();
  ctx.moveTo(centerX - wingOffsetX, topY + wingOffsetY);
  ctx.lineTo(centerX - 60, topY + 10);
  ctx.lineTo(centerX - 120, topY + 60);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX + wingOffsetX, topY + wingOffsetY);
  ctx.lineTo(centerX + 60, topY + 10);
  ctx.lineTo(centerX + 120, topY + 60);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = shipState.gunsDisabled ? "rgba(71, 85, 105, 0.6)" : "rgba(15, 23, 42, 0.9)";
  ctx.fillRect(centerX - gunOffsetX - 16, topY + gunOffsetY, 32, 16);
  ctx.fillRect(centerX + gunOffsetX - 16, topY + gunOffsetY, 32, 16);
  ctx.restore();

  const inputNum = currentInput !== "" ? Number(currentInput) : NaN;
  const highlightAnswer = Number.isNaN(inputNum) ? null : inputNum;

  drawShipProblems(shipState.hull, centerX, topY - 6, highlightAnswer);
  drawShipProblems(shipState.wings.left, centerX - 130, topY + 34, highlightAnswer);
  drawShipProblems(shipState.wings.right, centerX + 130, topY + 34, highlightAnswer);
  drawShipProblems(shipState.guns.left, centerX - 120, topY + 92, highlightAnswer);
  drawShipProblems(shipState.guns.right, centerX + 120, topY + 92, highlightAnswer);
}

function drawShipProblems(list, x, y, highlightAnswer) {
  if (!list || list.length === 0) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 14px Space Grotesk";
  list.forEach((problem, idx) => {
    const rowY = y + idx * 18;
    if (highlightAnswer !== null && problem.answer === highlightAnswer) {
      ctx.fillStyle = "#fde68a";
    } else {
      ctx.fillStyle = "#e2e8f0";
    }
    ctx.strokeStyle = "rgba(11, 18, 32, 0.75)";
    ctx.lineWidth = 3;
    ctx.strokeText(problem.text, x, rowY);
    ctx.fillText(problem.text, x, rowY);
  });
  ctx.restore();
}

function drawStunOverlay() {
  if (!isStunned()) return;
  const remaining = Math.max(0, Math.ceil((stunnedUntil - gameTime) / 100) / 10);
  ctx.save();
  ctx.fillStyle = "rgba(248, 113, 113, 0.15)";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = "rgba(248, 113, 113, 0.95)";
  ctx.font = "700 24px Space Grotesk";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`STUNNED ${remaining.toFixed(1)}s`, canvasW / 2, canvasH / 2);
  ctx.restore();
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
  const gunY = canvasH - 20;
  const gunX = canvasW / 2;
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
  const gunY = canvasH - 22;
  const gunX = canvasW / 2;
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
  if (isPaused || isStunned()) return;
  if (!inputValue) return;
  const value = Number(inputValue);
  if (Number.isNaN(value)) return;

  const shipMatch = findShipMatch(value);
  const match = drops.find((drop) => drop.answer === value);
  if (!shipMatch && !match) return;

  const answerValue = shipMatch ? shipMatch.problem.answer : match.answer;
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
  let shipClears = 0;
  if (shipMatch) {
    removeShipProblem(shipMatch);
    shipClears = 1;
  }
  score += cleared.length + shipClears;

  const clearedByOp = {};
  const clearedBossByOp = {};
  for (const drop of cleared) {
    clearedByOp[drop.opKey] = (clearedByOp[drop.opKey] || 0) + 1;
    if (drop.isBoss) {
      clearedBossByOp[drop.opKey] = (clearedBossByOp[drop.opKey] || 0) + 1;
    }
  }
  if (shipMatch) {
    const opKey = shipMatch.problem.opKey;
    clearedByOp[opKey] = (clearedByOp[opKey] || 0) + 1;
    clearedBossByOp[opKey] = (clearedBossByOp[opKey] || 0) + 1;
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

  const churnNorm = clamp(0, 1, inputChurn / CHURN_MAX);
  for (const drop of cleared) {
    recordEvent(drop.opKey, {
      correct: true,
      timeNorm: getTimeNorm(drop),
      churnNorm,
    });
  }
  if (shipMatch) {
    recordEvent(shipMatch.problem.opKey, {
      correct: true,
      timeNorm: getShipTimeNorm(),
      churnNorm,
    });
  }
  inputChurn = 0;
  cleared.forEach((drop) => createSplash(drop));
  playPop();
  fireLaser(shipMatch ? { x: canvasW / 2, y: 90 } : match);
  answerInput.value = "";
  currentInput = "";
  updateBossState();
}

function isInputPossible(inputValue) {
  if (!inputValue) return true;
  const trimmed = inputValue.trim();
  if (!trimmed) return true;
  return getActiveAnswers().some((answer) => String(answer).startsWith(trimmed));
}

function pickMistakeTarget() {
  if (drops.length > 0) {
    let best = drops[0];
    let bestNorm = getTimeNorm(best);
    for (let i = 1; i < drops.length; i += 1) {
      const drop = drops[i];
      const norm = getTimeNorm(drop);
      if (norm > bestNorm) {
        bestNorm = norm;
        best = drop;
      }
    }
    return { opKey: best.opKey, timeNorm: bestNorm };
  }
  if (shipState && shipState.active) {
    return { opKey: shipState.opKey, timeNorm: getShipTimeNorm() };
  }
  return null;
}

function registerInputMistake() {
  if (isPaused) return;
  const churnNorm = clamp(0, 1, inputChurn / CHURN_MAX);
  const target = pickMistakeTarget();
  if (target) {
    recordEvent(target.opKey, {
      correct: false,
      timeNorm: target.timeNorm,
      churnNorm,
    });
    applyProgressPenalty(target.opKey, 1);
  }
  playWrongInput();
  inputChurn = 0;
  answerInput.value = "";
  currentInput = "";
}

function tick(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (!isPaused) {
    gameTime += dt;
    eloUpdateTimer += dt;
    updateBossQueues(dt);

    spawnTimer += dt;
    const activeBossOp = getActiveBossOp();
    const bossState = activeBossOp ? opState[activeBossOp] : null;
    const bossLocked = bossState ? bossState.bossSpawnLocked : false;
    const isShipBoss = bossState?.bossType === "ship";
    const spawnInterval = activeBossOp
      ? isShipBoss
        ? baseSpawnMs
        : baseSpawnMs / BOSS_MULTIPLIER
      : baseSpawnMs;
    const maxSpawns = activeBossOp ? (isShipBoss ? 2 : 4) : 2;
    let spawns = 0;
    while (spawnTimer >= spawnInterval && spawns < maxSpawns && !(activeBossOp && bossLocked)) {
      const opKey = activeBossOp || pickSpawnOp();
      if (!opKey) {
        spawnTimer = 0;
        break;
      }
      const created = createDrop(opKey, Boolean(activeBossOp && !isShipBoss), gameTime);
      if (!created) {
        spawnTimer = 0;
        break;
      }
      spawnTimer -= spawnInterval;
      spawns += 1;
    }
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
    }

    updateDrops(dt);
    updateSplashes(dt);
    updateLaser(dt);
    updateShip(dt);
    answerInput.disabled = isPaused || isStunned();
    if (groundFlash > 0) groundFlash = Math.max(0, groundFlash - dt);
    updateBossState();
    if (eloUpdateTimer >= ELO_WINDOW_MS) {
      updateEloRatings();
      eloUpdateTimer = eloUpdateTimer % ELO_WINDOW_MS;
    }
    updateDifficulty();
    updateStats();
    updateEloBoard();
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
    opElo[op] = { speed: elo, accuracy: 0.8, events: [] };
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
      bossTypeToggle: false,
      bossType: "drops",
    };
  });
  score = 0;
  drops = [];
  splashes = [];
  spawnTimer = 0;
  lastTime = 0;
  gameTime = 0;
  eloUpdateTimer = 0;
  inputChurn = 0;
  shipState = null;
  stunnedUntil = 0;
  baseSpawnMs = 1400;
  baseSpeed = 40;
  stopBossMusic();
  laser = null;
  groundFlash = 0;
  const livesChoice = getActiveValue(livesButtons, "lives");
  lives = livesChoice > 0 ? livesChoice : null;
  isPaused = false;
  applyPausedState({ showOverlay: false });
  gameOverEl.classList.add("hidden");
  gameOverEl.setAttribute("aria-hidden", "true");
  updateStats();
  buildEloBoard();
  updateEloBoard();
  setupOverlay.classList.add("hidden");
  setupOverlay.setAttribute("aria-hidden", "true");
  answerInput.focus();
}

function applyPausedState({ showOverlay } = {}) {
  answerInput.disabled = isPaused || isStunned();
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  if (isPaused) {
    stopBossMusic();
  } else if (getActiveBossOp()) {
    startBossMusic();
  }
  if (pauseOverlayEl) {
    if (isPaused && showOverlay) {
      pauseOverlayEl.classList.remove("hidden");
      pauseOverlayEl.setAttribute("aria-hidden", "false");
    } else {
      pauseOverlayEl.classList.add("hidden");
      pauseOverlayEl.setAttribute("aria-hidden", "true");
    }
  }
  if (!isPaused) {
    answerInput.focus();
  }
}

function togglePause() {
  isPaused = !isPaused;
  applyPausedState({ showOverlay: true });
}

function restartGame() {
  isPaused = true;
  applyPausedState({ showOverlay: false });
  setupOverlay.classList.remove("hidden");
  setupOverlay.setAttribute("aria-hidden", "false");
  stopBossMusic();
  shipState = null;
  stunnedUntil = 0;
  updateResumeButton();
}

function triggerGameOver() {
  isPaused = true;
  applyPausedState({ showOverlay: false });
  clearSave();
  finalScoreEl.textContent = score;
  finalRatingEl.textContent = Math.round(elo);
  gameOverEl.classList.remove("hidden");
  gameOverEl.setAttribute("aria-hidden", "false");
  shipState = null;
  stunnedUntil = 0;
}

const SAVE_KEY = "mathrain_save";

function saveGame() {
  try {
    const data = {
      score,
      elo,
      opElo,
      opState,
      settings,
      baseSpawnMs,
      baseSpeed,
      lives,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (_) {}
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (_) {}
}

function resumeGame() {
  const data = loadGame();
  if (!data) return;
  initAudio();
  settings = data.settings;
  score = data.score;
  elo = data.elo;
  opElo = data.opElo;
  settings.ops.forEach((op) => {
    const entry = opElo[op];
    if (!entry) {
      opElo[op] = { speed: elo, accuracy: 0.8, events: [] };
      return;
    }
    entry.events = [];
    if (typeof entry.accuracy !== "number") {
      if (typeof entry.correct === "number" && typeof entry.total === "number" && entry.total > 0) {
        entry.accuracy = entry.correct / entry.total;
      } else {
        entry.accuracy = 0.8;
      }
    }
  });
  opState = data.opState;
  settings.ops.forEach((op) => {
    if (!opState[op]) return;
    if (typeof opState[op].bossTypeToggle !== "boolean") {
      opState[op].bossTypeToggle = false;
    }
    if (typeof opState[op].bossType !== "string") {
      opState[op].bossType = "drops";
    }
  });
  baseSpawnMs = data.baseSpawnMs;
  baseSpeed = data.baseSpeed;
  drops = [];
  splashes = [];
  spawnTimer = 0;
  lastTime = 0;
  gameTime = 0;
  eloUpdateTimer = 0;
  inputChurn = 0;
  stopBossMusic();
  laser = null;
  groundFlash = 0;
  shipState = null;
  stunnedUntil = 0;
  lives = typeof data.lives === "number" ? data.lives : null;
  isPaused = false;
  applyPausedState({ showOverlay: false });
  updateStats();
  buildEloBoard();
  updateEloBoard();
  setupOverlay.classList.add("hidden");
  setupOverlay.setAttribute("aria-hidden", "true");
  answerInput.focus();
}

function updateResumeButton() {
  const resumeBtn = document.getElementById("resumeBtn");
  if (!resumeBtn) return;
  const data = loadGame();
  if (data) {
    resumeBtn.classList.remove("hidden");
  } else {
    resumeBtn.classList.add("hidden");
  }
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
  if (!entry || typeof entry.accuracy !== "number") return 0.8;
  return entry.accuracy;
}

function recordEvent(opKey, { correct, timeNorm, churnNorm }) {
  const entry = opElo[opKey];
  if (!entry) return;
  const accuracyTarget = correct ? 1 : 0;
  entry.accuracy =
    entry.accuracy + (accuracyTarget - entry.accuracy) * ACCURACY_EMA_ALPHA;
  let score = 0;
  if (correct) {
    score = 1 - 0.7 * timeNorm - 0.3 * churnNorm;
  }
  score = clamp(0, 1, score);
  entry.events.push({ t: gameTime, score, correct });
}

function applyProgressPenalty(opKey, amount = 1) {
  const state = opState[opKey];
  if (!state || state.bossActive) return;
  const levelFloor = Math.floor(state.progress / LEVEL_STEP) * LEVEL_STEP;
  if (state.pendingProgress && state.pendingProgress > 0) {
    const reduce = Math.min(state.pendingProgress, amount);
    state.pendingProgress -= reduce;
    amount -= reduce;
  }
  if (amount <= 0) return;
  state.progress = Math.max(levelFloor, state.progress - amount);
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
  const accuracy = getAccuracy(opElo[opKey]);
  const bonus = accuracy >= 0.85 ? 1 : 0;
  return clamp(2, RANGE_MAX, baseRange + bonus);
}

function getTimeNorm(drop) {
  const bottom = canvasH - 30;
  const totalDistance = bottom + 20;
  const fallDuration = (totalDistance / drop.speed) * 1000;
  if (!Number.isFinite(fallDuration) || fallDuration <= 0) return 1;
  return clamp(0, 1, (gameTime - drop.spawnedAt) / fallDuration);
}

function updateEloRatings() {
  const windowStart = gameTime - ELO_WINDOW_MS;
  settings.ops.forEach((opKey) => {
    const entry = opElo[opKey];
    if (!entry) return;
    entry.events = entry.events.filter((evt) => evt.t >= windowStart);
    if (entry.events.length === 0) return;
    const avgScore =
      entry.events.reduce((sum, evt) => sum + evt.score, 0) / entry.events.length;
    const target = ELO_MIN + avgScore * (ELO_MAX - ELO_MIN);
    entry.speed = clamp(ELO_MIN, ELO_MAX, entry.speed + (target - entry.speed) * ELO_SMOOTH);
  });
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

let eloBoardRows = {};

function buildEloBoard() {
  if (!eloBoardEl || !settings) return;
  eloBoardEl.innerHTML = "";
  eloBoardRows = {};
  settings.ops.forEach((op) => {
    const row = document.createElement("div");
    row.className = "elo-row";

    const tag = document.createElement("div");
    tag.className = "elo-tag";
    tag.textContent = opLabels[op];

    const levelMetric = createMetric("Level");
    const rangeMetric = createMetric("Range");
    const rateMetric = createMetric("Avg Drop Rate");
    const accMetric = createMetric("Accuracy");

    const progressWrap = document.createElement("div");
    progressWrap.className = "elo-progress";
    progressWrap.setAttribute("aria-hidden", "true");
    const progressBar = document.createElement("span");
    progressWrap.appendChild(progressBar);

    row.appendChild(tag);
    row.appendChild(levelMetric.el);
    row.appendChild(rangeMetric.el);
    row.appendChild(rateMetric.el);
    row.appendChild(accMetric.el);
    row.appendChild(progressWrap);
    eloBoardEl.appendChild(row);

    eloBoardRows[op] = {
      levelVal: levelMetric.val,
      levelLabel: levelMetric.label,
      rangeVal: rangeMetric.val,
      rateVal: rateMetric.val,
      accVal: accMetric.val,
      progressBar,
    };
  });
}

function createMetric(labelText) {
  const el = document.createElement("div");
  el.className = "elo-metric";
  const val = document.createElement("strong");
  const label = document.createElement("span");
  label.textContent = labelText;
  el.appendChild(val);
  el.appendChild(label);
  return { el, val, label };
}

function updateEloBoard() {
  if (!eloBoardEl || !settings) return;
  if (Object.keys(eloBoardRows).length === 0) return;
  settings.ops.forEach((op) => {
    const refs = eloBoardRows[op];
    if (!refs) return;
    const entry = opElo[op];
    const state = opState[op];
    const levelValue = state ? state.level : settings.startLevel;
    const bossLabel = state?.bossActive ? "Boss" : state?.bossQueued ? "Boss Soon" : "";
    refs.levelVal.textContent = `Lv ${levelValue}`;
    refs.levelLabel.textContent = bossLabel || "Level";
    refs.rangeVal.textContent = getRangeForOp(op);
    refs.rateVal.textContent = getDropRateForOp(op).toFixed(1);
    refs.accVal.textContent = `${Math.round(getAccuracy(entry) * 100)}%`;
    refs.progressBar.style.width = `${getOpProgressPct(op)}%`;
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

}

function updateBossState() {
  if (!settings) return;
  const activeBossOp = getActiveBossOp();
  if (!activeBossOp) return;
  const state = opState[activeBossOp];
  if (!state) return;

  if (state.bossType === "ship") {
    if (shipState && shipState.active) {
      const total = getShipTotalProblems();
      const cleared = total - getShipRemainingProblems();
      state.bossTarget = total;
      state.bossCleared = Math.min(total, cleared);
      if (isShipDestroyed()) {
        state.bossSpawnLocked = true;
        finishBossBattle(activeBossOp);
      }
    }
    return;
  }

  if (state.bossCleared >= state.bossTarget) {
    state.bossSpawnLocked = true;
  }

  if (state.bossCleared >= state.bossTarget && !hasBossDrops(activeBossOp)) {
    finishBossBattle(activeBossOp);
  }
}

function startBossBattle(opKey, forcedType = null) {
  const state = opState[opKey];
  if (!state) return;
  if (forcedType) {
    state.bossType = forcedType;
  } else {
    state.bossTypeToggle = !state.bossTypeToggle;
    state.bossType = state.bossTypeToggle ? "ship" : "drops";
  }
  state.bossActive = true;
  state.bossCleared = 0;
  state.bossTarget = state.bossType === "ship" ? 0 : BOSS_CLEAR_TARGET;
  state.bossSpawnLocked = false;
  state.bossQueued = false;
  state.preBossBreakMs = 0;
  if (state.bossType === "ship") {
    createShipBoss(opKey);
  } else {
    shipState = null;
  }
  startBossMusic();
}

function finishBossBattle(opKey) {
  const state = opState[opKey];
  if (!state) return;
  state.bossActive = false;
  state.bossCleared = 0;
  state.bossSpawnLocked = false;
  state.bossType = "drops";
  shipState = null;
  const currentIndex = Math.floor(state.progress / LEVEL_STEP);
  state.level = state.level + 1;
  state.progress = (currentIndex + 1) * LEVEL_STEP + (state.pendingProgress || 0);
  state.pendingProgress = 0;
  playVictory();
  if (!getActiveBossOp()) {
    stopBossMusic();
  }
  answerInput.focus();
  saveGame();
}

function hasBossDrops(opKey) {
  return drops.some((drop) => drop.isBoss && drop.opKey === opKey);
}

function getShipRemainingProblems() {
  if (!shipState || !shipState.active) return 0;
  return (
    shipState.hull.length +
    shipState.wings.left.length +
    shipState.wings.right.length +
    shipState.guns.left.length +
    shipState.guns.right.length
  );
}

function getShipTotalProblems() {
  if (!shipState || !shipState.active) return 0;
  return shipState.totalProblems || getShipRemainingProblems();
}

function getShipTimeNorm() {
  if (!shipState || !shipState.active) return 1;
  const elapsed = gameTime - shipState.spawnedAt;
  return clamp(0, 1, elapsed / 10000);
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

function triggerBossNow(forcedType = null) {
  if (!settings) return;
  if (getActiveBossOp()) return;
  const candidates = settings.ops.filter((opKey) => {
    const state = opState[opKey];
    if (!state) return false;
    if (state.bossActive || state.bossQueued) return false;
    if (state.preBossBreakMs > 0) return false;
    return true;
  });
  if (!candidates.length) return;
  let bestOp = candidates[0];
  let bestProgress = opState[bestOp]?.progress || 0;
  for (let i = 1; i < candidates.length; i += 1) {
    const opKey = candidates[i];
    const progress = opState[opKey]?.progress || 0;
    if (progress > bestProgress) {
      bestProgress = progress;
      bestOp = opKey;
    }
  }
  opState[bestOp].bossQueued = true;
  opState[bestOp].preBossBreakMs = 0;
  startBossBattle(bestOp, forcedType);
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

function scheduleBossLoop() {
  if (!audioCtx || !bossMusicTimer) return;
  const pattern = [220, 262, 294, 330, 294, 262];
  const noteLen = 0.2;
  const loopLen = pattern.length * noteLen;
  const now = audioCtx.currentTime;
  const startAt = bossMusicTimer.nextLoop || now;
  if (startAt - now > loopLen) return;

  pattern.forEach((freq, i) => {
    const t = startAt + i * noteLen;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  });

  bossMusicTimer.nextLoop = startAt + loopLen;
  bossMusicTimer.timerId = setTimeout(() => scheduleBossLoop(), (loopLen - 0.1) * 1000);
}

function startBossMusic() {
  if (bossMusicTimer) return;
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  bossMusicTimer = { nextLoop: audioCtx.currentTime, timerId: null };
  scheduleBossLoop();
}

function stopBossMusic() {
  if (!bossMusicTimer) return;
  if (bossMusicTimer.timerId) clearTimeout(bossMusicTimer.timerId);
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
pickActive(livesButtons);

answerInput.addEventListener("input", (event) => {
  initAudio();
  if (isStunned()) return;
  if (!isPaused) {
    inputChurn = Math.min(CHURN_MAX * 2, inputChurn + 1);
  }
  currentInput = event.target.value.trim();
  if (!isInputPossible(currentInput)) {
    registerInputMistake();
    return;
  }
  checkAnswer(currentInput);
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    event.preventDefault();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (isStunned()) return;
    const value = answerInput.value.trim();
    if (!value) return;
    const numericValue = Number(value);
    const hasExactMatch =
      !Number.isNaN(numericValue) && drops.some((drop) => drop.answer === numericValue);
    if (hasExactMatch) {
      checkAnswer(value);
    } else {
      registerInputMistake();
    }
  }
});

pauseBtn.addEventListener("click", togglePause);
bossBtn.addEventListener("click", () => {
  triggerBossNow("ship");
});
floodBtn.addEventListener("click", () => {
  triggerBossNow("drops");
});
restartBtn.addEventListener("click", restartGame);
startBtn.addEventListener("click", () => {
  const selectedOps = Array.from(
    document.querySelectorAll('.checks input[type="checkbox"]')
  ).filter((box) => box.checked);

  if (selectedOps.length === 0) {
    selectedOps.push(document.querySelector('.checks input[value="add"]'));
    selectedOps[0].checked = true;
  }

  clearSave();
  startGame();
});

resumeBtn.addEventListener("click", () => {
  resumeGame();
});

if (resumeBtnOverlay) {
  resumeBtnOverlay.addEventListener("click", () => {
    if (isPaused) togglePause();
  });
}

playAgainBtn.addEventListener("click", () => {
  gameOverEl.classList.add("hidden");
  gameOverEl.setAttribute("aria-hidden", "true");
  restartGame();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && settings && setupOverlay.classList.contains("hidden") && gameOverEl.classList.contains("hidden")) {
    togglePause();
  }
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateResumeButton();
applyPausedState({ showOverlay: false });
requestAnimationFrame(tick);
