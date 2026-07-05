import { TRACKS } from "./curriculum.js";

const operators = {
  add: { symbol: "+", fn: (a, b) => a + b },
  sub: { symbol: "-", fn: (a, b) => a - b },
  mul: { symbol: "×", fn: (a, b) => a * b },
  div: { symbol: "÷", fn: (a, b) => a / b },
};

const operationDefaults = {
  add: { enabled: false, difficulty: 1, symbol: "+", label: "+" },
  sub: { enabled: false, difficulty: 1, symbol: "-", label: "-" },
  mul: { enabled: false, difficulty: 1, symbol: "×", label: "×" },
  div: { enabled: false, difficulty: 1, symbol: "÷", label: "÷" },
  f10: { enabled: false, difficulty: 1, symbol: "×10", label: "x10" },
  round: { enabled: false, difficulty: 1, symbol: "≈", label: "≈" },
  reduce: { enabled: false, difficulty: 1, symbol: "½", label: "½" },
  si: { enabled: false, difficulty: 1, symbol: "SI", label: "SI" },
  shapes: { enabled: false, difficulty: 1, symbol: "▱", label: "▱" },
  pow: { enabled: false, difficulty: 1, symbol: "xⁿ", label: "xⁿ" },
  factor: { enabled: false, difficulty: 1, symbol: "n!", label: "n!" },
};

/** @returns {import('./types.js').OpConfig} */
function createDefaultOpConfig() {
  return /** @type {import('./types.js').OpConfig} */ (
    Object.fromEntries(
      Object.entries(operationDefaults).map(([key, value]) => [key, { ...value }])
    )
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

const DEFAULT_TRACK_MAX_LEVEL = 10;

function rangeValues(spec) {
  if (Number.isFinite(spec)) return [Math.round(spec)];
  if (Array.isArray(spec)) {
    return [...new Set(spec.filter(Number.isFinite).map((value) => Math.round(value)))];
  }
  if (spec && typeof spec === "object") {
    if (Array.isArray(spec.values)) return rangeValues(spec.values);
    if (Number.isFinite(spec.value)) return [Math.round(spec.value)];
    if (Number.isFinite(spec.from) && Number.isFinite(spec.to)) {
      const from = Math.round(spec.from);
      const to = Math.round(spec.to);
      const step = Math.max(1, Math.round(Number.isFinite(spec.step) ? Math.abs(spec.step) : 1));
      const values = [];
      if (from <= to) {
        for (let value = from; value <= to; value += step) values.push(value);
      } else {
        for (let value = from; value >= to; value -= step) values.push(value);
      }
      return values;
    }
  }
  return [];
}

function levelFromDescriptor(desc, level) {
  if (!desc || !Array.isArray(desc.levels) || desc.levels.length === 0) return null;
  const index = clamp(1, desc.levels.length, Math.round(level || 1)) - 1;
  return desc.levels[index] || null;
}

function getTrackOpMaxLevel(opKey, track = TRACKS.standard) {
  const desc = track?.[opKey];
  if (Array.isArray(desc?.levels) && desc.levels.length > 0) return desc.levels.length;
  if (typeof desc?.maxLevel === "number") return Math.max(1, Math.round(desc.maxLevel));
  return DEFAULT_TRACK_MAX_LEVEL;
}

function arithmeticLevelPairsFromSpec(opKey, spec) {
  if (!spec || !operators[opKey]) return [];
  const rawPairs = [];
  if (Array.isArray(spec.pairs)) {
    for (const pair of spec.pairs) {
      const a = Array.isArray(pair) ? pair[0] : pair?.a;
      const b = Array.isArray(pair) ? pair[1] : pair?.b;
      if (Number.isFinite(a) && Number.isFinite(b)) rawPairs.push({ a: Math.round(a), b: Math.round(b) });
    }
  } else {
    const aValues = rangeValues(spec.a ?? spec.left ?? spec.multiplicand ?? spec.quotient);
    const bValues = rangeValues(spec.b ?? spec.right ?? spec.multiplier ?? spec.divisor);
    for (const a of aValues) {
      for (const b of bValues) rawPairs.push({ a, b });
    }
  }

  const seen = new Set();
  const pairs = [];
  for (const pair of rawPairs) {
    let { a, b } = pair;
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    if (opKey === "sub" && b > a) continue;
    if (opKey === "div" && b === 0) continue;
    const statsKey = `${a},${b}`;
    if (seen.has(statsKey)) continue;
    seen.add(statsKey);
    pairs.push({ a, b, statsKey });
  }
  return pairs;
}

function getArithmeticLevelSpec(opKey, level, track = TRACKS.standard) {
  const desc = track?.[opKey];
  if (desc?.kind === "arithmeticLevels") return levelFromDescriptor(desc, level);
  if (desc?.kind === "timesTable") {
    const n = clamp(1, desc.maxLevel, Math.round(level || 1));
    return { a: n, b: { from: 1, to: desc.factors } };
  }
  return null;
}

function getArithmeticLevelPairs(opKey, level, track = TRACKS.standard) {
  const spec = getArithmeticLevelSpec(opKey, level, track);
  if (!spec) return null;
  return arithmeticLevelPairsFromSpec(opKey, spec);
}

function getArithmeticPairRange(pairs) {
  if (!pairs || pairs.length === 0) return { min: 1, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const { a, b } of pairs) {
    min = Math.min(min, a, b);
    max = Math.max(max, a, b);
  }
  return { min, max };
}

function makeArithmeticProblemFromPair(opKey, pair) {
  const op = operators[opKey];
  let dispA = pair.a;
  let dispB = pair.b;
  let answer;

  if (opKey === "div") {
    dispA = pair.a * pair.b;
    dispB = pair.b;
    answer = pair.a;
  } else {
    answer = op.fn(pair.a, pair.b);
  }

  return {
    text: `${dispA} ${op.symbol} ${dispB}`,
    answer,
    answerText: String(answer),
    opKey,
    statsKey: pair.statsKey || `${pair.a},${pair.b}`,
  };
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

// Parse a typed answer to a number, accepting either a decimal (4.5) or a simple
// fraction (9/2 → 4.5). Returns NaN for incomplete/invalid input. Lets players
// answer half-value problems (e.g. triangle area b·h/2) as a fraction.
function parseNumericAnswer(value) {
  const str = String(value == null ? "" : value).trim();
  if (!str) return NaN;
  const frac = str.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    const denom = Number(frac[2]);
    if (denom === 0) return NaN;
    return Number(frac[1]) / denom;
  }
  if (/^-?\d*\.?\d+$/.test(str)) return Number(str);
  return NaN;
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

function getDifficultyRange(opKey, difficulty, track = TRACKS.standard) {
  const maxLevel = getTrackOpMaxLevel(opKey, track);
  const d = clamp(1, maxLevel, difficulty);
  const t = maxLevel <= 1 ? 0 : (d - 1) / (maxLevel - 1);
  const desc = track?.[opKey];

  if (opKey === "add" || opKey === "sub" || opKey === "mul" || opKey === "div") {
    const pairs = getArithmeticLevelPairs(opKey, difficulty, track);
    if (pairs) return getArithmeticPairRange(pairs);
    const r = desc?.kind === "range" ? desc : TRACKS.standard[opKey];
    return { min: r.min, max: Math.round(lerp(r.maxLo, r.maxHi, t)) };
  }

  if (opKey === "f10") {
    return { min: 1, max: (desc ?? TRACKS.standard.f10).maxDigits };
  }

  if (opKey === "round") {
    return { min: 1, max: (desc ?? TRACKS.standard.round).maxLevel };
  }

  if (opKey === "reduce") {
    return { min: 1, max: (desc ?? TRACKS.standard.reduce).maxLevel };
  }

  if (opKey === "si") {
    return { min: 1, max: getSIPrefixesForDifficulty(d, track).length };
  }

  if (opKey === "shapes") {
    const s = desc ?? TRACKS.standard.shapes;
    return { min: s.dimMin, max: s.dimMax };
  }

  if (opKey === "pow") {
    return { min: 1, max: (desc ?? TRACKS.standard.pow).maxLevel };
  }

  if (opKey === "factor") {
    const f = desc ?? TRACKS.standard.factor;
    return { min: f.minN, max: f.maxN };
  }

  return { min: 1, max: 10 };
}

// Factors-of-10 difficulty is structural, not number-specific. A "problem type"
// is (significant digits, power of 10, ×/÷); the concrete number is random, so
// mastery accrues per type rather than per value. difficulty = digits + power - 1,
// and a level holds every type with digits + power - 1 <= level (cumulative).
function f10TypesForLevel(level, track = TRACKS.standard) {
  const { maxDigits, maxPower } = track.f10 ?? TRACKS.standard.f10;
  const lvl = clamp(1, 99, Math.round(level || 1));
  const types = [];
  for (let digits = 1; digits <= maxDigits; digits += 1) {
    for (let power = 1; power <= maxPower; power += 1) {
      if (digits + power - 1 > lvl) continue;
      for (const dir of ["mul", "div"]) {
        types.push({ digits, power, dir, statsKey: `${dir},${digits},${power}` });
      }
    }
  }
  return types;
}

function f10TypeFromKey(statsKey) {
  const [dir, digits, power] = statsKey.split(",");
  return { dir, digits: Number(digits), power: Number(power), statsKey };
}

function f10TypeLabel(type) {
  const digitWord = type.digits === 1 ? "1-digit" : `${type.digits}-digit`;
  return `${digitWord} ${type.dir === "mul" ? "×" : "÷"}${pow10(type.power)}`;
}

function formatF10StatsKey(statsKey) {
  return f10TypeLabel(f10TypeFromKey(statsKey));
}

function makeFactorsOfTenProblem(type, rng = Math.random) {
  const { digits, power, dir } = type;
  const min = digits === 1 ? 1 : pow10(digits - 1);
  const max = pow10(digits) - 1;
  const mantissa = randInt(min, max, rng);
  const operandExp = -randInt(0, digits, rng); // random decimal placement
  const operandText = shiftDecimalSimple(mantissa, operandExp);
  const answerExp = operandExp + (dir === "mul" ? power : -power);
  const answerText = shiftDecimalSimple(mantissa, answerExp);
  return {
    text: `${operandText} ${dir === "mul" ? "×" : "÷"} ${pow10(power)}`,
    answer: Number(answerText),
    answerText,
    opKey: "f10",
    statsKey: type.statsKey,
  };
}

function makeF10ProblemFromKey(statsKey, rng = Math.random) {
  return makeFactorsOfTenProblem(f10TypeFromKey(statsKey), rng);
}

function getF10Universe(level, track = TRACKS.standard) {
  return f10TypesForLevel(level, track).map((type) => ({ statsKey: type.statsKey, text: f10TypeLabel(type) }));
}

function generateFactorsOfTenProblem(difficulty = 1, rng = Math.random, track = TRACKS.standard) {
  const types = f10TypesForLevel(difficulty, track);
  return makeFactorsOfTenProblem(types[randInt(0, types.length - 1, rng)], rng);
}

// Rounding & estimation. Like factors-of-10, mastery is per conceptual bucket
// rather than per literal number. Here each bucket is a rounding case (down,
// up, half, zero, carry) scoped to a level's place and size relationship.
const ROUND_PLACES = {
  ten: 10,
  hundred: 100,
  thousand: 1000,
  tenth: 0.1,
  hundredth: 0.01,
  thousandth: 0.001,
};

const ROUND_RELATION_LABELS = {
  norm: "normal",
  big: "larger numbers",
  cross: "crossing to 0/one unit",
  extra: "extra precision",
  mix: "mixed review",
};

const ROUND_CASE_LABELS = {
  down: "round down",
  up: "round up",
  half: "half rounds up",
  zero: "already rounded",
  carry: "carry to next place",
};

function countDecimalPlaces(value) {
  const str = String(value);
  if (!str.includes(".")) return 0;
  return str.split(".")[1].replace(/0+$/, "").length;
}

function formatDecimal(value, decimals) {
  if (decimals <= 0) return String(Math.round(value));
  return Number(value.toFixed(decimals)).toString();
}

function formatRoundPlace(place) {
  return formatDecimal(place, countDecimalPlaces(place));
}

function roundToPlace(value, place) {
  const decimals = countDecimalPlaces(place);
  const quotient = value / place;
  const rounded = Math.floor(quotient + 0.5 + 1e-10) * place;
  return Number(formatDecimal(rounded, decimals));
}

function roundTypeStatsKey(type) {
  return `r:${type.placeKey}:${type.relation}:${type.caseName}`;
}

function roundTypeFromKey(statsKey) {
  return allRoundTypes().find((type) => type.statsKey === String(statsKey)) || null;
}

function makeRoundType(placeKey, relation, caseName, minValue, maxValue, inputDecimals = 0) {
  const place = ROUND_PLACES[placeKey];
  const scale = pow10(inputDecimals);
  const type = {
    placeKey,
    place,
    relation,
    caseName,
    inputDecimals,
    minUnits: Math.round(minValue * scale),
    maxUnits: Math.round(maxValue * scale),
  };
  return { ...type, statsKey: roundTypeStatsKey(type) };
}

function roundLevelSpecs(level, track = TRACKS.standard) {
  // Level N → levelSpecs[N-1]; the last entry doubles as the level-maxLevel
  // block (callers clamp `level` to [1, maxLevel] before calling).
  const { levelSpecs } = track.round ?? TRACKS.standard.round;
  const last = levelSpecs.length - 1;
  return level >= 1 && level <= last ? levelSpecs[level - 1] : levelSpecs[last];
}

function makeRoundTypesFromSpecs(specs) {
  return specs.flatMap(([placeKey, relation, cases, minValue, maxValue, decimals]) =>
    cases.map((caseName) => makeRoundType(placeKey, relation, caseName, minValue, maxValue, decimals))
  );
}

function roundTypesForLevel(level, track = TRACKS.standard) {
  const { maxLevel } = track.round ?? TRACKS.standard.round;
  const lvl = clamp(1, maxLevel, Math.round(level || 1));
  return makeRoundTypesFromSpecs(roundLevelSpecs(lvl, track));
}

function allRoundTypes() {
  const byKey = new Map();
  const { maxLevel } = TRACKS.standard.round;
  for (let level = 1; level <= maxLevel; level += 1) {
    for (const type of roundTypesForLevel(level)) {
      byKey.set(type.statsKey, type);
    }
  }
  return [...byKey.values()];
}

function roundTypeLabel(type) {
  const relation = ROUND_RELATION_LABELS[type.relation] || type.relation;
  const caseLabel = ROUND_CASE_LABELS[type.caseName] || type.caseName;
  return `nearest ${formatRoundPlace(type.place)} · ${relation} · ${caseLabel}`;
}

function roundCaseMatches(units, type) {
  const scale = pow10(type.inputDecimals);
  const placeUnits = Math.round(type.place * scale);
  const remainder = ((units % placeUnits) + placeUnits) % placeUnits;
  const quotient = Math.floor(units / placeUnits);
  const half = placeUnits / 2;
  const isCarry = quotient % 10 === 9 && remainder > half;

  if (type.relation === "cross" && !(units > 0 && units < placeUnits)) return false;
  if (type.relation !== "cross" && units < placeUnits) return false;

  if (type.caseName === "zero") return remainder === 0;
  if (type.caseName === "half") return remainder === half;
  if (type.caseName === "carry") return isCarry;
  if (type.caseName === "down") return remainder > 0 && remainder < half;
  if (type.caseName === "up") return remainder > half && !isCarry;
  return false;
}

function sampleRoundInput(type, rng = Math.random) {
  let units = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const candidate = randInt(type.minUnits, type.maxUnits, rng);
    if (roundCaseMatches(candidate, type)) {
      units = candidate;
      break;
    }
  }
  if (units === null) {
    for (let candidate = type.minUnits; candidate <= type.maxUnits; candidate += 1) {
      if (roundCaseMatches(candidate, type)) {
        units = candidate;
        break;
      }
    }
  }
  if (units === null) throw new Error(`No constructible rounding sample for ${type.statsKey}`);

  const value = units / pow10(type.inputDecimals);
  return {
    value,
    text: type.inputDecimals > 0 ? formatFixedScale(units, type.inputDecimals) : String(units),
  };
}

function makeRoundProblem(type, rng = Math.random) {
  const sample = sampleRoundInput(type, rng);
  const inputText = sample.text || String(sample.value);
  const placeText = formatRoundPlace(type.place);
  const answer = roundToPlace(sample.value, type.place);
  const answerText = formatDecimal(answer, countDecimalPlaces(type.place));
  return {
    text: `${inputText} ≈ ${placeText}`,
    answer,
    answerText,
    opKey: "round",
    statsKey: type.statsKey,
  };
}

function makeRoundProblemFromKey(statsKey, rng = Math.random) {
  const type = roundTypeFromKey(statsKey);
  if (!type) return makeRoundProblem(roundTypesForLevel(1)[0], rng);
  return makeRoundProblem(type, rng);
}

function getRoundUniverse(level, track = TRACKS.standard) {
  return roundTypesForLevel(level, track).map((type) => ({ statsKey: type.statsKey, text: roundTypeLabel(type) }));
}

function generateRoundProblem(difficulty = 1, rng = Math.random, track = TRACKS.standard) {
  const types = roundTypesForLevel(difficulty, track);
  return makeRoundProblem(types[randInt(0, types.length - 1, rng)], rng);
}

function getSIPrefixesForDifficulty(difficulty, track = TRACKS.standard) {
  const { prefixes, thresholds } = track.si ?? TRACKS.standard.si;
  const d = clamp(1, 10, difficulty);
  return prefixes.filter((_, i) => d >= thresholds[i]);
}

// Display rows for the SI "Prefix Reference" table: all prefixes in descending
// exponent order, each with its base-10 (superscript) and readable factor
// strings, plus whether it is unlocked at the given difficulty. Pure data so
// the renderer in script.js stays a thin DOM loop.
function getSIReferenceRows(difficulty, track = TRACKS.standard) {
  const { prefixes } = track.si ?? TRACKS.standard.si;
  const activeSyms = new Set(getSIPrefixesForDifficulty(difficulty, track).map((p) => p.sym));
  return prefixes
    .slice()
    .sort((a, b) => b.exp - a.exp)
    .map((p) => {
      const absExp = Math.abs(p.exp);
      const factor =
        p.exp >= 0
          ? Number(Math.pow(10, p.exp)).toLocaleString("en-US")
          : "1/" + Number(Math.pow(10, absExp)).toLocaleString("en-US");
      return {
        sym: p.sym,
        exp: p.exp,
        name: p.exp === 0 ? "(base)" : p.name,
        base10: `10${toSuperscript(p.exp)}`,
        factor,
        active: activeSyms.has(p.sym),
      };
    });
}

const siBaseUnits = ["m", "g", "L"];

function expDiffToConversion(expDiff) {
  if (expDiff === 0) return "*1";
  const factor = Math.pow(10, Math.abs(expDiff));
  return expDiff > 0 ? `*${factor}` : `/${factor}`;
}

function generateSIProblem(difficulty, rng = Math.random, track = TRACKS.standard) {
  const prefixes = getSIPrefixesForDifficulty(difficulty, track);
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

// ── Shapes (geometry) ─────────────────────────────────────────────
// One operation whose level gates which shapes appear (cumulative), focused on
// knowing the formulas rather than big-number arithmetic, so dimensions stay
// small. Round shapes (circle) answer as the coefficient of π, like before.
// Shapes gate + bounds live in TRACKS.standard.shapes; the per-shape enumeration
// (below) and formulas stay here as the generation strategy.
function shapesActiveDefs(level, track = TRACKS.standard) {
  const { defs } = track.shapes ?? TRACKS.standard.shapes;
  const cap = clamp(1, defs.length, Math.round(level || 1));
  return defs.filter((def) => def.level <= cap);
}

function makeShapeProblem(shapeId, metric, dims) {
  let answer;
  let text;
  if (shapeId === "sq") {
    answer = metric === "A" ? dims[0] * dims[0] : 4 * dims[0];
    text = `${metric}□ s=${dims[0]}`;
  } else if (shapeId === "rect") {
    answer = metric === "A" ? dims[0] * dims[1] : 2 * (dims[0] + dims[1]);
    text = `${metric}▭ ${dims[0]}×${dims[1]}`;
  } else if (shapeId === "tri") {
    if (metric === "A") {
      answer = (dims[0] * dims[1]) / 2;
      text = `A△ b=${dims[0]} h=${dims[1]}`;
    } else {
      answer = dims[0] + dims[1] + dims[2];
      text = `P△ ${dims[0]},${dims[1]},${dims[2]}`;
    }
  } else if (shapeId === "cir") {
    // circle — answer is the coefficient of π
    answer = metric === "A" ? dims[0] * dims[0] : 2 * dims[0];
    text = `${metric}○ r=${dims[0]} =?π`;
  } else if (shapeId === "cube") {
    answer = metric === "SA" ? 6 * dims[0] * dims[0] : dims[0] * dims[0] * dims[0];
    text = `${metric} cube s=${dims[0]}`;
  } else if (shapeId === "rprism") {
    const [l, w, h] = dims;
    answer = metric === "SA" ? 2 * (l * w + l * h + w * h) : l * w * h;
    text = `${metric} box ${l}×${w}×${h}`;
  } else if (shapeId === "cyl") {
    const [r, h] = dims;
    answer = metric === "SA" ? 2 * r * (r + h) : r * r * h; // π coefficient
    text = `${metric} cyl r=${r} h=${h} =?π`;
  } else {
    // sphere — π coefficient (SA = 4r², V = 4r³/3)
    answer = metric === "SA" ? 4 * dims[0] * dims[0] : (4 * dims[0] * dims[0] * dims[0]) / 3;
    text = `${metric} sphere r=${dims[0]} =?π`;
  }
  return {
    text,
    answer,
    answerText: String(answer),
    opKey: "shapes",
    statsKey: `${shapeId},${metric},${dims.join(",")}`,
  };
}

// Only integer or half answers (and integer π-coefficients) are kept, so the
// player never has to type a non-terminating value like 4/3·r³ for r=2.
function isCleanShapeAnswer(answer) {
  return Number.isInteger(answer * 2);
}

function pushShapeProblem(problems, shapeId, metric, dims) {
  const problem = makeShapeProblem(shapeId, metric, dims);
  if (isCleanShapeAnswer(problem.answer)) problems.push(problem);
}

function makeShapeProblemFromKey(statsKey) {
  const [shapeId, metric, ...dimStrs] = statsKey.split(",");
  return makeShapeProblem(shapeId, metric, dimStrs.map(Number));
}

function getShapesUniverse(level, track = TRACKS.standard) {
  const { dimMin, dimMax, d3Max, sphereMax } = track.shapes ?? TRACKS.standard.shapes;
  const problems = [];
  for (const def of shapesActiveDefs(level, track)) {
    if (def.id === "sq") {
      for (let s = dimMin; s <= dimMax; s += 1) {
        for (const metric of ["P", "A"]) pushShapeProblem(problems, "sq", metric, [s]);
      }
    } else if (def.id === "rect") {
      for (let l = dimMin; l <= dimMax; l += 1) {
        for (let w = l; w <= dimMax; w += 1) {
          for (const metric of ["P", "A"]) pushShapeProblem(problems, "rect", metric, [l, w]);
        }
      }
    } else if (def.id === "tri") {
      for (let b = dimMin; b <= dimMax; b += 1) {
        for (let h = b; h <= dimMax; h += 1) pushShapeProblem(problems, "tri", "A", [b, h]);
      }
      for (let a = dimMin; a <= dimMax; a += 1) {
        for (let b = a; b <= dimMax; b += 1) {
          for (let c = b; c <= dimMax; c += 1) {
            if (a + b > c) pushShapeProblem(problems, "tri", "P", [a, b, c]);
          }
        }
      }
    } else if (def.id === "cir") {
      for (let r = dimMin; r <= dimMax; r += 1) {
        for (const metric of ["C", "A"]) pushShapeProblem(problems, "cir", metric, [r]);
      }
    } else if (def.id === "cube") {
      for (let s = dimMin; s <= dimMax; s += 1) {
        for (const metric of ["SA", "V"]) pushShapeProblem(problems, "cube", metric, [s]);
      }
    } else if (def.id === "rprism") {
      for (let l = dimMin; l <= d3Max; l += 1) {
        for (let w = l; w <= d3Max; w += 1) {
          for (let h = w; h <= d3Max; h += 1) {
            for (const metric of ["SA", "V"]) pushShapeProblem(problems, "rprism", metric, [l, w, h]);
          }
        }
      }
    } else if (def.id === "cyl") {
      for (let r = dimMin; r <= d3Max; r += 1) {
        for (let h = dimMin; h <= d3Max; h += 1) {
          for (const metric of ["SA", "V"]) pushShapeProblem(problems, "cyl", metric, [r, h]);
        }
      }
    } else {
      // sphere — radius up to sphereMax so the divisible-by-3 volumes have variety
      for (let r = dimMin; r <= sphereMax; r += 1) {
        for (const metric of ["SA", "V"]) pushShapeProblem(problems, "sph", metric, [r]);
      }
    }
  }
  return problems;
}

function generateShapesProblem(difficulty = 1, rng = Math.random, track = TRACKS.standard) {
  const universe = getShapesUniverse(difficulty, track);
  return universe[randInt(0, universe.length - 1, rng)];
}

// ── Powers & Roots ────────────────────────────────────────────────
// One level-gated, cumulative operation. Each level adds a family of powers or
// roots; the level ladder is ordered easy→hard and tops out at level 10 (the
// hardest, negative powers of 10). All answers are whole numbers or clean
// terminating decimals, so they clear immediately like ordinary arithmetic.
// The level ladder lives in TRACKS.standard.pow; makePowProblem (below) is the
// shared rendering strategy.

// Builds a power/root problem. Roots always use perfect powers so answers stay
// whole. Kinds: sq (x²), cube (x³), sqrt (√x²→x), cbrt (∛x³→x), pow (base^exp),
// neg10 (10⁻ᵉ), root10 (degree-d root of a power of 10).
function makePowProblem(kind, a, b) {
  let text;
  let answer;
  let statsKey;
  if (kind === "sq") {
    answer = a * a; text = `${a}²`; statsKey = `sq,${a}`;
  } else if (kind === "cube") {
    answer = a * a * a; text = `${a}³`; statsKey = `cube,${a}`;
  } else if (kind === "sqrt") {
    answer = a; text = `√${a * a}`; statsKey = `sqrt,${a}`;
  } else if (kind === "cbrt") {
    answer = a; text = `∛${a * a * a}`; statsKey = `cbrt,${a}`;
  } else if (kind === "pow") {
    answer = Math.pow(a, b); text = `${a}${toSuperscript(b)}`; statsKey = `pow,${a},${b}`;
  } else if (kind === "neg10") {
    answer = Math.pow(10, -a); text = `10${toSuperscript(`-${a}`)}`; statsKey = `neg10,${a}`;
  } else {
    // root10: a = degree (2 or 3), b = k; radical of 10^(a*b) = 10^b
    answer = Math.pow(10, b);
    text = `${a === 2 ? "√" : "∛"}${Math.pow(10, a * b)}`;
    statsKey = `root10,${a},${b}`;
  }
  return { text, answer, answerText: String(answer), opKey: "pow", statsKey };
}

function makePowProblemFromKey(statsKey) {
  const [kind, ...rest] = statsKey.split(",");
  const nums = rest.map(Number);
  return makePowProblem(kind, nums[0], nums[1]);
}

function getPowUniverse(level, track = TRACKS.standard) {
  const { maxLevel, ladder } = track.pow ?? TRACKS.standard.pow;
  const lvl = clamp(1, maxLevel, Math.round(level || 1));
  const problems = [];
  // Cumulative: level N exposes rungs 1..N (rung index i needs level >= i+1).
  for (let i = 0; i < ladder.length && lvl >= i + 1; i += 1) {
    const rung = ladder[i];
    if (rung.pairs) {
      for (const [a, b] of rung.pairs) problems.push(makePowProblem(rung.kind, a, b));
    } else if (rung.a !== undefined) {
      for (let b = rung.bFrom; b <= rung.bTo; b += 1) problems.push(makePowProblem(rung.kind, rung.a, b));
    } else {
      for (let a = rung.aFrom; a <= rung.aTo; a += 1) problems.push(makePowProblem(rung.kind, a));
    }
  }
  return problems;
}

function generatePowProblem(difficulty = 1, rng = Math.random, track = TRACKS.standard) {
  const universe = getPowUniverse(difficulty, track);
  return universe[randInt(0, universe.length - 1, rng)];
}

// Fraction simplification. Mastery is tracked by concept buckets rather than
// literal fractions: a case (what kind of simplification) at a magnitude band.
// The per-level cells live in TRACKS.standard.reduce.levelSpecs; the band range
// and labels below stay here as the generation/label strategy.
const REDUCE_BAND_LABELS = {
  small: "small",
  smallmed: "small-med",
  med: "medium",
  two: "two-digit",
  large: "larger",
  huge: "large",
};

// Sampling range for the coprime multiplier a/b (and the whole-number quotient).
const REDUCE_BAND_RANGE = {
  small: [2, 8],
  smallmed: [3, 11],
  med: [4, 13],
  two: [5, 18],
  large: [9, 28],
  huge: [15, 44],
};

function gcdInt(a, b) {
  let x = Math.abs(Math.trunc(Number(a)));
  let y = Math.abs(Math.trunc(Number(b)));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  while (y !== 0) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

function formatFractionText(num, den) {
  return den === 1 ? String(num) : `${num}/${den}`;
}

function reduceFraction(num, den) {
  const n = Math.trunc(Number(num));
  const d = Math.trunc(Number(den));
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) {
    throw new Error("Cannot reduce an invalid fraction");
  }
  const sign = d < 0 ? -1 : 1;
  const signedNum = n * sign;
  const signedDen = Math.abs(d);
  const g = gcdInt(signedNum, signedDen) || 1;
  return { num: signedNum / g, den: signedDen / g };
}

function isReducedFraction(num, den) {
  const n = Math.trunc(Number(num));
  const d = Math.trunc(Number(den));
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return false;
  return gcdInt(n, d) === 1;
}

function fractionCancelStep(num, den, factor) {
  const f = Math.trunc(Number(factor));
  const n = Math.trunc(Number(num));
  const d = Math.trunc(Number(den));
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  if (!Number.isInteger(f) || f <= 1) return null;
  if (n % f !== 0 || d % f !== 0) return null;
  return { num: n / f, den: d / f };
}

function parseSimplifiedFractionInput(value) {
  const str = String(value == null ? "" : value).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    return num > 0 ? { num, den: 1, isFraction: false } : null;
  }
  const match = str.match(/^(\d+)\/(\d+)$/);
  if (!match) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  if (num <= 0 || den <= 0) return null;
  return { num, den, isFraction: true };
}

function checkSimplifiedAnswer(origNum, origDen, typed) {
  const parsed = parseSimplifiedFractionInput(typed);
  if (!parsed) return false;
  if (parsed.isFraction && !isReducedFraction(parsed.num, parsed.den)) return false;
  const expected = reduceFraction(origNum, origDen);
  return parsed.num === expected.num && parsed.den === expected.den;
}

function reduceTypeStatsKey(type) {
  return `red:${type.band}:${type.kind}:${type.factor}`;
}

function makeReduceType(band, kind, factor) {
  const type = { band, kind, factor };
  return { ...type, statsKey: reduceTypeStatsKey(type) };
}

function reduceTypesForLevel(level, track = TRACKS.standard) {
  const { maxLevel, levelSpecs } = track.reduce ?? TRACKS.standard.reduce;
  const lvl = clamp(1, maxLevel, Math.round(level || 1));
  return levelSpecs[lvl - 1].map(([band, kind, factor]) => makeReduceType(band, kind, factor));
}

function reduceTypeFromKey(statsKey) {
  const parts = String(statsKey).split(":");
  if (parts[0] !== "red" || parts.length < 4) return null;
  const band = parts[1];
  const kind = parts[2];
  const factor = Number(parts[3]);
  if (!REDUCE_BAND_RANGE[band] || !Number.isFinite(factor)) return null;
  return makeReduceType(band, kind, factor);
}

function reduceTypeLabel(type) {
  const bandLabel = REDUCE_BAND_LABELS[type.band] || type.band;
  if (type.kind === "whole") return `reduces to a whole (\u00f7${type.factor}) \u00b7 ${bandLabel}`;
  if (type.factor === 1) return `already reduced \u00b7 ${bandLabel}`;
  return `reduce by ${type.factor} \u00b7 ${bandLabel}`;
}

// A random coprime pair a<b in the band range (consecutive-integer fallback).
function sampleCoprimePair(range, rng = Math.random) {
  const [lo, hi] = range;
  for (let i = 0; i < 200; i += 1) {
    let a = randInt(lo, hi, rng);
    let b = randInt(lo, hi, rng);
    if (a === b) continue;
    if (a > b) { const t = a; a = b; b = t; }
    if (gcdInt(a, b) === 1) return [a, b];
  }
  return [lo, lo + 1];
}

function makeReduceProblem(type, rng = Math.random) {
  const range = REDUCE_BAND_RANGE[type.band] || REDUCE_BAND_RANGE.small;
  let num;
  let den;
  if (type.kind === "whole") {
    const k = randInt(Math.max(2, range[0]), range[1], rng);
    num = type.factor * k;
    den = type.factor;
  } else if (type.factor === 1) {
    [num, den] = sampleCoprimePair(range, rng);
  } else {
    const [a, b] = sampleCoprimePair(range, rng);
    num = type.factor * a;
    den = type.factor * b;
  }
  const reduced = reduceFraction(num, den);
  const answerText = formatFractionText(reduced.num, reduced.den);
  return {
    text: formatFractionText(num, den),
    answer: answerText,
    answerText,
    opKey: "reduce",
    statsKey: type.statsKey,
    reduceOriginalNum: num,
    reduceOriginalDen: den,
    reduceNum: num,
    reduceDen: den,
    reduceCase: type.kind,
    reduceBand: type.band,
    reducePreviewFactor: null,
    reduceInvalidReason: "",
  };
}

function makeReduceProblemFromKey(statsKey, rng = Math.random) {
  const type = reduceTypeFromKey(statsKey);
  return makeReduceProblem(type || reduceTypesForLevel(1)[0], rng);
}

function getReduceUniverse(level, track = TRACKS.standard) {
  return reduceTypesForLevel(level, track).map((type) => ({ statsKey: type.statsKey, text: reduceTypeLabel(type) }));
}

function generateReduceProblem(difficulty = 1, rng = Math.random, track = TRACKS.standard) {
  const types = reduceTypesForLevel(difficulty, track);
  return makeReduceProblem(types[randInt(0, types.length - 1, rng)], rng);
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
  "-": "\u207b",
};

function toSuperscript(n) {
  return String(n)
    .split("")
    .map((c) => SUPERSCRIPTS[c] || c)
    .join("");
}

// Deterministic, cross-browser 53-bit string hash (cyrb53), returned as base36.
// Not cryptographic — used only as a tamper-evidence checksum for share links.
function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(36);
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

// Prime-factoring difficulty is computed from the structure of a number:
//   difficulty(n) = primeIndex(largest prime factor) + max exponent
//                   + (# primes with exponent > 1) + Ω(n) - 4
// where Ω(n) is the count of prime factors with multiplicity. A level holds every
// composite whose difficulty is <= level (cumulative), e.g. L1 = {6} (2·3).
function primeIndex(p) {
  let count = 0;
  for (let k = 2; k <= p; k += 1) {
    if (isPrime(k)) count += 1;
  }
  return count;
}

function factorExponents(n) {
  const factors = {};
  let m = n;
  for (let p = 2; p * p <= m; p += p === 2 ? 1 : 2) {
    while (m % p === 0) {
      factors[p] = (factors[p] || 0) + 1;
      m /= p;
    }
  }
  if (m > 1) factors[m] = (factors[m] || 0) + 1;
  return factors;
}

function factorDifficulty(n) {
  if (!isComposite(n)) return Infinity;
  const factors = factorExponents(n);
  const primes = Object.keys(factors).map(Number);
  const largestPrime = Math.max(...primes);
  const maxExponent = Math.max(...primes.map((p) => factors[p]));
  const numPrimesWithPower = primes.filter((p) => factors[p] > 1).length;
  const omega = primes.reduce((sum, p) => sum + factors[p], 0);
  return primeIndex(largestPrime) + maxExponent + numPrimesWithPower + omega - 4;
}

function getFactorUniverseNumbers(level, track = TRACKS.standard) {
  // Level 1 of pure {6} was too thin, so the ladder is shifted by levelOffset: a
  // level holds every composite of difficulty <= level + levelOffset.
  const { minN, maxN, levelOffset } = track.factor ?? TRACKS.standard.factor;
  const lvl = clamp(1, 99, Math.round(level || 1)) + levelOffset;
  const nums = [];
  for (let n = minN; n <= maxN; n += 1) {
    if (factorDifficulty(n) <= lvl) nums.push(n);
  }
  return nums;
}

function getFactorUniverse(level, track = TRACKS.standard) {
  return getFactorUniverseNumbers(level, track).map((n) => ({ statsKey: String(n), text: String(n) }));
}

function makeFactorProblem(n) {
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

function generateFactorProblem(difficulty = 1, rng = Math.random, track = TRACKS.standard) {
  const nums = getFactorUniverseNumbers(difficulty, track);
  const n = nums.length ? nums[randInt(0, nums.length - 1, rng)] : 6;
  return makeFactorProblem(n);
}

/**
 * @param {import('./types.js').OpKey} opKey
 * @param {import('./types.js').OpConfig} opConfig
 * @param {() => number} [rng]
 * @returns {import('./types.js').Problem}
 */
function generateProblem(opKey, opConfig, rng = Math.random, track = TRACKS.standard) {
  const config = opConfig[opKey];
  const range = getDifficultyRange(opKey, config.difficulty, track);

  // The sub-generators return valid Problems; cast to settle opKey (a string
  // literal TS widens to `string`) back to the OpKey union.
  const P = (p) => /** @type {import('./types.js').Problem} */ (p);
  if (opKey === "factor") return P(generateFactorProblem(config.difficulty, rng, track));
  if (opKey === "shapes") return P(generateShapesProblem(config.difficulty, rng, track));
  if (opKey === "pow") return P(generatePowProblem(config.difficulty, rng, track));
  if (opKey === "round") return P(generateRoundProblem(config.difficulty, rng, track));
  if (opKey === "reduce") return P(generateReduceProblem(config.difficulty, rng, track));
  if (opKey === "si") return P(generateSIProblem(config.difficulty, rng, track));
  if (opKey === "f10") return P(generateFactorsOfTenProblem(config.difficulty, rng, track));

  const levelPairs = getArithmeticLevelPairs(opKey, config.difficulty, track);
  if (levelPairs) {
    if (levelPairs.length === 0) return P(makeArithmeticProblemFromPair(opKey, { a: 1, b: 1, statsKey: "1,1" }));
    const pair = levelPairs[randInt(0, levelPairs.length - 1, rng)];
    return P(makeArithmeticProblemFromPair(opKey, pair));
  }

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

function getMastery(problemStats, opKey, statsKey, masteryLookup = null) {
  if (typeof masteryLookup === "function") {
    const mastery = masteryLookup(opKey, statsKey);
    if (Number.isFinite(mastery)) return clamp(0, 1, mastery);
  }
  const stats = problemStats[opKey];
  const entry = stats ? stats[statsKey] : null;
  if (!entry || entry.asked === 0) return 0;
  const confidence = Math.min(entry.asked, 3) / 3;
  const accuracy = entry.correct / entry.asked;
  return Math.min(1, accuracy / 0.9) * confidence;
}

function getSelectionWeight(mastery) {
  const gap = 1 - clamp(0, 1, mastery);
  return 1 + gap * gap * 14;
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

function generateWeightedProblem(opKey, opConfig, problemStats, rng = Math.random, masteryLookup = null, track = TRACKS.standard) {
  const config = opConfig[opKey];
  const range = getDifficultyRange(opKey, config.difficulty, track);

  if (opKey === "factor") {
    const nums = getFactorUniverseNumbers(config.difficulty, track);
    if (nums.length === 0) return generateFactorProblem(config.difficulty, rng, track);
    const items = nums.map((n) => ({
      value: makeFactorProblem(n),
      weight: getSelectionWeight(getMastery(problemStats, "factor", String(n), masteryLookup)),
    }));
    return weightedPick(items, rng);
  }

  if (opKey === "shapes") {
    const items = getShapesUniverse(config.difficulty, track).map((problem) => ({
      value: problem,
      weight: getSelectionWeight(getMastery(problemStats, "shapes", problem.statsKey, masteryLookup)),
    }));
    if (items.length === 0) return generateProblem(opKey, opConfig, rng);
    return weightedPick(items, rng);
  }

  if (opKey === "pow") {
    const items = getPowUniverse(config.difficulty, track).map((problem) => ({
      value: problem,
      weight: getSelectionWeight(getMastery(problemStats, "pow", problem.statsKey, masteryLookup)),
    }));
    if (items.length === 0) return generateProblem(opKey, opConfig, rng);
    return weightedPick(items, rng);
  }

  if (opKey === "round") {
    const items = getRoundUniverse(config.difficulty, track).map((type) => ({
      value: makeRoundProblemFromKey(type.statsKey, rng),
      weight: getSelectionWeight(getMastery(problemStats, "round", type.statsKey, masteryLookup)),
    }));
    if (items.length === 0) return generateProblem(opKey, opConfig, rng);
    return weightedPick(items, rng);
  }

  if (opKey === "reduce") {
    const items = getReduceUniverse(config.difficulty, track).map((type) => ({
      value: makeReduceProblemFromKey(type.statsKey, rng),
      weight: getSelectionWeight(getMastery(problemStats, "reduce", type.statsKey, masteryLookup)),
    }));
    if (items.length === 0) return generateProblem(opKey, opConfig, rng);
    return weightedPick(items, rng);
  }

  if (opKey === "si") {
    const prefixes = getSIPrefixesForDifficulty(config.difficulty, track);
    const pairs = [];
    for (let i = 0; i < prefixes.length; i += 1) {
      for (let j = 0; j < prefixes.length; j += 1) {
        if (i === j) continue;
        const key = `${prefixes[i].sym || "base"},${prefixes[j].sym || "base"}`;
        const mastery = getMastery(problemStats, "si", key, masteryLookup);
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
    const items = getF10Universe(config.difficulty, track).map((type) => ({
      value: makeF10ProblemFromKey(type.statsKey, rng),
      weight: getSelectionWeight(getMastery(problemStats, "f10", type.statsKey, masteryLookup)),
    }));
    if (items.length === 0) return generateProblem(opKey, opConfig, rng);
    return weightedPick(items, rng);
  }

  const op = operators[opKey];
  const pairs = [];
  const levelPairs = getArithmeticLevelPairs(opKey, config.difficulty, track);

  if (levelPairs) {
    for (const pair of levelPairs) {
      pairs.push({
        ...pair,
        weight: getSelectionWeight(getMastery(problemStats, opKey, pair.statsKey, masteryLookup)),
      });
    }
  } else {
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
        const mastery = getMastery(problemStats, opKey, statsKey, masteryLookup);
        pairs.push({ a, b, statsKey, weight: getSelectionWeight(mastery) });
      }
    }
  }

  if (pairs.length === 0) return generateProblem(opKey, opConfig, rng);

  const pick = weightedPick(
    pairs.map((p) => ({ value: p, weight: p.weight })),
    rng
  );
  return makeArithmeticProblemFromPair(opKey, pick);
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

// --- Display formatters (pure; used by the stats/session-report popups) ---

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "--";
  const seconds = Math.max(0, ms / 1000);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`
    : `${seconds.toFixed(1)}s`;
}

function formatResponseTime(ms) {
  if (ms === null || ms === undefined) return "—";
  return `${(ms / 1000).toFixed(1)}s avg`;
}

function formatMasteryDelta(value) {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `${value}%`;
  return "no change";
}

function formatSessionAccuracy(stats) {
  if (!stats || stats.attempts === 0) return "no practice attempts";
  return `${stats.correct}/${stats.attempts} correct (${formatPercent(stats.accuracy)})`;
}

function formatSessionLevelProgress(level) {
  const start = level.started;
  const end = level.ended;
  const mastered = `${start.masteredCount}/${start.universeCount} -> ${end.masteredCount}/${end.universeCount}`;
  return `L${level.level} ${start.readiness}% -> ${end.readiness}% (${formatMasteryDelta(level.masteryDelta)}; ${mastered} mastered)`;
}

// The per-operation stat lines in a session report (one string per line).
// Optional lines (wrong answers, boss/challenge attempts, challenge counts)
// appear only when there is something to show.
function formatSessionOperationStats(operation) {
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
    pieces.push(formatSessionChallengeBreakdown(operation.challenges));
  }
  return pieces;
}

function createReportStats(stats = {}) {
  const attempts = Math.max(0, Math.round(Number.isFinite(stats.attempts) ? stats.attempts : 0));
  const correct = Math.max(0, Math.round(Number.isFinite(stats.correct) ? stats.correct : 0));
  const wrong = Math.max(0, Math.round(Number.isFinite(stats.wrong) ? stats.wrong : 0));
  const missed = Math.max(0, Math.round(Number.isFinite(stats.missed) ? stats.missed : 0));
  const helped = Math.max(0, Math.round(Number.isFinite(stats.helped) ? stats.helped : 0));
  const accuracy = attempts > 0 ? (correct + helped * 0.25) / attempts : 0;
  return { attempts, correct, wrong, missed, helped, accuracy };
}

function createReportChallenges(challenges = {}) {
  return {
    started: Math.max(0, Math.round(Number.isFinite(challenges.started) ? challenges.started : 0)),
    completed: Math.max(0, Math.round(Number.isFinite(challenges.completed) ? challenges.completed : 0)),
    cleared: Math.max(0, Math.round(Number.isFinite(challenges.cleared) ? challenges.cleared : 0)),
    blitz: Math.max(0, Math.round(Number.isFinite(challenges.blitz) ? challenges.blitz : 0)),
    wave: Math.max(0, Math.round(Number.isFinite(challenges.wave) ? challenges.wave : 0)),
    boss: Math.max(0, Math.round(Number.isFinite(challenges.boss) ? challenges.boss : 0)),
    bestScore: Math.max(0, Math.round(Number.isFinite(challenges.bestScore) ? challenges.bestScore : 0)),
    bestBossTimeMs: Number.isFinite(challenges.bestBossTimeMs) ? Math.max(0, Math.round(challenges.bestBossTimeMs)) : null,
  };
}

function formatSessionChallengeBreakdown(challenges = {}) {
  const stats = createReportChallenges(challenges);
  if (!stats.started && !stats.completed && !stats.blitz && !stats.wave && !stats.boss) {
    return "Challenges: none";
  }
  const types = [];
  if (stats.blitz) types.push(`Blitz ${stats.blitz}`);
  if (stats.wave) types.push(`Wave ${stats.wave}`);
  if (stats.boss) types.push(`Worksheet ${stats.boss}`);
  const activity = types.length > 0 ? ` · activity: ${types.join(" · ")}` : "";
  const bests = [];
  if (stats.bestBossTimeMs !== null) bests.push(`best worksheet ${formatDuration(stats.bestBossTimeMs)}`);
  if (stats.bestScore > 0) bests.push(`best score ${stats.bestScore}`);
  return [
    `Challenges: ${stats.started} started, ${stats.completed} completed`,
    `${stats.cleared} cleared`,
    bests.join(" · "),
  ].filter(Boolean).join(" · ") + activity;
}

const REPORT_MAX_LEVEL = 99;

function createReportLevelSnapshot(snapshot = {}, fallbackLevel = 1) {
  return {
    level: clamp(1, REPORT_MAX_LEVEL, Math.round(Number.isFinite(snapshot.level) ? snapshot.level : fallbackLevel)),
    readiness: clamp(0, 100, Math.round(Number.isFinite(snapshot.readiness) ? snapshot.readiness : 0)),
    masteredCount: Math.max(0, Math.round(Number.isFinite(snapshot.masteredCount) ? snapshot.masteredCount : 0)),
    universeCount: Math.max(0, Math.round(Number.isFinite(snapshot.universeCount) ? snapshot.universeCount : 0)),
  };
}

function createReportLevel(level = {}) {
  const levelNumber = clamp(1, REPORT_MAX_LEVEL, Math.round(Number.isFinite(level.level) ? level.level : 1));
  const started = createReportLevelSnapshot(level.started, levelNumber);
  const ended = createReportLevelSnapshot(level.ended, levelNumber);
  return {
    level: levelNumber,
    started,
    ended,
    masteryDelta: Number.isFinite(level.masteryDelta) ? Math.round(level.masteryDelta) : ended.readiness - started.readiness,
  };
}

function createReportOperation(operation = {}) {
  const levels = getSessionReportLevels(operation).map(createReportLevel);
  return {
    opKey: operation.opKey || "unknown",
    durationMs: Math.max(0, Math.round(Number.isFinite(operation.durationMs) ? operation.durationMs : 0)),
    practice: createReportStats(operation.practice),
    assessment: createReportStats(operation.assessment),
    challenges: createReportChallenges(operation.challenges),
    levels,
  };
}

function createSessionReportViewModel(session = {}) {
  return {
    id: session.id || "",
    startedAt: session.startedAt || "",
    durationMs: Math.max(0, Math.round(Number.isFinite(session.durationMs) ? session.durationMs : 0)),
    practice: createReportStats(session.practice),
    assessment: createReportStats(session.assessment),
    challenges: createReportChallenges(session.challenges),
    operations: Array.isArray(session.operations) ? session.operations.map(createReportOperation) : [],
  };
}

function compactReportStats(stats) {
  const normalized = createReportStats(stats);
  return [normalized.attempts, normalized.correct, normalized.wrong, normalized.missed, normalized.helped];
}

function expandCompactReportStats(row = []) {
  return createReportStats({
    attempts: row[0],
    correct: row[1],
    wrong: row[2],
    missed: row[3],
    helped: row[4],
  });
}

function compactReportChallenges(challenges) {
  const normalized = createReportChallenges(challenges);
  return [
    normalized.started,
    normalized.completed,
    normalized.cleared,
    normalized.blitz,
    normalized.wave,
    normalized.boss,
    normalized.bestScore,
    normalized.bestBossTimeMs,
  ];
}

function expandCompactReportChallenges(row = []) {
  return createReportChallenges({
    started: row[0],
    completed: row[1],
    cleared: row[2],
    blitz: row[3],
    wave: row[4],
    boss: row[5],
    bestScore: row[6],
    bestBossTimeMs: row[7],
  });
}

// `idOverride` (the session's position in the shared blob) lets the share path
// emit a tiny "0"/"1" handle instead of the long internal session id — the id is
// only used to match a log row to its report popup within the decoded set.
function compactSessionReportViewModel(report, idOverride) {
  const model = createSessionReportViewModel(report);
  return [
    idOverride == null ? model.id : String(idOverride),
    model.startedAt,
    model.durationMs,
    compactReportStats(model.practice),
    compactReportStats(model.assessment),
    compactReportChallenges(model.challenges),
    model.operations.map((operation) => {
      const opIndex = Object.keys(operationDefaults).indexOf(operation.opKey);
      return [
        opIndex >= 0 ? opIndex : operation.opKey,
        operation.durationMs,
        compactReportStats(operation.practice),
        compactReportStats(operation.assessment),
        compactReportChallenges(operation.challenges),
        operation.levels.map((level) => [
          level.level,
          level.started.readiness,
          level.ended.readiness,
          level.masteryDelta,
          level.started.masteredCount,
          level.started.universeCount,
          level.ended.masteredCount,
          level.ended.universeCount,
        ]),
      ];
    }),
  ];
}

function expandCompactSessionReportViewModel(row = []) {
  const opKeys = Object.keys(operationDefaults);
  return createSessionReportViewModel({
    id: row[0],
    startedAt: row[1],
    durationMs: row[2],
    practice: expandCompactReportStats(row[3]),
    assessment: expandCompactReportStats(row[4]),
    challenges: expandCompactReportChallenges(row[5]),
    operations: Array.isArray(row[6])
      ? row[6].map((operation) => ({
          opKey: typeof operation[0] === "string" ? operation[0] : opKeys[operation[0]] || "unknown",
          durationMs: operation[1],
          practice: expandCompactReportStats(operation[2]),
          assessment: expandCompactReportStats(operation[3]),
          challenges: expandCompactReportChallenges(operation[4]),
          levels: Array.isArray(operation[5])
            ? operation[5].map((level) => ({
                level: level[0],
                started: {
                  level: level[0],
                  readiness: level[1],
                  masteredCount: level[4],
                  universeCount: level[5],
                },
                ended: {
                  level: level[0],
                  readiness: level[2],
                  masteredCount: level[6],
                  universeCount: level[7],
                },
                masteryDelta: level[3],
              }))
            : [],
        }))
      : [],
  });
}

// Skill-state display/predicate helpers, operating on a summarized skill.
function formatReadinessPercent(skill) {
  return `${Math.round(skill?.readiness || 0)}%`;
}

function formatReadyText(skill) {
  if (skill?.levelAdvancedForLevel && !skill?.bossReady) {
    return `Unlocked: ${formatReadinessPercent(skill)}`;
  }
  const suffix = skill?.bossAttemptedForLevel ? " ✓" : "";
  return `Mastered: ${formatReadinessPercent(skill)}${suffix}`;
}

function canOpenLevelChoices(skill) {
  return Boolean(skill?.bossReady || skill?.bossAttemptedForLevel || skill?.levelAdvancedForLevel);
}

function shouldPromptBossAttempt(skill) {
  return Boolean(skill?.bossReady && !skill?.bossAttemptedForLevel && !skill?.levelAdvancedForLevel);
}

/**
 * @param {Partial<import('./types.js').SkillSummary>} skill
 * @returns {string | null}
 */
function getMasteryGateReason(skill) {
  if (canOpenLevelChoices(skill)) return null;
  const threshold = Math.round(skill?.bossThreshold || 100);
  const level = Math.max(1, Math.round(skill?.currentLevel || 1));
  return `Master ${threshold}% of L${level} to unlock Boss / Next Level.`;
}

/**
 * @param {{ selectedLevel?: number, unlockedLevel?: number, currentLevel?: number, bossReady?: boolean }} [options]
 * @returns {string | null}
 */
function getReplayLockReason({ selectedLevel, unlockedLevel = 0, currentLevel = 1, bossReady = false } = {}) {
  const selected = Math.max(1, Math.round(selectedLevel || 1));
  const unlocked = Math.max(0, Math.round(unlockedLevel || 0));
  const current = Math.max(1, Math.round(currentLevel || selected));
  if (selected <= unlocked) return null;
  if (selected === current && bossReady) return null;
  if (selected === current) return "Master this level to unlock its challenges.";
  return `Reach Level ${selected} first.`;
}

// Challenge-result summaries (Blitz survival time + fastest drop + solved;
// Wave max simultaneous load + solved). Em-dash when nothing was recorded.
function formatDropSeconds(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  return `${Math.max(0, seconds).toFixed(1)}s drops`;
}

function formatBlitzResult(result) {
  if (!result) return "—";
  const duration = Number.isFinite(result.durationMs) ? formatDuration(result.durationMs) : "—";
  const dropTime = Number.isFinite(result.fastestDropSeconds)
    ? ` · ${formatDropSeconds(result.fastestDropSeconds)}`
    : "";
  const solved = Number.isFinite(result.clearedCount) ? ` · ${result.clearedCount} solved` : "";
  return `${duration}${dropTime}${solved}`;
}

function formatWaveResult(result) {
  if (!result) return "—";
  const load = Number.isFinite(result.maxLoadCleared) ? result.maxLoadCleared : 0;
  const solved = Number.isFinite(result.clearedCount) ? ` · ${result.clearedCount} solved` : "";
  return `${load} at once${solved}`;
}

// Replay-button labels for a level's best challenge result. The caller resolves
// the level and looks up the stored best; these turn (level, best) into text.
function formatBlitzBestText(level, best) {
  if (!best) return `Blitz L${level}`;
  if (Number.isFinite(best.durationMs)) return `Blitz L${level} best ${formatDuration(best.durationMs)}`;
  return `Blitz L${level} best ${best.score} solved`;
}

function formatWaveBestText(level, best) {
  if (!best) return `Wave L${level}`;
  if (Number.isFinite(best.maxLoadCleared)) return `Wave L${level} best ${best.maxLoadCleared} at once`;
  return `Wave L${level} best ${best.score} solved`;
}

function formatBossReplayBestText(level, best) {
  if (!best?.durationMs) return `Worksheet L${level}`;
  return `Worksheet L${level} ${formatDuration(best.durationMs)}`;
}

// Course progress (0-100%) for an op chit, from its current level out of the
// active track's max level for that operation.
function getCourseProgressPercent(level, maxLevel = DEFAULT_TRACK_MAX_LEVEL) {
  const max = Math.max(1, Math.round(Number.isFinite(maxLevel) ? maxLevel : DEFAULT_TRACK_MAX_LEVEL));
  return clamp(0, 100, Math.round((clamp(1, max, level) / max) * 100));
}

// Turns an SI stats key like "k,m" into a readable "kilo → milli" label.
function formatSIStatsKey(key) {
  const siPrefixNames = {
    k: "kilo", "": "base", c: "centi", m: "milli", h: "hecto", da: "deca",
    d: "deci", M: "mega", "μ": "micro", G: "giga", n: "nano", T: "tera",
    p: "pico", base: "(base)",
  };
  const parts = key.split(",");
  if (parts.length !== 2) return key;
  const from = siPrefixNames[parts[0]] || parts[0] || "(base)";
  const to = siPrefixNames[parts[1]] || parts[1] || "(base)";
  return `${from} → ${to}`;
}

// Display label for a stored stats key, per operation: SI prefix pairs, shape /
// powers / factors-of-10 problem text, or the key itself for plain arithmetic.
function formatStatsKeyLabel(opKey, statsKey) {
  if (opKey === "si") return formatSIStatsKey(statsKey);
  if (opKey === "shapes") return makeShapeProblemFromKey(statsKey).text;
  if (opKey === "pow") return makePowProblemFromKey(statsKey).text;
  if (opKey === "round") {
    const type = roundTypeFromKey(statsKey);
    return type ? roundTypeLabel(type) : statsKey;
  }
  if (opKey === "reduce") {
    const type = reduceTypeFromKey(statsKey);
    return type ? reduceTypeLabel(type) : statsKey;
  }
  if (opKey === "f10") return formatF10StatsKey(statsKey);
  return statsKey;
}

// Short accuracy label for a stats cell/row: "75% (3/4)", an em-dash when
// nothing has been attempted, or a "Placed out" form for placement credit.
function formatAccuracyText(asked, correct, placedOut = false) {
  if (placedOut) {
    return asked > 0
      ? `Placed out · ${Math.round((correct / asked) * 100)}% (${correct}/${asked})`
      : "Placed out";
  }
  if (asked === 0) return "—";
  return `${Math.round((correct / asked) * 100)}% (${correct}/${asked})`;
}

// The middot-joined details line under each row in the Session Log list.
function formatSessionLogDetails(session) {
  const stress = session.assessment.missed + session.assessment.wrong;
  const challenges =
    session.challenges.started || session.challenges.completed
      ? `Challenges: ${session.challenges.started} started, ${session.challenges.completed} completed`
      : "Challenges: none";
  return [
    `Practice: ${formatSessionAccuracy(session.practice)}`,
    `Boss/challenge solved: ${session.assessment.correct}`,
    `stress misses/wrongs: ${stress}`,
    challenges,
  ].join(" · ");
}

// The per-level rows for an operation in a session report: its recorded levels,
// or a single synthesized row from the operation's start/end when none exist.
function getSessionReportLevels(operation) {
  if (Array.isArray(operation.levels) && operation.levels.length > 0) {
    return operation.levels;
  }
  return [
    {
      level: operation.started.level,
      started: operation.started,
      ended: operation.ended,
      masteryDelta: operation.masteryDelta,
    },
  ];
}

// The middot-joined summary line at the top of a session report.
function formatSessionSummary(session) {
  return [
    `Practice ${formatSessionAccuracy(session.practice)}`,
    `Boss/challenge solved ${session.assessment.correct}`,
    `Challenges ${session.challenges.started} started / ${session.challenges.completed} completed`,
  ].join(" · ");
}

// One per-level chip in the results "Challenges" row: whether the level was
// played at all, plus the "L3: Blitz 5.0s · Wave 4 at once · Worksheet 1:05"
// summary line (en-dash placeholders for challenges not yet attempted).
function formatChallengeEntry(entry) {
  const played = Boolean(entry.blitz || entry.wave || entry.boss?.durationMs);
  if (!played) {
    return { played, text: `L${entry.level}: not played` };
  }
  const parts = [
    entry.blitz
      ? `Blitz ${Number.isFinite(entry.blitz.durationMs) ? formatDuration(entry.blitz.durationMs) : entry.blitz.score}`
      : "Blitz –",
    entry.wave
      ? `Wave ${Number.isFinite(entry.wave.maxLoadCleared) ? `${entry.wave.maxLoadCleared} at once` : entry.wave.score}`
      : "Wave –",
    entry.boss?.durationMs ? `Worksheet ${formatDuration(entry.boss.durationMs)}` : "Worksheet –",
  ];
  return { played, text: `L${entry.level}: ${parts.join(" · ")}` };
}

// The middot-joined detail line under each skill in the results popup:
// "Level 3 · 12% to boss · 40 attempts · 5/8 seen · 3 mastered · 88% accuracy
//  · 92% recent · 1.4s avg".
/** @param {import('./types.js').SkillSummary} skill */
function formatSkillDetails(skill) {
  const bossText = skill.bossReady
    ? "Boss ready"
    : `${Math.max(0, skill.bossThreshold - skill.readiness)}% to boss`;
  return [
    `Level ${skill.currentLevel}`,
    bossText,
    `${skill.attempts} attempts`,
    `${skill.distinct}/${skill.universeCount} seen`,
    `${skill.masteredCount} mastered`,
    `${formatPercent(skill.accuracy)} accuracy`,
    `${formatPercent(skill.recentAccuracy)} recent`,
    formatResponseTime(skill.averageResponseMs),
  ].join(" · ");
}

// The "Practice next: 7 + 8 (new), 6 × 9 (40%)" line under a skill in the
// results popup. Caller decides whether to show it (only when there are
// suggestions).
function formatPracticeNext(suggestions) {
  return `Practice next: ${suggestions
    .map((p) => (p.kind === "new" ? `${p.text} (new)` : `${p.text} (${p.mastery}%)`))
    .join(", ")}`;
}

// Text for the Test Me placement-result card (title, body, per-level detail
// line). opName is the display label the caller resolves; level is returned so
// the caller can label its Use/Try buttons.
function formatPlacementResult(placementState, opName) {
  const level = placementState.recommendedLevel || 1;
  const placedThrough = Math.max(0, level - 1);
  const placedOutText =
    placedThrough > 0
      ? `Eligible problems through Level ${placedThrough} will show as placed out until real attempts take over.`
      : "No lower levels will be marked placed out.";
  const title = `Recommended: ${opName} Level ${level}`;
  const body = `${placementState.totalCorrect}/${placementState.totalAsked} correct in Test Me. ${placedOutText} Your actual Test Me answers stay recorded as ordinary practice.`;
  const summaries = Array.isArray(placementState.levelSummaries) ? placementState.levelSummaries : [];
  const details =
    summaries.length > 0
      ? summaries
          .map((summary) => {
            const pct = summary.asked > 0 ? Math.round((summary.correct / summary.asked) * 100) : 0;
            return `L${summary.level}: ${summary.correct}/${summary.asked} (${pct}%)`;
          })
          .join(" · ")
      : "Test Me runs like the regular game: one falling problem at a time, with missed problems repeated.";
  return { level, title, body, details };
}

/**
 * Decide what a Test Me placement run does after an answer is resolved, from the
 * current shield value, the level being probed, and how many problems have been
 * asked at this level. Pure: the caller executes the returned action.
 *  - shield full        → climb to the next level
 *  - shield empty       → finish, recommending this level
 *  - past the attempt cap → climb if net-positive (above the start shield), else finish here
 *  - otherwise          → continue asking
 * @param {{shield:number, level:number, levelAsked:number}} state
 * @param {{shieldMax:number, shieldStart:number, attemptCap:number}} cfg
 * @returns {{action:"climb"|"finish"|"continue", recommendedLevel?:number, reason?:string}}
 */
function resolvePlacementOutcome(state, cfg) {
  const { shield, level, levelAsked } = state;
  const { shieldMax, shieldStart, attemptCap } = cfg;
  if (shield >= shieldMax) return { action: "climb" };
  if (shield <= 0) return { action: "finish", recommendedLevel: level, reason: "shield collapsed" };
  if (levelAsked >= attemptCap) {
    return shield > shieldStart
      ? { action: "climb" }
      : { action: "finish", recommendedLevel: level, reason: "reached attempt cap" };
  }
  return { action: "continue" };
}

// Smoothstep easing over [0,1] (clamps its input).
function smoothProgress(value) {
  const t = clamp(0, 1, value);
  return t * t * (3 - 2 * t);
}

/**
 * Blitz fall-time (seconds per drop) at a given elapsed ramp position. Eases
 * start→baseline across the first ramp unit, then keeps shrinking (overdrive)
 * on a log curve, floored at minDropSeconds.
 * @param {number} rampUnits  elapsedMs / rampMs (0 at start, 1 after one ramp).
 * @param {{startDropSeconds:number, baselineDropSeconds:number, minDropSeconds:number}} cfg
 * @returns {number}
 */
function blitzDropSeconds(rampUnits, cfg) {
  const baselineSeconds = lerp(cfg.startDropSeconds, cfg.baselineDropSeconds, smoothProgress(rampUnits));
  const overdriveUnits = Math.max(0, rampUnits - 1);
  if (overdriveUnits <= 0) return baselineSeconds;
  const overdriveReduction = Math.log1p(overdriveUnits * 1.4) * 0.55;
  return Math.max(cfg.minDropSeconds, baselineSeconds - overdriveReduction);
}

/**
 * Blitz fall-speed percent at a given elapsed ramp position: eases start→100,
 * then adds +25 per overdrive unit.
 * @param {number} rampUnits
 * @param {{startSpeed:number}} cfg
 * @returns {number}
 */
function blitzSpeedPercent(rampUnits, cfg) {
  return Math.round(lerp(cfg.startSpeed, 100, smoothProgress(rampUnits)) + Math.max(0, rampUnits - 1) * 25);
}

/**
 * Blitz bomb-spawn interval (ms) at a given elapsed ramp position: eases
 * 2200ms→700ms over the first ramp unit, then tightens on a log curve in
 * overdrive, floored at 320ms.
 * @param {number} rampUnits
 * @returns {number}
 */
function blitzBombIntervalMs(rampUnits) {
  const overdriveUnits = Math.max(0, rampUnits - 1);
  if (overdriveUnits <= 0) return Math.round(lerp(2200, 700, smoothProgress(rampUnits)));
  return Math.max(320, Math.round(700 - Math.log1p(overdriveUnits * 1.8) * 190));
}

/**
 * Wave bomb-spawn interval (ms) for a given simultaneous-load round: tighter as
 * the load grows, floored at 360ms.
 * @param {number} load
 * @returns {number}
 */
function waveBombIntervalMs(load) {
  return Math.max(360, 1150 - (load - 1) * 90);
}

/**
 * Spawn interval (ms) between drops for a given Speed setting. Infinite when
 * Drops are off; otherwise eases 2200ms→500ms as speed goes 0→100.
 * @param {number} speedPercent 0–100
 * @param {number} dropLimit
 * @returns {number}
 */
function spawnIntervalMs(speedPercent, dropLimit) {
  if (dropLimit === 0) return Infinity;
  return lerp(2200, 500, speedPercent / 100);
}

/**
 * Derive the visible Start/Pause/Resume, Restart, and Finish control state from
 * the runtime flags that own those meanings. DOM code should render this result
 * rather than reimplementing each edge case.
 *
 * @param {{
 *   hasStarted?: boolean,
 *   isPaused?: boolean,
 *   enabledOpsCount?: number,
 *   dropLimit?: number,
 *   bossActive?: boolean,
 *   placementActive?: boolean,
 *   breatherActive?: boolean,
 *   activeDropCount?: number,
 *   hasInput?: boolean,
 *   score?: number,
 *   hasReportableActivity?: boolean,
 * }} state
 * @returns {{
 *   pauseLabel: "Start"|"Pause"|"Resume",
 *   pauseDisabled: boolean,
 *   pauseReason: string,
 *   suggestStart: boolean,
 *   restartDisabled: boolean,
 *   restartReason: string,
 *   finishDisabled: boolean,
 *   finishReason: string,
 * }}
 */
function deriveRunControlState(state = {}) {
  const hasStarted = Boolean(state.hasStarted);
  const isPaused = Boolean(state.isPaused);
  const enabledOpsCount = Math.max(0, Math.round(Number(state.enabledOpsCount) || 0));
  const dropLimit = Math.max(0, Math.round(Number(state.dropLimit) || 0));
  const bossActive = Boolean(state.bossActive);
  const placementActive = Boolean(state.placementActive);
  const breatherActive = Boolean(state.breatherActive);
  const activeDropCount = Math.max(0, Math.round(Number(state.activeDropCount) || 0));
  const hasInput = Boolean(state.hasInput);
  const score = Math.max(0, Math.round(Number(state.score) || 0));
  const hasReportableActivity = Boolean(state.hasReportableActivity);

  const pauseLabel = !hasStarted ? "Start" : isPaused ? "Resume" : "Pause";
  let pauseDisabled = false;
  let pauseReason = "";
  if (!hasStarted && enabledOpsCount === 0) {
    pauseDisabled = true;
    pauseReason = "Select a problem type to start.";
  } else if (!hasStarted && dropLimit === 0) {
    pauseDisabled = true;
    pauseReason = "Raise Drops above 0 to start.";
  }

  const hasTransientRunState = hasStarted
    || bossActive
    || placementActive
    || breatherActive
    || activeDropCount > 0
    || hasInput
    || score > 0;
  const restartDisabled = !hasTransientRunState;
  const finishDisabled = !hasReportableActivity;

  return {
    pauseLabel,
    pauseDisabled,
    pauseReason,
    suggestStart: !hasStarted && !pauseDisabled && enabledOpsCount > 0,
    restartDisabled,
    restartReason: restartDisabled ? "Nothing to restart yet." : "",
    finishDisabled,
    finishReason: finishDisabled ? "No session activity to report yet." : "",
  };
}

/**
 * A random fall time (seconds) for a new drop: uniform between 3s and the
 * configured max (which is clamped up to 3). Smaller = faster.
 * @param {number} maxFallTimeSec
 * @param {() => number} [rng]
 * @returns {number}
 */
function randomFallTimeSec(maxFallTimeSec, rng = Math.random) {
  return maxFallTimeSec <= 3 ? 3 : 3 + rng() * (maxFallTimeSec - 3);
}

// --- Anti-brute-force: answer-space-aware cannon overload ---
//
// A small answer space (e.g. L1 subtraction = {0,1,2}) can be cleared by guessing
// instead of retrieval, so an impossible submission ("false fire") should heat the
// cannon faster when the board is guessable. These pures give the answer space; the
// caller supplies how many distinct answers are currently on screen.

/**
 * Distinct possible answer values for an operation at a level, as canonical
 * strings. Arithmetic is enumerated from its operand range (matching
 * generateProblem: subtraction is |a-b|, division's answer is the quotient); the
 * pre-enumerated ops use their universe's distinct answers; SI uses its distinct
 * conversions. String-answer ops naturally yield large, non-guessable sets.
 * @param {import('./types.js').OpKey} opKey
 * @param {number} level
 * @returns {Set<string>}
 */
function getAnswerUniverse(opKey, level, track = TRACKS.standard) {
  const set = new Set();
  if (opKey === "add" || opKey === "sub" || opKey === "mul" || opKey === "div") {
    const levelPairs = getArithmeticLevelPairs(opKey, level, track);
    if (levelPairs) {
      for (const pair of levelPairs) {
        set.add(makeArithmeticProblemFromPair(opKey, pair).answerText);
      }
      return set;
    }
    const { min, max } = getDifficultyRange(opKey, level, track);
    for (let a = min; a <= max; a += 1) {
      for (let b = min; b <= max; b += 1) {
        if (opKey === "div") set.add(String(a)); // answer is the quotient; a ranges over quotients
        else if (opKey === "sub") set.add(String(Math.abs(a - b)));
        else set.add(String(operators[opKey].fn(a, b)));
      }
    }
    return set;
  }
  if (opKey === "si") {
    const prefixes = getSIPrefixesForDifficulty(level, track);
    for (const from of prefixes) {
      for (const to of prefixes) {
        if (from !== to) set.add(expDiffToConversion(from.exp - to.exp));
      }
    }
    return set;
  }
  // shapes/pow carry fixed per-problem answers, so distinct answers are meaningful.
  // f10/round (instance-varying numeric) and factor (factorization strings) have large /
  // non-guessable spaces and their universe entries carry no fixed answer — they
  // yield an empty set here, which falseFireCost treats as a large space (cost 1).
  const universe =
    opKey === "shapes" ? getShapesUniverse(level, track)
    : opKey === "pow" ? getPowUniverse(level, track)
    : [];
  for (const p of universe) {
    const ans = p.answer ?? p.answerText;
    if (ans !== undefined && ans !== null && ans !== "") set.add(String(ans));
  }
  return set;
}

/**
 * @param {import('./types.js').OpKey} opKey
 * @param {number} level
 * @returns {number}
 */
function getDistinctAnswerCount(opKey, level) {
  return getAnswerUniverse(opKey, level).size;
}

// Tunable cost tiers: [maxEffectiveChoices, heatCost]. First match wins. With the
// overload threshold at 5 (CANNON_OVERLOAD_THRESHOLD), cost 4 means two quick
// false fires overload; cost 1 preserves the original five-false-fire behavior.
// `effectiveChoices` ≈ distinct possible answers per distinct answer on screen
// (lower = a random guess is likelier to land = harsher).
const FALSE_FIRE_COST_TIERS = [
  [2, 4],
  [4, 3],
  [8, 2],
  [Infinity, 1],
];

/**
 * Heat cost of one false fire given how guessable the board is.
 * @param {{distinctAnswerCount:number, visibleDistinctAnswers:number}} ctx
 * @returns {number}
 */
function falseFireCost({ distinctAnswerCount, visibleDistinctAnswers }) {
  if (!(distinctAnswerCount > 1)) return 1; // no real / unknown answer space → don't penalize
  const visible = Math.max(1, visibleDistinctAnswers || 0);
  const effectiveChoices = distinctAnswerCount / visible;
  for (const [max, cost] of FALSE_FIRE_COST_TIERS) {
    if (effectiveChoices <= max) return cost;
  }
  return 1;
}

// Canonical string of the verified share-content fields (everything except the
// id that carries the checksum). Must be rebuilt in this exact order on both
// sides for the tamper check to line up.
function shareContentString(p) {
  if (p?.kind === "backup") {
    return JSON.stringify({ v: p.v, app: p.app, kind: p.kind, profile: p.profile });
  }
  if (p?.kind === "recap") {
    return JSON.stringify({
      v: p.v,
      kind: p.kind,
      name: p.name,
      opKey: p.opKey,
      level: p.level,
      blitz: p.blitz,
      wave: p.wave,
      worksheet: p.worksheet,
      bossCleared: p.bossCleared,
      at: p.at,
    });
  }
  if (p?.v === 2) {
    return JSON.stringify({ v: p.v, n: p.n, r: p.r });
  }
  return JSON.stringify({ note: p.note, v: p.v, name: p.name, sessionLog: p.sessionLog });
}

// Tamper-evidence checksum for a share blob: cyrb53 of the canonical content
// plus a caller-supplied salt. Not real security (the salt lives in client JS),
// just a deterrent against decode-edit-re-encode.
function computeShareChecksum(content, salt) {
  return hashString(shareContentString(content) + salt);
}

// The checksum is hidden as the trailing "-segment" of the blob's id. A legacy
// blob with no string id is accepted; otherwise the recomputed checksum must
// match what the id carries.
function verifyShareChecksum(payload, salt) {
  if (!payload || typeof payload.id !== "string") return true;
  const expected = payload.id.split("-").pop();
  return computeShareChecksum(payload, salt) === expected;
}

// URL-safe base64 of unicode JSON (the plain fallback when the browser has no
// CompressionStream), and its inverse. decode returns null on any bad input.
function encodeShareString(obj) {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeShareString(str) {
  if (!str) return null;
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch {
    return null;
  }
}

// Raw bytes <-> URL-safe base64 (used for the compressed share path).
function bytesToB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export {
  SUPERSCRIPTS,
  computeShareChecksum,
  verifyShareChecksum,
  encodeShareString,
  decodeShareString,
  bytesToB64url,
  b64urlToBytes,
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
  getCourseProgressPercent,
  formatSIStatsKey,
  formatStatsKeyLabel,
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
  deriveRunControlState,
  smoothProgress,
  blitzDropSeconds,
  blitzSpeedPercent,
  blitzBombIntervalMs,
  waveBombIntervalMs,
  spawnIntervalMs,
  randomFallTimeSec,
  getAnswerUniverse,
  getDistinctAnswerCount,
  falseFireCost,
  advanceFactorDrop,
  checkSimplifiedAnswer,
  clamp,
  createDefaultOpConfig,
  createProblemStats,
  expDiffToConversion,
  factorizationProduct,
  fractionCancelStep,
  formatFactorDropText,
  formatFactorization,
  formatFractionText,
  formatFixedScale,
  formatF10StatsKey,
  factorDifficulty,
  gcdInt,
  getFactorUniverse,
  getReduceUniverse,
  generateFactorProblem,
  generateFactorsOfTenProblem,
  generateProblem,
  generateReduceProblem,
  generateShapesProblem,
  generatePowProblem,
  generateRoundProblem,
  generateSIProblem,
  generateWeightedProblem,
  getArithmeticLevelPairs,
  getDifficultyRange,
  getF10Universe,
  makeF10ProblemFromKey,
  makeReduceProblem,
  makeReduceProblemFromKey,
  reduceFraction,
  reduceTypesForLevel,
  getRoundUniverse,
  makeRoundProblem,
  makeRoundProblemFromKey,
  roundToPlace,
  roundTypesForLevel,
  getShapesUniverse,
  makeShapeProblem,
  makeShapeProblemFromKey,
  getPowUniverse,
  makePowProblem,
  makePowProblemFromKey,
  getFactorRemainingText,
  getFullFactorization,
  getMastery,
  getSIPrefixesForDifficulty,
  getSelectionWeight,
  getTrackOpMaxLevel,
  getSmallestPrimeFactor,
  isComposite,
  isPrime,
  isReducedFraction,
  lerp,
  matchesFactorDrop,
  normalizeTypedValue,
  parseNumericAnswer,
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
  getSIReferenceRows,
  toSuperscript,
  hashString,
  weightedPick,
};
