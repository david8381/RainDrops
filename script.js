const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const eloEl = document.getElementById("elo");
const eloBoardEl = document.getElementById("eloBoard");
const answerInput = document.getElementById("answer");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const setupOverlay = document.getElementById("setup");
const startBtn = document.getElementById("startBtn");
const rangeInput = document.getElementById("range");

const levelButtons = document.querySelectorAll("#levelSelect button");
const eloButtons = document.querySelectorAll("#eloSelect button");

const GAME_HEIGHT = 520;
const GAME_WIDTH = 900;

let drops = [];
let score = 0;
let level = 1;
let elo = 800;
let baseSpawnMs = 1400;
let baseSpeed = 40;
let spawnTimer = 0;
let lastTime = 0;
let isPaused = true;
let settings = null;

const ELO_MIN = 400;
const ELO_MAX = 2000;
const SPEED_GAIN = 12;
const SPEED_LOSS = 16;
const ACCURACY_SMOOTH = 12;

const opLabels = {
  add: "Add",
  sub: "Sub",
  mul: "Mul",
  div: "Div",
};

let opElo = {};

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
  levelEl.textContent = level;
  eloEl.textContent = Math.round(elo);
}

function pickSettings() {
  const selectedOps = Array.from(
    document.querySelectorAll('.checks input[type="checkbox"]')
  )
    .filter((box) => box.checked)
    .map((box) => box.value);

  const range = Math.max(1, Math.min(12, Number(rangeInput.value || 12)));

  if (selectedOps.length === 0) {
    selectedOps.push("add");
  }

  return {
    ops: selectedOps,
    range,
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

function generateProblem() {
  const { ops, range } = settings;
  const opKey = ops[Math.floor(Math.random() * ops.length)];
  const op = operators[opKey];
  const maxValue = getRangeMax(opKey, range);

  let a = 0;
  let b = 0;
  let answer = 0;

  if (opKey === "div") {
    const quotient = randInt(1, maxValue);
    b = randInt(1, maxValue);
    a = quotient * b;
    answer = quotient;
  } else if (opKey === "sub") {
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
    opKey,
  };
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createDrop() {
  const problem = generateProblem();
  const x = randInt(40, 860);
  const speed = getSpeedForOp(problem.opKey) * (0.85 + Math.random() * 0.3);

  drops.push({
    id: Date.now() + Math.random(),
    x,
    y: -20,
    speed,
    text: problem.text,
    answer: problem.answer,
    opKey: problem.opKey,
  });
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

function drawDrops() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const drop of drops) {
    ctx.fillStyle = "rgba(125, 211, 252, 0.9)";
    ctx.beginPath();
    ctx.ellipse(drop.x, drop.y, 30, 38, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0b1220";
    ctx.font = "600 16px Space Grotesk";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(drop.text, drop.x, drop.y);
  }
}

function updateDifficulty() {
  const newLevel = Math.max(1, settings.startLevel + Math.floor(score / 12));
  if (newLevel !== level) {
    level = newLevel;
  }
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

  const index = drops.findIndex((drop) => drop.answer === value);
  if (index >= 0) {
    const solved = drops.splice(index, 1)[0];
    score += 1;
    adjustSpeed(solved.opKey, SPEED_GAIN);
    recordAccuracy(solved.opKey, true);
    answerInput.value = "";
  }
}

function tick(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (!isPaused) {
    spawnTimer += dt;
    if (spawnTimer >= baseSpawnMs) {
      createDrop();
      spawnTimer = 0;
    }

    updateDrops(dt);
    updateDifficulty();
    updateStats();
    drawDrops();

  }

  requestAnimationFrame(tick);
}

function startGame() {
  settings = pickSettings();
  settings.startLevel = getActiveValue(levelButtons, "level");
  elo = getActiveValue(eloButtons, "elo");
  opElo = {};
  settings.ops.forEach((op) => {
    opElo[op] = { speed: elo, correct: 0, total: 0 };
  });
  score = 0;
  level = settings.startLevel;
  drops = [];
  spawnTimer = 0;
  lastTime = 0;
  baseSpawnMs = 1400;
  baseSpeed = 40;
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
  if (!isPaused) {
    answerInput.focus();
  }
}

function restartGame() {
  setupOverlay.classList.remove("hidden");
  setupOverlay.setAttribute("aria-hidden", "false");
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

function getRangeMax(opKey, selectedRange) {
  const entry = opElo[opKey];
  if (!entry) return selectedRange;
  const accuracy = getAccuracy(entry);
  const smoothed = clamp(0, 1, (accuracy * ACCURACY_SMOOTH + 0.5) / (ACCURACY_SMOOTH + 1));
  const low = Math.max(2, Math.round(selectedRange * 0.45));
  const maxVal = Math.round(low + (selectedRange - low) * smoothed);
  return clamp(1, selectedRange, maxVal);
}

function calculateOverallRating(avgSpeedElo, avgAccuracy) {
  const speedComponent = clamp(0, 1, (avgSpeedElo - ELO_MIN) / (ELO_MAX - ELO_MIN));
  const accuracyComponent = clamp(0, 1, avgAccuracy);
  const combined = 0.65 * speedComponent + 0.35 * accuracyComponent;
  return ELO_MIN + combined * (ELO_MAX - ELO_MIN);
}

function updateEloBoard() {
  if (!eloBoardEl || !settings) return;
  eloBoardEl.innerHTML = "";
  settings.ops.forEach((op) => {
    const entry = opElo[op];
    const row = document.createElement("div");
    row.className = "elo-row";
    const accuracyPct = Math.round(getAccuracy(entry) * 100);
    row.innerHTML = `
      <div class="elo-tag">${opLabels[op]}</div>
      <div class="elo-metric"><strong>${Math.round(entry.speed)}</strong><span>Speed Rating</span></div>
      <div class="elo-metric"><strong>${accuracyPct}%</strong><span>Accuracy</span></div>
    `;
    eloBoardEl.appendChild(row);
  });
}

pickActive(levelButtons);
pickActive(eloButtons);

answerInput.addEventListener("input", (event) => {
  checkAnswer(event.target.value.trim());
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    event.preventDefault();
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
