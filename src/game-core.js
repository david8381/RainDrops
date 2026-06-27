(() => {
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
  si: { enabled: false, difficulty: 1, symbol: "SI", label: "SI" },
  shapes: { enabled: false, difficulty: 1, symbol: "▱", label: "▱" },
  pow: { enabled: false, difficulty: 1, symbol: "xⁿ", label: "xⁿ" },
  factor: { enabled: false, difficulty: 1, symbol: "n!", label: "n!" },
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
    return { min: 1, max: F10_MAX_DIGITS };
  }

  if (opKey === "si") {
    return { min: 1, max: getSIPrefixesForDifficulty(d).length };
  }

  if (opKey === "shapes") {
    return { min: SHAPES_DIM_MIN, max: SHAPES_DIM_MAX };
  }

  if (opKey === "pow") {
    return { min: 1, max: POW_MAX_LEVEL };
  }

  if (opKey === "factor") {
    return { min: 4, max: FACTOR_MAX_N };
  }

  return { min: 1, max: 10 };
}

// Factors-of-10 difficulty is structural, not number-specific. A "problem type"
// is (significant digits, power of 10, ×/÷); the concrete number is random, so
// mastery accrues per type rather than per value. difficulty = digits + power - 1,
// and a level holds every type with digits + power - 1 <= level (cumulative).
const F10_MAX_DIGITS = 4;
const F10_MAX_POWER = 4;

function f10TypesForLevel(level) {
  const lvl = clamp(1, 99, Math.round(level || 1));
  const types = [];
  for (let digits = 1; digits <= F10_MAX_DIGITS; digits += 1) {
    for (let power = 1; power <= F10_MAX_POWER; power += 1) {
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

function getF10Universe(level) {
  return f10TypesForLevel(level).map((type) => ({ statsKey: type.statsKey, text: f10TypeLabel(type) }));
}

function generateFactorsOfTenProblem(difficulty = 1, rng = Math.random) {
  const types = f10TypesForLevel(difficulty);
  return makeFactorsOfTenProblem(types[randInt(0, types.length - 1, rng)], rng);
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

// Display rows for the SI "Prefix Reference" table: all prefixes in descending
// exponent order, each with its base-10 (superscript) and readable factor
// strings, plus whether it is unlocked at the given difficulty. Pure data so
// the renderer in script.js stays a thin DOM loop.
function getSIReferenceRows(difficulty) {
  const activeSyms = new Set(getSIPrefixesForDifficulty(difficulty).map((p) => p.sym));
  return siPrefixes
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

// ── Shapes (geometry) ─────────────────────────────────────────────
// One operation whose level gates which shapes appear (cumulative), focused on
// knowing the formulas rather than big-number arithmetic, so dimensions stay
// small. Round shapes (circle) answer as the coefficient of π, like before.
const SHAPES_DIM_MIN = 2;
const SHAPES_DIM_MAX = 5;
const SHAPE_DEFS = [
  { id: "sq", level: 1, name: "Square" },
  { id: "rect", level: 2, name: "Rectangle" },
  { id: "tri", level: 3, name: "Triangle" },
  { id: "cir", level: 4, name: "Circle" },
  // 3D from level 5; round shapes answer as the coefficient of π. Dimension
  // combinations that would give a non-clean answer are filtered out.
  { id: "cube", level: 5, name: "Cube" },
  { id: "rprism", level: 6, name: "Rectangular prism" },
  { id: "cyl", level: 7, name: "Cylinder" },
  { id: "sph", level: 8, name: "Sphere" },
];
const SHAPES_MAX_LEVEL = SHAPE_DEFS.length;

function shapesActiveDefs(level) {
  const cap = clamp(1, SHAPES_MAX_LEVEL, Math.round(level || 1));
  return SHAPE_DEFS.filter((def) => def.level <= cap);
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

function getShapesUniverse(level) {
  const problems = [];
  const D3_MAX = 4; // tighter cap for multi-dimension 3D shapes
  for (const def of shapesActiveDefs(level)) {
    if (def.id === "sq") {
      for (let s = SHAPES_DIM_MIN; s <= SHAPES_DIM_MAX; s += 1) {
        for (const metric of ["P", "A"]) pushShapeProblem(problems, "sq", metric, [s]);
      }
    } else if (def.id === "rect") {
      for (let l = SHAPES_DIM_MIN; l <= SHAPES_DIM_MAX; l += 1) {
        for (let w = l; w <= SHAPES_DIM_MAX; w += 1) {
          for (const metric of ["P", "A"]) pushShapeProblem(problems, "rect", metric, [l, w]);
        }
      }
    } else if (def.id === "tri") {
      for (let b = SHAPES_DIM_MIN; b <= SHAPES_DIM_MAX; b += 1) {
        for (let h = b; h <= SHAPES_DIM_MAX; h += 1) pushShapeProblem(problems, "tri", "A", [b, h]);
      }
      for (let a = SHAPES_DIM_MIN; a <= SHAPES_DIM_MAX; a += 1) {
        for (let b = a; b <= SHAPES_DIM_MAX; b += 1) {
          for (let c = b; c <= SHAPES_DIM_MAX; c += 1) {
            if (a + b > c) pushShapeProblem(problems, "tri", "P", [a, b, c]);
          }
        }
      }
    } else if (def.id === "cir") {
      for (let r = SHAPES_DIM_MIN; r <= SHAPES_DIM_MAX; r += 1) {
        for (const metric of ["C", "A"]) pushShapeProblem(problems, "cir", metric, [r]);
      }
    } else if (def.id === "cube") {
      for (let s = SHAPES_DIM_MIN; s <= SHAPES_DIM_MAX; s += 1) {
        for (const metric of ["SA", "V"]) pushShapeProblem(problems, "cube", metric, [s]);
      }
    } else if (def.id === "rprism") {
      for (let l = SHAPES_DIM_MIN; l <= D3_MAX; l += 1) {
        for (let w = l; w <= D3_MAX; w += 1) {
          for (let h = w; h <= D3_MAX; h += 1) {
            for (const metric of ["SA", "V"]) pushShapeProblem(problems, "rprism", metric, [l, w, h]);
          }
        }
      }
    } else if (def.id === "cyl") {
      for (let r = SHAPES_DIM_MIN; r <= D3_MAX; r += 1) {
        for (let h = SHAPES_DIM_MIN; h <= D3_MAX; h += 1) {
          for (const metric of ["SA", "V"]) pushShapeProblem(problems, "cyl", metric, [r, h]);
        }
      }
    } else {
      // sphere — radius up to 6 so the divisible-by-3 volumes have some variety
      for (let r = SHAPES_DIM_MIN; r <= 6; r += 1) {
        for (const metric of ["SA", "V"]) pushShapeProblem(problems, "sph", metric, [r]);
      }
    }
  }
  return problems;
}

function generateShapesProblem(difficulty = 1, rng = Math.random) {
  const universe = getShapesUniverse(difficulty);
  return universe[randInt(0, universe.length - 1, rng)];
}

// ── Powers & Roots ────────────────────────────────────────────────
// One level-gated, cumulative operation. Each level adds a family of powers or
// roots; the level ladder is ordered easy→hard and tops out at level 10 (the
// hardest, negative powers of 10). All answers are whole numbers or clean
// terminating decimals, so they clear immediately like ordinary arithmetic.
const POW_MAX_LEVEL = 10;

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

function getPowUniverse(level) {
  const lvl = clamp(1, POW_MAX_LEVEL, Math.round(level || 1));
  const problems = [];
  if (lvl >= 1) for (let x = 2; x <= 7; x += 1) problems.push(makePowProblem("sq", x)); // squares (small)
  if (lvl >= 2) for (let x = 8; x <= 12; x += 1) problems.push(makePowProblem("sq", x)); // squares (full)
  if (lvl >= 3) for (let x = 2; x <= 12; x += 1) problems.push(makePowProblem("sqrt", x)); // square roots
  if (lvl >= 4) for (let e = 1; e <= 6; e += 1) problems.push(makePowProblem("pow", 10, e)); // powers of 10
  if (lvl >= 5) for (const [deg, k] of [[2, 1], [2, 2], [2, 3], [3, 1], [3, 2]]) problems.push(makePowProblem("root10", deg, k)); // roots of 10
  if (lvl >= 6) for (let e = 1; e <= 10; e += 1) problems.push(makePowProblem("pow", 2, e)); // powers of 2
  if (lvl >= 7) for (let x = 2; x <= 10; x += 1) problems.push(makePowProblem("cube", x)); // cubes
  if (lvl >= 8) for (let x = 2; x <= 10; x += 1) problems.push(makePowProblem("cbrt", x)); // cube roots
  if (lvl >= 9) for (let e = 1; e <= 6; e += 1) problems.push(makePowProblem("pow", 3, e)); // powers of 3
  if (lvl >= 10) for (let e = 1; e <= 6; e += 1) problems.push(makePowProblem("neg10", e)); // negative powers of 10
  return problems;
}

function generatePowProblem(difficulty = 1, rng = Math.random) {
  const universe = getPowUniverse(difficulty);
  return universe[randInt(0, universe.length - 1, rng)];
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
const FACTOR_MAX_N = 400;

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

function getFactorUniverseNumbers(level) {
  // Level 1 of pure {6} was too thin, so the ladder is shifted by one: a level
  // holds every composite of difficulty <= level + 1 (L1 = difficulty <= 2).
  const lvl = clamp(1, 99, Math.round(level || 1)) + 1;
  const nums = [];
  for (let n = 4; n <= FACTOR_MAX_N; n += 1) {
    if (factorDifficulty(n) <= lvl) nums.push(n);
  }
  return nums;
}

function getFactorUniverse(level) {
  return getFactorUniverseNumbers(level).map((n) => ({ statsKey: String(n), text: String(n) }));
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

function generateFactorProblem(difficulty = 1, rng = Math.random) {
  const nums = getFactorUniverseNumbers(difficulty);
  const n = nums.length ? nums[randInt(0, nums.length - 1, rng)] : 6;
  return makeFactorProblem(n);
}

function generateProblem(opKey, opConfig, rng = Math.random) {
  const config = opConfig[opKey];
  const range = getDifficultyRange(opKey, config.difficulty);

  if (opKey === "factor") return generateFactorProblem(config.difficulty, rng);
  if (opKey === "shapes") return generateShapesProblem(config.difficulty, rng);
  if (opKey === "pow") return generatePowProblem(config.difficulty, rng);
  if (opKey === "si") return generateSIProblem(config.difficulty, rng);
  if (opKey === "f10") return generateFactorsOfTenProblem(config.difficulty, rng);

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

function generateWeightedProblem(opKey, opConfig, problemStats, rng = Math.random, masteryLookup = null) {
  const config = opConfig[opKey];
  const range = getDifficultyRange(opKey, config.difficulty);

  if (opKey === "factor") {
    const nums = getFactorUniverseNumbers(config.difficulty);
    if (nums.length === 0) return generateFactorProblem(config.difficulty, rng);
    const items = nums.map((n) => ({
      value: makeFactorProblem(n),
      weight: getSelectionWeight(getMastery(problemStats, "factor", String(n), masteryLookup)),
    }));
    return weightedPick(items, rng);
  }

  if (opKey === "shapes") {
    const items = getShapesUniverse(config.difficulty).map((problem) => ({
      value: problem,
      weight: getSelectionWeight(getMastery(problemStats, "shapes", problem.statsKey, masteryLookup)),
    }));
    if (items.length === 0) return generateProblem(opKey, opConfig, rng);
    return weightedPick(items, rng);
  }

  if (opKey === "pow") {
    const items = getPowUniverse(config.difficulty).map((problem) => ({
      value: problem,
      weight: getSelectionWeight(getMastery(problemStats, "pow", problem.statsKey, masteryLookup)),
    }));
    if (items.length === 0) return generateProblem(opKey, opConfig, rng);
    return weightedPick(items, rng);
  }

  if (opKey === "si") {
    const prefixes = getSIPrefixesForDifficulty(config.difficulty);
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
    const items = getF10Universe(config.difficulty).map((type) => ({
      value: makeF10ProblemFromKey(type.statsKey, rng),
      weight: getSelectionWeight(getMastery(problemStats, "f10", type.statsKey, masteryLookup)),
    }));
    if (items.length === 0) return generateProblem(opKey, opConfig, rng);
    return weightedPick(items, rng);
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
      const mastery = getMastery(problemStats, opKey, statsKey, masteryLookup);
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

globalThis.RainMathCore = {
  SUPERSCRIPTS,
  formatPercent,
  formatDuration,
  formatResponseTime,
  formatMasteryDelta,
  formatSessionAccuracy,
  formatSessionLevelProgress,
  formatChallengeEntry,
  formatSkillDetails,
  advanceFactorDrop,
  clamp,
  createDefaultOpConfig,
  createProblemStats,
  expDiffToConversion,
  factorizationProduct,
  formatFactorDropText,
  formatFactorization,
  formatFixedScale,
  formatF10StatsKey,
  factorDifficulty,
  getFactorUniverse,
  generateFactorProblem,
  generateFactorsOfTenProblem,
  generateProblem,
  generateShapesProblem,
  generatePowProblem,
  generateSIProblem,
  generateWeightedProblem,
  getDifficultyRange,
  getF10Universe,
  makeF10ProblemFromKey,
  getShapesUniverse,
  makeShapeProblem,
  makeShapeProblemFromKey,
  SHAPE_DEFS,
  getPowUniverse,
  makePowProblem,
  makePowProblemFromKey,
  POW_MAX_LEVEL,
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
  siPrefixes,
  getSIReferenceRows,
  toSuperscript,
  hashString,
  weightedPick,
};
})();
