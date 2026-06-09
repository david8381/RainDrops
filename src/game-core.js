(() => {
const operators = {
  add: { symbol: "+", fn: (a, b) => a + b },
  sub: { symbol: "-", fn: (a, b) => a - b },
  mul: { symbol: "×", fn: (a, b) => a * b },
  div: { symbol: "÷", fn: (a, b) => a / b },
};

const operationDefaults = {
  add: { enabled: false, difficulty: 3, symbol: "+", label: "+" },
  sub: { enabled: false, difficulty: 3, symbol: "-", label: "-" },
  mul: { enabled: false, difficulty: 3, symbol: "×", label: "×" },
  div: { enabled: false, difficulty: 3, symbol: "÷", label: "÷" },
  f10: { enabled: false, difficulty: 3, symbol: "×10", label: "x10" },
  si: { enabled: false, difficulty: 3, symbol: "SI", label: "SI" },
  rect: { enabled: false, difficulty: 3, symbol: "▭", label: "▭" },
  circ: { enabled: false, difficulty: 3, symbol: "○", label: "○" },
  factor: { enabled: false, difficulty: 3, symbol: "n!", label: "n!" },
};

function createDefaultOpConfig() {
  return Object.fromEntries(
    Object.entries(operationDefaults).map(([key, value]) => [key, { ...value }])
  );
}

function createProblemStats() {
  return Object.fromEntries(Object.keys(operationDefaults).map((key) => [key, {}]));
}

function resetProblemStats(problemStats) {
  for (const key of Object.keys(problemStats)) {
    problemStats[key] = {};
  }
}

function recordProblemResult(problemStats, drop, correct) {
  const stats = problemStats[drop.opKey];
  if (!stats) return;
  const key = drop.statsKey || drop.text;
  if (!stats[key]) stats[key] = { asked: 0, correct: 0 };
  stats[key].asked += 1;
  if (correct) stats[key].correct += 1;
}

function randInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
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

function getDifficultyRange(opKey, difficulty) {
  const d = clamp(1, 10, difficulty);
  const t = (d - 1) / 9;

  if (opKey === "add" || opKey === "sub") {
    return { min: 1, max: Math.round(lerp(3, 20, t)) };
  }

  if (opKey === "mul" || opKey === "div") {
    return { min: 1, max: Math.round(lerp(3, 12, t)) };
  }

  if (opKey === "f10") {
    return { min: 1, max: Math.round(lerp(3, 20, t)) };
  }

  if (opKey === "si") {
    return { min: 1, max: getSIPrefixesForDifficulty(d).length };
  }

  if (opKey === "rect") {
    return { min: 1, max: Math.round(lerp(3, 20, t)) };
  }

  if (opKey === "circ") {
    return { min: 1, max: Math.round(lerp(3, 12, t)) };
  }

  if (opKey === "factor") {
    return { min: 4, max: Math.round(lerp(16, 200, t)) };
  }

  return { min: 1, max: 10 };
}

function generateFactorsOfTenProblem(maxValue, difficulty = 3, rng = Math.random) {
  const factorPowers = difficulty <= 3 ? [1] : difficulty <= 6 ? [1, 2] : [1, 2, 3];
  const direction = rng() < 0.5 ? "mul" : "div";
  const power = factorPowers[randInt(0, factorPowers.length - 1, rng)];
  const factor = pow10(power);
  const decimalPlaces = difficulty <= 4 ? 1 : rng() < 0.7 ? 1 : 2;
  const maxMantissa = Math.max(10, maxValue * pow10(decimalPlaces + 2));
  const mantissa = randInt(10, maxMantissa, rng);
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

const siPrefixes = [
  { sym: "k", exp: 3, name: "kilo" },
  { sym: "", exp: 0, name: "base" },
  { sym: "c", exp: -2, name: "centi" },
  { sym: "m", exp: -3, name: "milli" },
  { sym: "h", exp: 2, name: "hecto" },
  { sym: "da", exp: 1, name: "deca" },
  { sym: "d", exp: -1, name: "deci" },
  { sym: "M", exp: 6, name: "mega" },
  { sym: "μ", exp: -6, name: "micro" },
  { sym: "G", exp: 9, name: "giga" },
  { sym: "n", exp: -9, name: "nano" },
  { sym: "T", exp: 12, name: "tera" },
  { sym: "p", exp: -12, name: "pico" },
];

function getSIPrefixesForDifficulty(difficulty) {
  const d = clamp(1, 10, difficulty);
  const thresholds = [1, 1, 2, 3, 5, 6, 6, 7, 7, 8, 8, 9, 9];
  return siPrefixes.filter((_, i) => d >= thresholds[i]);
}

const siBaseUnits = ["m", "g", "L"];

function expDiffToConversion(expDiff) {
  if (expDiff === 0) return "*1";
  const factor = Math.pow(10, Math.abs(expDiff));
  return expDiff > 0 ? `*${factor}` : `/${factor}`;
}

function generateSIProblem(difficulty, rng = Math.random) {
  const prefixes = getSIPrefixesForDifficulty(difficulty);
  if (prefixes.length < 2) return null;

  let fromIdx = randInt(0, prefixes.length - 1, rng);
  let toIdx = fromIdx;
  while (toIdx === fromIdx) {
    toIdx = randInt(0, prefixes.length - 1, rng);
  }

  const from = prefixes[fromIdx];
  const to = prefixes[toIdx];
  const baseUnit = siBaseUnits[randInt(0, siBaseUnits.length - 1, rng)];
  const expDiff = from.exp - to.exp;

  return {
    text: `${from.sym}${baseUnit} → ${to.sym}${baseUnit}`,
    answer: expDiffToConversion(expDiff),
    answerText: expDiffToConversion(expDiff),
    opKey: "si",
    statsKey: `${from.sym || "base"},${to.sym || "base"}`,
  };
}

function shiftDecimalSimple(value, shift) {
  if (shift === 0) return String(value);
  if (shift > 0) {
    return String(value) + "0".repeat(shift);
  }
  const str = String(value);
  const decPos = str.length + shift;
  if (decPos <= 0) {
    return "0." + "0".repeat(-decPos) + str;
  }
  return str.slice(0, decPos) + "." + str.slice(decPos);
}

function generateRectProblem(difficulty = 3, rng = Math.random) {
  const range = getDifficultyRange("rect", difficulty);
  const l = randInt(range.min, range.max, rng);
  const w = randInt(range.min, range.max, rng);
  const isPerimeter = rng() < 0.5;
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

function generateCircleProblem(difficulty = 3, rng = Math.random) {
  const range = getDifficultyRange("circ", difficulty);
  const subtypes = ["Cr", "Cd", "Ar", "Ad"];
  const subtype = subtypes[randInt(0, subtypes.length - 1, rng)];
  const val = randInt(range.min, range.max, rng);
  return generateCircleOfType(subtype, val);
}

function generateCircleOfType(subtype, val) {
  let answer;
  let text;
  let statsKey;

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

  return { text, answer, answerText: String(answer), opKey: "circ", statsKey };
}

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
  return n;
}

const SUPERSCRIPTS = {
  "0": "\u2070",
  "1": "\u00b9",
  "2": "\u00b2",
  "3": "\u00b3",
  "4": "\u2074",
  "5": "\u2075",
  "6": "\u2076",
  "7": "\u2077",
  "8": "\u2078",
  "9": "\u2079",
};

function toSuperscript(n) {
  return String(n)
    .split("")
    .map((c) => SUPERSCRIPTS[c] || c)
    .join("");
}

function formatFactorization(collected, remaining) {
  const parts = [];
  const primes = Object.keys(collected)
    .map(Number)
    .sort((a, b) => a - b);
  for (const p of primes) {
    const exp = collected[p];
    parts.push(exp === 1 ? String(p) : `${p}^${exp}`);
  }
  if (remaining > 1) {
    parts.push(String(remaining));
  }
  return parts.join("*");
}

function formatFactorDropText(drop) {
  const orig = drop.factorOriginal;
  const collected = drop.factorCollected;
  const remaining = drop.factorRemaining;
  if (Object.keys(collected).length === 0) {
    return String(orig);
  }
  if (remaining <= 1) {
    return `${orig}=${formatFactorization(collected, 1)}`;
  }
  return `${orig}=${formatFactorization(collected, 1)}*`;
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

function generateFactorProblem(difficulty = 3, rng = Math.random) {
  const range = getDifficultyRange("factor", difficulty);
  let attempts = 0;
  let n;
  do {
    n = randInt(range.min, range.max, rng);
    attempts += 1;
  } while (!isComposite(n) && attempts < 50);
  if (!isComposite(n)) n = 12;

  return {
    text: String(n),
    answer: null,
    answerText: null,
    opKey: "factor",
    statsKey: String(n),
    factorOriginal: n,
    factorRemaining: n,
    factorCollected: {},
    factorLastPrime: null,
  };
}

function generateProblem(opKey, opConfig, rng = Math.random) {
  const config = opConfig[opKey];
  const range = getDifficultyRange(opKey, config.difficulty);

  if (opKey === "factor") return generateFactorProblem(config.difficulty, rng);
  if (opKey === "rect") return generateRectProblem(config.difficulty, rng);
  if (opKey === "circ") return generateCircleProblem(config.difficulty, rng);
  if (opKey === "si") return generateSIProblem(config.difficulty, rng);
  if (opKey === "f10") return generateFactorsOfTenProblem(range.max, config.difficulty, rng);

  const op = operators[opKey];
  let a = 0;
  let b = 0;
  let answer = 0;
  let statsKey;

  if (opKey === "div") {
    const quotient = randInt(range.min, range.max, rng);
    b = randInt(range.min, range.max, rng);
    a = quotient * b;
    answer = quotient;
    statsKey = `${quotient},${b}`;
  } else if (opKey === "sub") {
    a = randInt(range.min, range.max, rng);
    b = randInt(range.min, range.max, rng);
    if (b > a) [a, b] = [b, a];
    answer = op.fn(a, b);
    statsKey = `${a},${b}`;
  } else {
    a = randInt(range.min, range.max, rng);
    b = randInt(range.min, range.max, rng);
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

function getMastery(problemStats, opKey, statsKey) {
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

function weightedPick(items, rng = Math.random) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return items[Math.floor(rng() * items.length)].value;
  let roll = rng() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function generateWeightedProblem(opKey, opConfig, problemStats, rng = Math.random) {
  const config = opConfig[opKey];
  const range = getDifficultyRange(opKey, config.difficulty);

  if (opKey === "factor") {
    const composites = [];
    for (let n = range.min; n <= range.max; n += 1) {
      if (!isComposite(n)) continue;
      const key = String(n);
      const mastery = getMastery(problemStats, "factor", key);
      composites.push({ n, weight: getSelectionWeight(mastery) });
    }
    if (composites.length === 0) return generateFactorProblem(config.difficulty, rng);
    const pick = weightedPick(
      composites.map((c) => ({ value: c.n, weight: c.weight })),
      rng
    );
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
    const pairs = [];
    for (let l = range.min; l <= range.max; l += 1) {
      for (let w = range.min; w <= range.max; w += 1) {
        for (const prefix of ["P", "A"]) {
          const key = `${prefix},${l},${w}`;
          const mastery = getMastery(problemStats, "rect", key);
          pairs.push({ l, w, prefix, statsKey: key, weight: getSelectionWeight(mastery) });
        }
      }
    }
    if (pairs.length === 0) return generateProblem(opKey, opConfig, rng);
    const pick = weightedPick(
      pairs.map((p) => ({ value: p, weight: p.weight })),
      rng
    );
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
    const items = [];
    for (let v = range.min; v <= range.max; v += 1) {
      for (const sub of ["Cr", "Cd", "Ar", "Ad"]) {
        const key = `${sub},${v}`;
        const mastery = getMastery(problemStats, "circ", key);
        items.push({ sub, val: v, statsKey: key, weight: getSelectionWeight(mastery) });
      }
    }
    if (items.length === 0) return generateProblem(opKey, opConfig, rng);
    const pick = weightedPick(
      items.map((it) => ({ value: it, weight: it.weight })),
      rng
    );
    return generateCircleOfType(pick.sub, pick.val);
  }

  if (opKey === "si") {
    const prefixes = getSIPrefixesForDifficulty(config.difficulty);
    const pairs = [];
    for (let i = 0; i < prefixes.length; i += 1) {
      for (let j = 0; j < prefixes.length; j += 1) {
        if (i === j) continue;
        const key = `${prefixes[i].sym || "base"},${prefixes[j].sym || "base"}`;
        const mastery = getMastery(problemStats, "si", key);
        pairs.push({
          from: prefixes[i],
          to: prefixes[j],
          statsKey: key,
          weight: getSelectionWeight(mastery),
        });
      }
    }
    if (pairs.length === 0) return generateProblem(opKey, opConfig, rng);
    const pick = weightedPick(
      pairs.map((p) => ({ value: p, weight: p.weight })),
      rng
    );
    const baseUnit = siBaseUnits[randInt(0, siBaseUnits.length - 1, rng)];
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
    const candidates = [];
    for (let i = 0; i < 8; i += 1) {
      const problem = generateFactorsOfTenProblem(range.max, config.difficulty, rng);
      const mastery = getMastery(problemStats, "f10", problem.text);
      candidates.push({ problem, weight: getSelectionWeight(mastery) });
    }
    return weightedPick(
      candidates.map((c) => ({ value: c.problem, weight: c.weight })),
      rng
    );
  }

  const op = operators[opKey];
  const pairs = [];

  for (let a = range.min; a <= range.max; a += 1) {
    for (let b = range.min; b <= range.max; b += 1) {
      let statsKey;
      if (opKey === "div") {
        statsKey = `${a},${b}`;
      } else if (opKey === "sub") {
        if (b > a) continue;
        statsKey = `${a},${b}`;
      } else {
        statsKey = `${a},${b}`;
      }
      const mastery = getMastery(problemStats, opKey, statsKey);
      pairs.push({ a, b, statsKey, weight: getSelectionWeight(mastery) });
    }
  }

  if (pairs.length === 0) return generateProblem(opKey, opConfig, rng);

  const pick = weightedPick(
    pairs.map((p) => ({ value: p, weight: p.weight })),
    rng
  );
  let dispA = pick.a;
  let dispB = pick.b;
  let answer;

  if (opKey === "div") {
    dispA = pick.a * pick.b;
    dispB = pick.b;
    answer = pick.a;
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

function parseFactorizationInput(value) {
  if (!value || !/^[0-9*^]+$/.test(value)) return null;
  const terms = value.split("*");
  const factors = {};
  for (const term of terms) {
    if (!term) return null;
    let base;
    let exp;
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

function advanceFactorDrop(drop, divisor, { fromTargeting = false } = {}) {
  drop.factorRemaining /= divisor;

  let d = divisor;
  for (let p = 2; p * p <= d; p += 1) {
    while (d % p === 0) {
      drop.factorCollected[p] = (drop.factorCollected[p] || 0) + 1;
      d /= p;
    }
  }
  if (d > 1) drop.factorCollected[d] = (drop.factorCollected[d] || 0) + 1;

  if (!fromTargeting && drop.factorRemaining > 1 && isPrime(drop.factorRemaining)) {
    const r = drop.factorRemaining;
    drop.factorCollected[r] = (drop.factorCollected[r] || 0) + 1;
    drop.factorRemaining = 1;
  }

  drop.text = formatFactorDropText(drop);

  if (drop.factorRemaining <= 1) {
    drop.factorComplete = true;
  }

  return drop;
}

globalThis.RainMathCore = {
  SUPERSCRIPTS,
  advanceFactorDrop,
  clamp,
  createDefaultOpConfig,
  createProblemStats,
  expDiffToConversion,
  factorizationProduct,
  formatFactorDropText,
  formatFactorization,
  formatFixedScale,
  generateCircleOfType,
  generateCircleProblem,
  generateFactorProblem,
  generateFactorsOfTenProblem,
  generateProblem,
  generateRectProblem,
  generateSIProblem,
  generateWeightedProblem,
  getDifficultyRange,
  getFactorRemainingText,
  getFullFactorization,
  getMastery,
  getSIPrefixesForDifficulty,
  getSelectionWeight,
  getSmallestPrimeFactor,
  isComposite,
  isPrime,
  lerp,
  matchesFactorDrop,
  normalizeTypedValue,
  operationDefaults,
  operators,
  parseFactorizationInput,
  pow10,
  randInt,
  recordProblemResult,
  resetProblemStats,
  shiftDecimal,
  shiftDecimalSimple,
  siBaseUnits,
  siPrefixes,
  toSuperscript,
  weightedPick,
};
})();
