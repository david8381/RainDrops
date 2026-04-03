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

const operators = {
  add: { symbol: "+", fn: (a, b) => a + b },
  sub: { symbol: "-", fn: (a, b) => a - b },
  mul: { symbol: "×", fn: (a, b) => a * b },
  div: { symbol: "÷", fn: (a, b) => a / b },
};

const opConfig = {
  add: { enabled: false, difficulty: 3, symbol: "+", label: "+" },
  sub: { enabled: false, difficulty: 3, symbol: "-", label: "-" },
  mul: { enabled: false, difficulty: 3, symbol: "×", label: "×" },
  div: { enabled: false, difficulty: 3, symbol: "÷", label: "÷" },
  f10: { enabled: false, difficulty: 3, symbol: "×10", label: "x10" },
  si:  { enabled: false, difficulty: 3, symbol: "SI", label: "SI" },
  rect: { enabled: false, difficulty: 3, symbol: "▭", label: "▭" },
  circ: { enabled: false, difficulty: 3, symbol: "○", label: "○" },
  factor: { enabled: false, difficulty: 3, symbol: "n!", label: "n!" },
};

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
const problemStats = {
  add: {},
  sub: {},
  mul: {},
  div: {},
  f10: {},
  si: {},
  rect: {},
  circ: {},
  factor: {},
};

function recordProblemResult(drop, correct) {
  const stats = problemStats[drop.opKey];
  if (!stats) return;
  const key = drop.statsKey || drop.text;
  if (!stats[key]) stats[key] = { asked: 0, correct: 0 };
  stats[key].asked += 1;
  if (correct) stats[key].correct += 1;
}
let spawnRate = 3;
let pace = 5;

// ============================================================
// 2. Utility Functions
// ============================================================

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normalizeTypedValue(inputValue, { allowIncomplete = true } = {}) {
  let value = String(inputValue || "").trim();
  if (!value) return "";
  if (value.startsWith(".")) value = `0${value}`;
  if (value.startsWith("-.")) value = value.replace("-.", "-0.");
  if (!/^-?\d*\.?\d*$/.test(value)) return value;
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const parts = body.split(".");
  let intPart = parts[0] || "0";
  intPart = intPart.replace(/^0+(?=\d)/, "");
  let out = `${negative ? "-" : ""}${intPart}`;
  if (parts.length > 1) {
    out += `.${parts[1]}`;
  }
  if (!allowIncomplete && out.endsWith(".")) {
    out = out.slice(0, -1);
  }
  if (!allowIncomplete && out.includes(".")) {
    out = out.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (out === "-0") return "0";
  return out;
}

function pow10(exp) {
  let out = 1;
  for (let i = 0; i < exp; i += 1) out *= 10;
  return out;
}

function formatFixedScale(value, scaleDigits) {
  if (scaleDigits <= 0) return String(value);
  const base = pow10(scaleDigits);
  const absValue = Math.abs(value);
  const intPart = Math.floor(absValue / base);
  const fracPart = absValue % base;
  const sign = value < 0 ? "-" : "";
  return `${sign}${intPart}.${String(fracPart).padStart(scaleDigits, "0")}`;
}

function shiftDecimal(value, fromScale, shiftPower) {
  const toScale = fromScale - shiftPower;
  if (toScale >= 0) {
    return formatFixedScale(value, toScale);
  }
  return String(value * pow10(-toScale));
}

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

function getDifficultyRange(opKey, difficulty) {
  const d = clamp(1, 10, difficulty);
  const t = (d - 1) / 9; // 0..1

  if (opKey === "add" || opKey === "sub") {
    // difficulty 1 = 1-3, difficulty 5 = 1-10, difficulty 10 = 1-20
    const maxVal = Math.round(lerp(3, 20, t));
    return { min: 1, max: maxVal };
  }

  if (opKey === "mul" || opKey === "div") {
    // difficulty 1 = 1-3, difficulty 5 = 1-8, difficulty 10 = 1-12
    const maxVal = Math.round(lerp(3, 12, t));
    return { min: 1, max: maxVal };
  }

  if (opKey === "f10") {
    // Return maxValue for f10 generation
    const maxVal = Math.round(lerp(3, 20, t));
    return { min: 1, max: maxVal };
  }

  if (opKey === "si") {
    // Range represents number of prefix pairs available
    const prefixes = getSIPrefixesForDifficulty(d);
    return { min: 1, max: prefixes.length };
  }

  if (opKey === "rect") {
    // Same range as add/sub — side lengths
    const maxVal = Math.round(lerp(3, 20, t));
    return { min: 1, max: maxVal };
  }

  if (opKey === "circ") {
    // Radius / diameter values
    const maxVal = Math.round(lerp(3, 12, t));
    return { min: 1, max: maxVal };
  }

  if (opKey === "factor") {
    // Composite number range: diff 1 = 4-16, diff 10 = 4-200
    const maxVal = Math.round(lerp(16, 200, t));
    return { min: 4, max: maxVal };
  }

  return { min: 1, max: 10 };
}

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

function generateFactorsOfTenProblem(maxValue) {
  const difficulty = opConfig.f10.difficulty;
  const t = (difficulty - 1) / 9;

  // Higher difficulty: more factor powers available
  const factorPowers = difficulty <= 3 ? [1] : difficulty <= 6 ? [1, 2] : [1, 2, 3];
  const direction = Math.random() < 0.5 ? "mul" : "div";
  const power = factorPowers[randInt(0, factorPowers.length - 1)];
  const factor = pow10(power);

  // Higher difficulty: more decimal places possible
  const decimalPlaces = difficulty <= 4 ? 1 : Math.random() < 0.7 ? 1 : 2;
  const maxMantissa = Math.max(10, maxValue * pow10(decimalPlaces + 2));
  const mantissa = randInt(10, maxMantissa);
  const left = formatFixedScale(mantissa, decimalPlaces);
  const answerText =
    direction === "mul"
      ? shiftDecimal(mantissa, decimalPlaces, power)
      : shiftDecimal(mantissa, decimalPlaces, -power);

  return {
    text: `${left} ${direction === "mul" ? "×" : "÷"} ${factor}`,
    answer: Number(answerText),
    answerText,
    opKey: "f10",
  };
}

// ── SI Metric Conversion ──

// Each prefix: [symbol, exponent relative to base unit]
// Ordered for difficulty gating.
const siPrefixes = [
  { sym: "k", exp: 3, name: "kilo" },   // diff 1+
  { sym: "",  exp: 0, name: "base" },    // diff 1+
  { sym: "c", exp: -2, name: "centi" },  // diff 2+
  { sym: "m", exp: -3, name: "milli" },  // diff 3+
  { sym: "h", exp: 2, name: "hecto" },   // diff 5+
  { sym: "da", exp: 1, name: "deca" },   // diff 6+
  { sym: "d", exp: -1, name: "deci" },   // diff 6+
  { sym: "M", exp: 6, name: "mega" },    // diff 7+ (was 6, adjusted)
  { sym: "μ", exp: -6, name: "micro" },  // diff 7+
  { sym: "G", exp: 9, name: "giga" },    // diff 8+
  { sym: "n", exp: -9, name: "nano" },   // diff 8+
  { sym: "T", exp: 12, name: "tera" },   // diff 9+
  { sym: "p", exp: -12, name: "pico" },  // diff 9+
];

// Which prefixes unlock at each difficulty level
function getSIPrefixesForDifficulty(difficulty) {
  const d = clamp(1, 10, difficulty);
  const thresholds = [
    1,  // k
    1,  // base
    2,  // c
    3,  // m
    5,  // h
    6,  // da
    6,  // d
    7,  // M
    7,  // μ
    8,  // G
    8,  // n
    9,  // T
    9,  // p
  ];
  return siPrefixes.filter((_, i) => d >= thresholds[i]);
}

const siBaseUnits = ["m", "g", "L"];

// Convert exponent difference to answer text like "*1000" or "/100"
function expDiffToConversion(expDiff) {
  if (expDiff === 0) return "*1";
  const factor = Math.pow(10, Math.abs(expDiff));
  return expDiff > 0 ? `*${factor}` : `/${factor}`;
}

function generateSIProblem(difficulty) {
  const prefixes = getSIPrefixesForDifficulty(difficulty);
  if (prefixes.length < 2) return null;

  // Pick two different prefixes
  let fromIdx = randInt(0, prefixes.length - 1);
  let toIdx = fromIdx;
  while (toIdx === fromIdx) {
    toIdx = randInt(0, prefixes.length - 1);
  }
  const from = prefixes[fromIdx];
  const to = prefixes[toIdx];

  // Pick a base unit for display
  const baseUnit = siBaseUnits[randInt(0, siBaseUnits.length - 1)];

  // Answer is the decimal shift: from.exp - to.exp
  const expDiff = from.exp - to.exp;

  const fromUnit = from.sym + baseUnit;
  const toUnit = to.sym + baseUnit;

  const answerText = expDiffToConversion(expDiff);
  return {
    text: `${fromUnit} → ${toUnit}`,
    answer: answerText,
    answerText,
    opKey: "si",
    statsKey: `${from.sym || "base"},${to.sym || "base"}`,
  };
}

function shiftDecimalSimple(value, shift) {
  // Multiply value by 10^shift, return as string
  if (shift === 0) return String(value);
  if (shift > 0) {
    return String(value) + "0".repeat(shift);
  }
  // Negative shift: divide
  const str = String(value);
  const decPos = str.length + shift; // where decimal goes
  if (decPos <= 0) {
    return "0." + "0".repeat(-decPos) + str;
  }
  return str.slice(0, decPos) + "." + str.slice(decPos);
}

// ── Rectangle Perimeter & Area ──

function generateRectProblem(opKey) {
  const range = getDifficultyRange("rect", opConfig.rect.difficulty);
  const l = randInt(range.min, range.max);
  const w = randInt(range.min, range.max);
  const isPerimeter = Math.random() < 0.5;
  const answer = isPerimeter ? 2 * (l + w) : l * w;
  const prefix = isPerimeter ? "P" : "A";
  return {
    text: `${prefix}▭ ${l}×${w}`,
    answer,
    answerText: String(answer),
    opKey: "rect",
    statsKey: `${prefix},${l},${w}`,
  };
}

// ── Circle Circumference & Area (answers in terms of π) ──

function generateCircleProblem(opKey) {
  const range = getDifficultyRange("circ", opConfig.circ.difficulty);
  const subtypes = ["Cr", "Cd", "Ar", "Ad"];
  const subtype = subtypes[randInt(0, subtypes.length - 1)];
  const val = randInt(range.min, range.max);
  return generateCircleOfType(subtype, val);
}

function generateCircleOfType(subtype, val) {
  let answer, text, statsKey;

  if (subtype === "Cr") {
    answer = 2 * val;
    text = `C○ r=${val} =?π`;
    statsKey = `Cr,${val}`;
  } else if (subtype === "Cd") {
    answer = val;
    text = `C○ d=${val} =?π`;
    statsKey = `Cd,${val}`;
  } else if (subtype === "Ar") {
    answer = val * val;
    text = `A○ r=${val} =?π`;
    statsKey = `Ar,${val}`;
  } else {
    const r = val / 2;
    answer = r * r;
    text = `A○ d=${val} =?π`;
    statsKey = `Ad,${val}`;
  }

  const answerText = answer % 1 === 0 ? String(answer) : String(answer);
  return { text, answer, answerText, opKey: "circ", statsKey };
}

// ── Prime Factorization ──

function isPrime(n) {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

function isComposite(n) {
  return n >= 4 && !isPrime(n);
}

function getSmallestPrimeFactor(n) {
  if (n < 2) return null;
  if (n % 2 === 0) return 2;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return i;
  }
  return n; // n is prime
}

const SUPERSCRIPTS = {
  "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3",
  "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077",
  "8": "\u2078", "9": "\u2079",
};

function toSuperscript(n) {
  return String(n).split("").map((c) => SUPERSCRIPTS[c] || c).join("");
}

function formatFactorization(collected, remaining) {
  const parts = [];
  const primes = Object.keys(collected).map(Number).sort((a, b) => a - b);
  for (const p of primes) {
    const exp = collected[p];
    parts.push(exp === 1 ? String(p) : `${p}${toSuperscript(exp)}`);
  }
  if (remaining > 1) {
    parts.push(String(remaining));
  }
  return parts.join("·");
}

function formatFactorDropText(drop) {
  const orig = drop.factorOriginal;
  const collected = drop.factorCollected;
  const remaining = drop.factorRemaining;
  if (Object.keys(collected).length === 0) {
    return String(orig);
  }
  if (remaining <= 1) {
    // Complete — show full prime factorization
    return `${orig}=${formatFactorization(collected, 1)}`;
  }
  // In progress — factors so far, remaining separate
  return `${orig}=${formatFactorization(collected, 1)}·`;
}

function getFactorRemainingText(drop) {
  if (!drop.factorRemaining || drop.factorRemaining <= 1) return null;
  if (Object.keys(drop.factorCollected).length === 0) return null;
  return String(drop.factorRemaining);
}

function getFullFactorization(n) {
  const factors = {};
  let rem = n;
  for (let p = 2; p * p <= rem; p++) {
    while (rem % p === 0) {
      factors[p] = (factors[p] || 0) + 1;
      rem /= p;
    }
  }
  if (rem > 1) factors[rem] = (factors[rem] || 0) + 1;
  return formatFactorization(factors, 1);
}

function generateFactorProblem() {
  const range = getDifficultyRange("factor", opConfig.factor.difficulty);
  // Pick a random composite in range
  let attempts = 0;
  let n;
  do {
    n = randInt(range.min, range.max);
    attempts++;
  } while (!isComposite(n) && attempts < 50);
  if (!isComposite(n)) n = 12; // fallback

  return {
    text: String(n),
    answer: null, // multi-step, no single answer
    answerText: null,
    opKey: "factor",
    statsKey: String(n),
    factorOriginal: n,
    factorRemaining: n,
    factorCollected: {},
    factorLastPrime: null,
  };
}

function generateProblem(opKey) {
  const config = opConfig[opKey];
  const range = getDifficultyRange(opKey, config.difficulty);

  if (opKey === "factor") {
    return generateFactorProblem();
  }

  if (opKey === "rect") {
    return generateRectProblem(opKey);
  }

  if (opKey === "circ") {
    return generateCircleProblem(opKey);
  }

  if (opKey === "si") {
    return generateSIProblem(config.difficulty);
  }

  if (opKey === "f10") {
    return generateFactorsOfTenProblem(range.max);
  }

  const op = operators[opKey];
  let a = 0;
  let b = 0;
  let answer = 0;

  let statsKey;

  if (opKey === "div") {
    const quotient = randInt(range.min, range.max);
    b = randInt(range.min, range.max);
    a = quotient * b;
    answer = quotient;
    statsKey = `${quotient},${b}`;
  } else if (opKey === "sub") {
    a = randInt(range.min, range.max);
    b = randInt(range.min, range.max);
    if (b > a) {
      [a, b] = [b, a];
    }
    answer = op.fn(a, b);
    statsKey = `${a},${b}`;
  } else {
    a = randInt(range.min, range.max);
    b = randInt(range.min, range.max);
    answer = op.fn(a, b);
    statsKey = `${a},${b}`;
  }

  return {
    text: `${a} ${op.symbol} ${b}`,
    answer,
    answerText: String(answer),
    opKey,
    statsKey,
  };
}

function getMastery(opKey, statsKey) {
  const stats = problemStats[opKey];
  const entry = stats ? stats[statsKey] : null;
  if (!entry || entry.asked === 0) return 0;
  const confidence = Math.min(entry.asked, 10) / 10;
  const accuracy = entry.correct / entry.asked;
  return accuracy * confidence;
}

function getSelectionWeight(mastery) {
  return 1 - mastery * 0.8;
}

function weightedPick(items) {
  // items: [{ value, weight }]
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return items[Math.floor(Math.random() * items.length)].value;
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function generateWeightedProblem(opKey) {
  const config = opConfig[opKey];
  const range = getDifficultyRange(opKey, config.difficulty);

  if (opKey === "factor") {
    // Enumerate all composites in range, weight by mastery
    const composites = [];
    for (let n = range.min; n <= range.max; n++) {
      if (!isComposite(n)) continue;
      const key = String(n);
      const mastery = getMastery("factor", key);
      composites.push({ n, weight: getSelectionWeight(mastery) });
    }
    if (composites.length === 0) return generateFactorProblem();
    const pick = weightedPick(composites.map((c) => ({ value: c.n, weight: c.weight })));
    return {
      text: String(pick),
      answer: null,
      answerText: null,
      opKey: "factor",
      statsKey: String(pick),
      factorOriginal: pick,
      factorRemaining: pick,
      factorCollected: {},
      factorLastPrime: null,
    };
  }

  if (opKey === "rect") {
    // Enumerate all l×w pairs, both P and A variants
    const pairs = [];
    for (let l = range.min; l <= range.max; l++) {
      for (let w = range.min; w <= range.max; w++) {
        for (const prefix of ["P", "A"]) {
          const key = `${prefix},${l},${w}`;
          const mastery = getMastery("rect", key);
          pairs.push({ l, w, prefix, statsKey: key, weight: getSelectionWeight(mastery) });
        }
      }
    }
    if (pairs.length === 0) return generateProblem(opKey);
    const pick = weightedPick(pairs.map((p) => ({ value: p, weight: p.weight })));
    const answer = pick.prefix === "P" ? 2 * (pick.l + pick.w) : pick.l * pick.w;
    return {
      text: `${pick.prefix}▭ ${pick.l}×${pick.w}`,
      answer,
      answerText: String(answer),
      opKey: "rect",
      statsKey: pick.statsKey,
    };
  }

  if (opKey === "circ") {
    // Enumerate all 4 subtypes × each value
    const items = [];
    for (let v = range.min; v <= range.max; v++) {
      for (const sub of ["Cr", "Cd", "Ar", "Ad"]) {
        const key = `${sub},${v}`;
        const mastery = getMastery("circ", key);
        items.push({ sub, val: v, statsKey: key, weight: getSelectionWeight(mastery) });
      }
    }
    if (items.length === 0) return generateProblem(opKey);
    const pick = weightedPick(items.map((it) => ({ value: it, weight: it.weight })));
    return generateCircleOfType(pick.sub, pick.val);
  }

  if (opKey === "si") {
    // Enumerate all prefix pairs for this difficulty and weight by mastery
    const prefixes = getSIPrefixesForDifficulty(config.difficulty);
    const pairs = [];
    for (let i = 0; i < prefixes.length; i++) {
      for (let j = 0; j < prefixes.length; j++) {
        if (i === j) continue;
        const key = `${prefixes[i].sym || "base"},${prefixes[j].sym || "base"}`;
        const mastery = getMastery("si", key);
        pairs.push({ from: prefixes[i], to: prefixes[j], statsKey: key, weight: getSelectionWeight(mastery) });
      }
    }
    if (pairs.length === 0) return generateProblem(opKey);
    const pick = weightedPick(pairs.map((p) => ({ value: p, weight: p.weight })));
    const baseUnit = siBaseUnits[randInt(0, siBaseUnits.length - 1)];
    const expDiff = pick.from.exp - pick.to.exp;
    const answerText = expDiffToConversion(expDiff);
    return {
      text: `${pick.from.sym}${baseUnit} → ${pick.to.sym}${baseUnit}`,
      answer: answerText,
      answerText,
      opKey: "si",
      statsKey: pick.statsKey,
    };
  }

  if (opKey === "f10") {
    // f10 problem space is too dynamic; generate candidates and pick the weakest
    const candidates = [];
    for (let i = 0; i < 8; i++) {
      const problem = generateFactorsOfTenProblem(range.max);
      const mastery = getMastery("f10", problem.text);
      candidates.push({ problem, weight: getSelectionWeight(mastery) });
    }
    return weightedPick(candidates.map((c) => ({ value: c.problem, weight: c.weight })));
  }

  const op = operators[opKey];
  const pairs = [];

  for (let a = range.min; a <= range.max; a++) {
    for (let b = range.min; b <= range.max; b++) {
      let statsKey;
      if (opKey === "div") {
        statsKey = `${a},${b}`; // a=quotient, b=divisor
      } else if (opKey === "sub") {
        if (b > a) continue;
        statsKey = `${a},${b}`;
      } else {
        statsKey = `${a},${b}`;
      }
      const mastery = getMastery(opKey, statsKey);
      pairs.push({ a, b, statsKey, weight: getSelectionWeight(mastery) });
    }
  }

  if (pairs.length === 0) return generateProblem(opKey);

  const pick = weightedPick(pairs.map((p) => ({ value: p, weight: p.weight })));
  let dispA = pick.a;
  let dispB = pick.b;
  let answer;

  if (opKey === "div") {
    dispA = pick.a * pick.b; // quotient * divisor
    dispB = pick.b;
    answer = pick.a;
  } else if (opKey === "sub") {
    answer = op.fn(pick.a, pick.b);
  } else {
    answer = op.fn(pick.a, pick.b);
  }

  return {
    text: `${dispA} ${op.symbol} ${dispB}`,
    answer,
    answerText: String(answer),
    opKey,
    statsKey: pick.statsKey,
  };
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

// Parse a typed factorization like "2^4", "2*2*2*2", "2^2*3^2"
// Returns the prime factorization as { prime: exponent } or null if invalid
function parseFactorizationInput(value) {
  if (!value || !/^[0-9*^]+$/.test(value)) return null;
  const terms = value.split("*");
  const factors = {};
  for (const term of terms) {
    if (!term) return null;
    let base, exp;
    if (term.includes("^")) {
      const parts = term.split("^");
      if (parts.length !== 2) return null;
      base = Number(parts[0]);
      exp = Number(parts[1]);
      if (!Number.isInteger(base) || !Number.isInteger(exp)) return null;
      if (base < 2 || exp < 1) return null;
    } else {
      base = Number(term);
      exp = 1;
      if (!Number.isInteger(base) || base < 2) return null;
    }
    if (!isPrime(base)) return null;
    factors[base] = (factors[base] || 0) + exp;
  }
  return factors;
}

function factorizationProduct(factors) {
  let product = 1;
  for (const [prime, exp] of Object.entries(factors)) {
    product *= Math.pow(Number(prime), exp);
  }
  return product;
}

function matchesFactorDrop(value, drop) {
  const factors = parseFactorizationInput(value);
  if (!factors) return false;
  return factorizationProduct(factors) === drop.factorOriginal;
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

function handleCorrectAnswer(match) {
  clearAmbiguousTimer();
  if (factorTargetId === match.id) factorTargetId = null;
  recordProblemResult(match, true);
  score += 1;
  scoreEl.textContent = score;
  drops = drops.filter((d) => d.id !== match.id);
  createSplash(match);
  fireLaser(match);
  playPop();
  answerInput.value = "";
  currentInput = "";
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
      advanceFactorDrop(target, typedNum);
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

function advanceFactorDrop(drop, divisor) {
  drop.factorRemaining = drop.factorRemaining / divisor;

  // Decompose the divisor into primes and add to collected
  let d = divisor;
  for (let p = 2; p * p <= d; p++) {
    while (d % p === 0) {
      drop.factorCollected[p] = (drop.factorCollected[p] || 0) + 1;
      d /= p;
    }
  }
  if (d > 1) drop.factorCollected[d] = (drop.factorCollected[d] || 0) + 1;

  // If remaining is prime, auto-include it — factorization is complete
  if (drop.factorRemaining > 1 && isPrime(drop.factorRemaining)) {
    const r = drop.factorRemaining;
    drop.factorCollected[r] = (drop.factorCollected[r] || 0) + 1;
    drop.factorRemaining = 1;
  }

  drop.text = formatFactorDropText(drop);

  if (drop.factorRemaining <= 1) {
    drop.factorComplete = true;
  }
  playPop();
}

// ── Factor Targeting ──

function isInFactorTargetMode() {
  return factorTargetId !== null;
}

function getTargetedFactorDrop() {
  if (!factorTargetId) return null;
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
}

function exitFactorTargeting() {
  factorTargetId = null;
  answerInput.value = "";
  currentInput = "";
  answerInput.focus();
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
  scoreEl.textContent = score;
  if (isPaused) {
    togglePause();
  }
  answerInput.focus();
}

// Answer input handler
answerInput.addEventListener("input", (event) => {
  initAudio();
  const value = answerInput.value;

  // Prevent spaces
  if (value.includes(" ")) {
    answerInput.value = value.replace(/\s/g, "");
  }

  currentInput = answerInput.value;
  // In factor targeting mode, input is handled in keydown instead
  if (!isInFactorTargetMode()) {
    processInput(currentInput);
  }
});

// Input keydown for Enter (SI), Backspace clearing, factor targeting digits, and space prevention
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
  // In factor targeting mode, handle digit keys here (more reliable than input event)
  if (isInFactorTargetMode() && /^[0-9]$/.test(event.key)) {
    event.preventDefault();
    initAudio();
    currentInput = currentInput + event.key;
    answerInput.value = currentInput;
    processInput(currentInput);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (isPaused) return;

    // Exit targeting mode so typed factorization can be checked
    if (isInFactorTargetMode()) {
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

  // In factor targeting mode, handle digits when input doesn't have focus
  if (isInFactorTargetMode() && !isPaused && /^[0-9]$/.test(event.key)
      && document.activeElement !== answerInput) {
    event.preventDefault();
    answerInput.focus();
    initAudio();
    currentInput = currentInput + event.key;
    answerInput.value = currentInput;
    processInput(currentInput);
    return;
  }

  // Focus input on any printable character when not paused
  if (
    !isPaused &&
    document.activeElement !== answerInput &&
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    answerInput.focus();
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

// Canvas resize
window.addEventListener("resize", resizeCanvas);

// ============================================================
// 14. Initialization
// ============================================================

function init() {
  resizeCanvas();
  updateOpChits();
  updateDifficultyDisplays();
  updateSpeedDisplay();
  scoreEl.textContent = score;
  // Keep answer input always focused for typing but out of the tab order
  // so Tab cycles only: speed slider -> rate slider -> diff cards
  answerInput.tabIndex = -1;

  // Hide pause overlay initially (game starts running)
  if (pauseOverlayEl) {
    pauseOverlayEl.classList.add("hidden");
  }
  if (pauseBtn) {
    pauseBtn.textContent = "Pause";
  }

  answerInput.focus();
  requestAnimationFrame(tick);
}

init();
