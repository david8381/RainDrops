const canvas = document.getElementById("canvas");

let scene = null;
let camera = null;
let renderer = null;
let dropGroup = null;
let shipGroup = null;
let laserLine = null;
let stunOverlay = null;
let stunText = null;

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
const VERSION = "2026-02-05 23:42";

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
let wasStunned = false;
let preserveEloOnRestart = false;

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
const SHIP_PART_COUNT = 10;
const SHIP_SHOT_INTERVAL_MS = 700;
const SHIP_SHOT_CHANCE = 0.45;
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
  canvasW = rect.width;
  canvasH = rect.height;
  if (renderer && camera) {
    renderer.setSize(canvasW, canvasH, false);
    camera.aspect = canvasW / canvasH;
    camera.updateProjectionMatrix();
  } else {
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }
  if (stunOverlay) {
    stunOverlay.scale.set(canvasW / 1000, canvasH / 800, 1);
  }
}

function initThree() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(canvasW, canvasH, false);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, canvasW / canvasH, 1, 2000);
  camera.position.set(0, 0, 800);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(0, 200, 400);
  scene.add(dir);

  dropGroup = new THREE.Group();
  shipGroup = new THREE.Group();
  scene.add(dropGroup);
  scene.add(shipGroup);

  const overlayGroup = new THREE.Group();
  scene.add(overlayGroup);

  const stunPlaneGeo = new THREE.PlaneGeometry(1000, 800);
  const stunPlaneMat = new THREE.MeshBasicMaterial({
    color: 0xf87171,
    transparent: true,
    opacity: 0.0,
  });
  stunOverlay = new THREE.Mesh(stunPlaneGeo, stunPlaneMat);
  stunOverlay.position.set(0, 0, 100);
  overlayGroup.add(stunOverlay);

  stunText = createTextSprite("STUNNED", { fontSize: 32, color: "#fef2f2" });
  stunText.position.set(0, 0, 120);
  overlayGroup.add(stunText);

  laserLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0 })
  );
  scene.add(laserLine);
}

function toWorld(x, y) {
  return {
    x: x - canvasW / 2,
    y: canvasH / 2 - y,
  };
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

function createTextSprite(text, { fontSize = 18, color = "#f8fafc" } = {}) {
  const padding = 8;
  const font = `${fontSize}px Space Grotesk`;
  const canvasEl = document.createElement("canvas");
  const ctx2d = canvasEl.getContext("2d");
  ctx2d.font = font;
  const metrics = ctx2d.measureText(text);
  const width = Math.ceil(metrics.width) + padding * 2;
  const height = fontSize + padding * 2;
  canvasEl.width = width * 2;
  canvasEl.height = height * 2;
  ctx2d.scale(2, 2);
  ctx2d.font = font;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  ctx2d.fillStyle = color;
  ctx2d.strokeStyle = "rgba(2, 6, 23, 0.85)";
  ctx2d.lineWidth = 4;
  ctx2d.strokeText(text, width / 2, height / 2);
  ctx2d.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvasEl);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 0.9;
  sprite.scale.set(width * scale, height * scale, 1);
  sprite.userData = { baseColor: color };
  return sprite;
}

function getShipAnswers() {
  if (!shipState || !shipState.active) return [];
  return shipState.parts.map((p) => p.answer);
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
    mesh: null,
    textSprite: null,
  });
  createDropVisual(drops[drops.length - 1]);
  return true;
}

function createDropVisual(drop) {
  if (!scene || !dropGroup) return;
  const radius = drop.isBoss || drop.isMissile ? 22 : 18;
  const geometry = new THREE.SphereGeometry(radius, 24, 24);
  const color = drop.isMissile ? 0xf87171 : drop.isBoss ? 0xfbbf24 : 0x7dd3fc;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
  const mesh = new THREE.Mesh(geometry, material);
  const textSprite = createTextSprite(drop.text, {
    fontSize: drop.isBoss || drop.isMissile ? 18 : 17,
    color: "#f8fafc",
  });
  textSprite.position.set(0, 0, radius + 2);
  mesh.add(textSprite);
  dropGroup.add(mesh);
  drop.mesh = mesh;
  drop.textSprite = textSprite;
  updateDropVisual(drop);
}

function updateDropVisual(drop) {
  if (!drop.mesh) return;
  const pos = toWorld(drop.x, drop.y);
  drop.mesh.position.set(pos.x, pos.y, 0);
}

function removeDropVisual(drop) {
  if (!drop.mesh) return;
  dropGroup.remove(drop.mesh);
  drop.mesh.traverse((child) => {
    if (child.material && child.material.map) {
      child.material.map.dispose();
    }
    if (child.material) child.material.dispose();
    if (child.geometry) child.geometry.dispose();
  });
  drop.mesh = null;
  drop.textSprite = null;
}

function clearDropVisuals() {
  if (!dropGroup) return;
  while (dropGroup.children.length > 0) {
    const child = dropGroup.children.pop();
    if (child.material && child.material.map) {
      child.material.map.dispose();
    }
    if (child.material) child.material.dispose();
    if (child.geometry) child.geometry.dispose();
  }
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
    updateDropVisual(drop);
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
      removeDropVisual(drop);
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
    parts: makeProblems(SHIP_PART_COUNT, 0),
  };
  shipState.totalProblems = getShipRemainingProblems();
  buildShipVisual();
}

function clearShipVisual() {
  if (!shipGroup) return;
  while (shipGroup.children.length > 0) {
    const child = shipGroup.children.pop();
    if (child.material && child.material.map) {
      child.material.map.dispose();
    }
    if (child.material) child.material.dispose();
    if (child.geometry) child.geometry.dispose();
  }
}

function buildShipVisual() {
  if (!shipGroup || !shipState) return;
  clearShipVisual();
  const hullGeo = new THREE.SphereGeometry(90, 32, 24);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.2,
  });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.scale.set(1.4, 0.6, 0.8);
  hull.position.set(0, 200, 0);
  shipGroup.add(hull);

  shipState.parts.forEach((part) => {
    const sprite = createTextSprite(part.text, { fontSize: 14, color: "#e2e8f0" });
    part.sprite = sprite;
    shipGroup.add(sprite);
  });
  layoutShipParts();
}

function layoutShipParts() {
  if (!shipState || !shipState.parts || !shipGroup) return;
  const cols = 5;
  const spacingX = 70;
  const spacingY = 26;
  const startX = -((cols - 1) * spacingX) / 2;
  const startY = 220;
  shipState.parts.forEach((part, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = startX + col * spacingX;
    const y = startY - row * spacingY;
    if (part.sprite) {
      part.sprite.position.set(x, y, 5);
    }
  });
}

function isShipDestroyed() {
  if (!shipState || !shipState.active) return false;
  return shipState.parts.length === 0;
}

function updateShip(dt) {
  if (!shipState || !shipState.active) return;
  if (isShipDestroyed()) return;
  shipState.shotTimer += dt;
  if (shipState.shotTimer < SHIP_SHOT_INTERVAL_MS) return;
  shipState.shotTimer = 0;
  if (Math.random() < SHIP_SHOT_CHANCE) {
    spawnShipMissile();
  }
}

function spawnShipMissile() {
  if (!shipState || !shipState.active) return;
  const maxValue = clamp(2, RANGE_MAX + 1, getRangeMax(shipState.opKey) + 1);
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
  const drop = {
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
    mesh: null,
    textSprite: null,
  };
  drops.push(drop);
  createDropVisual(drop);
}

function findShipMatch(value) {
  if (!shipState || !shipState.active) return null;
  const index = shipState.parts.findIndex((p) => p.answer === value);
  if (index >= 0) {
    return { index, problem: shipState.parts[index] };
  }
  return null;
}

function removeShipProblem(match) {
  if (!match || !shipState) return;
  const removed = shipState.parts.splice(match.index, 1)[0];
  if (removed && removed.sprite && shipGroup) {
    shipGroup.remove(removed.sprite);
    if (removed.sprite.material && removed.sprite.material.map) {
      removed.sprite.material.map.dispose();
    }
    if (removed.sprite.material) removed.sprite.material.dispose();
  }
  layoutShipParts();
}

function updateTextSprite(sprite, text) {
  if (!sprite || !sprite.material || !sprite.material.map) return;
  const fontSize = 32;
  const padding = 8;
  const canvasEl = sprite.material.map.image;
  const ctx2d = canvasEl.getContext("2d");
  const font = `${fontSize}px Space Grotesk`;
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx2d.scale(2, 2);
  ctx2d.font = font;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  ctx2d.fillStyle = "#fef2f2";
  ctx2d.strokeStyle = "rgba(2, 6, 23, 0.85)";
  ctx2d.lineWidth = 4;
  ctx2d.strokeText(text, canvasEl.width / 4, canvasEl.height / 4);
  ctx2d.fillText(text, canvasEl.width / 4, canvasEl.height / 4);
  sprite.material.map.needsUpdate = true;
}

function renderScene() {
  if (!renderer || !scene || !camera) return;
  const inputNum = currentInput !== "" ? Number(currentInput) : NaN;
  const hasMatch = !Number.isNaN(inputNum);

  drops.forEach((drop) => {
    if (drop.textSprite) {
      drop.textSprite.material.color.set(
        hasMatch && drop.answer === inputNum ? 0xfde68a : 0xffffff
      );
    }
  });

  if (shipState && shipState.parts) {
    shipState.parts.forEach((part) => {
      if (part.sprite) {
        part.sprite.material.color.set(
          hasMatch && part.answer === inputNum ? 0xfde68a : 0xffffff
        );
      }
    });
  }

  if (laserLine) {
    if (laser) {
      const start = toWorld(laser.x1, laser.y1);
      const end = toWorld(laser.x2, laser.y2);
      laserLine.geometry.setFromPoints([
        new THREE.Vector3(start.x, start.y, 10),
        new THREE.Vector3(end.x, end.y, 10),
      ]);
      laserLine.material.opacity = Math.max(0, laser.life / laser.maxLife);
    } else {
      laserLine.material.opacity = 0;
    }
  }

  if (stunOverlay && stunText) {
    if (isStunned()) {
      const remaining = Math.max(0, Math.ceil((stunnedUntil - gameTime) / 100) / 10);
      stunOverlay.material.opacity = 0.18;
      updateTextSprite(stunText, `STUNNED ${remaining.toFixed(1)}s`);
    } else {
      stunOverlay.material.opacity = 0;
    }
  }

  renderer.render(scene, camera);
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

  cleared.forEach((drop) => removeDropVisual(drop));
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
    if (isStunned()) {
      if (!wasStunned) {
        wasStunned = true;
      }
    } else if (wasStunned) {
      wasStunned = false;
      answerInput.focus();
    }
    if (groundFlash > 0) groundFlash = Math.max(0, groundFlash - dt);
    updateBossState();
    if (eloUpdateTimer >= ELO_WINDOW_MS) {
      updateEloRatings();
      eloUpdateTimer = eloUpdateTimer % ELO_WINDOW_MS;
    }
    updateDifficulty();
    updateStats();
    updateEloBoard();
    renderScene();

  }

  requestAnimationFrame(tick);
}

function startGame() {
  initAudio();
  settings = pickSettings();
  settings.startLevel = getActiveValue(levelButtons, "level");
  const prevOpElo = preserveEloOnRestart ? opElo : null;
  if (!preserveEloOnRestart) {
    elo = getActiveValue(eloButtons, "elo");
  }
  opElo = {};
  opState = {};
  settings.ops.forEach((op) => {
    if (preserveEloOnRestart && prevOpElo && prevOpElo[op]) {
      const prev = prevOpElo[op];
      opElo[op] = {
        speed: prev.speed || elo,
        accuracy: typeof prev.accuracy === "number" ? prev.accuracy : 0.8,
        events: [],
      };
    } else {
      opElo[op] = { speed: elo, accuracy: 0.8, events: [] };
    }
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
  clearDropVisuals();
  splashes = [];
  spawnTimer = 0;
  lastTime = 0;
  gameTime = 0;
  eloUpdateTimer = 0;
  inputChurn = 0;
  shipState = null;
  stunnedUntil = 0;
  wasStunned = false;
  preserveEloOnRestart = false;
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
  answerInput.disabled = isPaused;
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
  clearShipVisual();
  stunnedUntil = 0;
  wasStunned = false;
  preserveEloOnRestart = true;
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
  clearShipVisual();
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
  clearDropVisuals();
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
  clearShipVisual();
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
  clearShipVisual();
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
  return shipState.parts.length;
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
  if (event.key === "Escape" || event.key === "Backspace") {
    event.preventDefault();
    event.stopPropagation();
    answerInput.value = "";
    currentInput = "";
    inputChurn = 0;
    return;
  }
  if (isStunned()) {
    event.preventDefault();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
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
initThree();
updateResumeButton();
applyPausedState({ showOverlay: false });
requestAnimationFrame(tick);
