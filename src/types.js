// Central data-model documentation for Rain Math (JSDoc only — no runtime code).
//
// These @typedefs describe the core object shapes that flow through the app, so
// you don't have to reverse-engineer them from thousands of lines. They are
// reference docs; editors (and AI tools) resolve them via
// `@param {import('./types.js').Drop} drop` etc. Each typedef notes the
// authoritative construction site.

// ---------------------------------------------------------------------------
// Operations & problems (src/game-core.js)
// ---------------------------------------------------------------------------

/**
 * The nine operation identifiers.
 * @typedef {"add"|"sub"|"mul"|"div"|"f10"|"si"|"shapes"|"pow"|"factor"} OpKey
 */

/**
 * Per-operation config entry. Built from `operationDefaults` (game-core).
 * @typedef {Object} OpConfigEntry
 * @property {boolean} enabled   Whether this operation is selected for play.
 * @property {number}  difficulty Current level, 1–10.
 * @property {string}  symbol    Operator glyph (e.g. "+", "×").
 * @property {string}  label     Chit label.
 */

/**
 * The live operation config: one entry per OpKey. `createDefaultOpConfig()`.
 * @typedef {Record<OpKey, OpConfigEntry>} OpConfig
 */

/**
 * A generated problem. Output of `generateProblem` / `generateWeightedProblem`
 * (game-core). The factor* fields are present only when `opKey === "factor"`.
 * @typedef {Object} Problem
 * @property {string} text                Display text (e.g. "6 × 7").
 * @property {number|string} answer       Canonical answer (numeric, or a string for SI/factor).
 * @property {string} answerText          Human answer string.
 * @property {OpKey}  opKey
 * @property {string} statsKey            Stable key for stats/mastery bucketing.
 * @property {number} [factorOriginal]    factor: the number being factorized.
 * @property {number} [factorRemaining]   factor: product still to be factored out.
 * @property {Object<string,number>} [factorCollected] factor: prime→exponent collected so far.
 */

// ---------------------------------------------------------------------------
// Runtime engine state (script.js)
// ---------------------------------------------------------------------------

/**
 * A falling problem. Built in `createDrop()` (and boss/placement spawners).
 * Carries the Problem fields plus position, motion, and runtime flags.
 * @typedef {Object} Drop
 * @property {number} id                  Unique, from `nextDropId`.
 * @property {number} x                   Horizontal position (CSS px).
 * @property {number} y                   Vertical position; starts at -20, grows downward.
 * @property {number} baseSpeed           Fall speed (px/sec) before the Speed multiplier.
 * @property {string} text
 * @property {number|string} answer
 * @property {string} answerText
 * @property {OpKey}  opKey
 * @property {string} statsKey
 * @property {number} createdAtMs         `performance.now()` at spawn (for response timing).
 * @property {boolean} [revealed]         Shown as solved/labelled (boss reveals, wrong-answer reveals).
 * @property {number} [factorOriginal]
 * @property {number} [factorRemaining]
 * @property {Object<string,number>} [factorCollected]
 * @property {number|null} [factorLastPrime]
 * @property {boolean} [factorComplete]   factor: fully factored.
 * @property {string} [bossKind]          Present on boss-spawned drops (bomb/node/etc.).
 * @property {Object} [placementEntry]    Present on Test Me placement drops.
 */

/**
 * Boss / challenge state machine. Assigned to the module-level `bossMode`
 * (null when not in a boss/challenge). Built in the boss-start path (~script.js
 * `bossMode = { ... }`). Key fields below; see that literal for the full set.
 * @typedef {Object} BossMode
 * @property {boolean} active
 * @property {"full"|"boss"|"wave"|"blitz"} mode     Which run this is.
 * @property {OpKey}  opKey
 * @property {number} level
 * @property {Object} pressure                       Snapshot of the pressure tier in effect.
 * @property {"announce"|"challenge"|"challengeComplete"|"fight"|"victory"|string} phase
 * @property {number} announceMs                     Countdown timers (ms) for the current phase.
 * @property {"challenge"|"boss"} nextAction
 * @property {string} message                        HUD banner text.
 * @property {BossPart[]} parts                       Mothership parts / shields holding problem nodes.
 * @property {Array} debris
 * @property {number} bombTimerMs
 * @property {number} stunMs                          >0 while input is stunned by a landed bomb.
 * @property {"wave"|"blitz"} challengeType
 * @property {number} challengeLoad                   Active simultaneous-drop target (wave/blitz).
 * @property {number} blitzShield                     Blitz endurance shield (0..blitzShieldMax).
 * @property {number} blitzClearedCount
 */

/**
 * One mothership part / shield holding a batch of problem nodes.
 * Built by `buildBossParts()`.
 * @typedef {Object} BossPart
 * @property {string} id
 * @property {boolean} destroyed
 * @property {Array<{revealed:boolean,destroyed:boolean}>} problems  Problem nodes on this part.
 */

// ---------------------------------------------------------------------------
// Stored profile & progress (src/player-progress.js, localStorage)
// ---------------------------------------------------------------------------

/**
 * A persisted player. `createDefaultProfile()` / `createProfileForUser()`.
 * @typedef {Object} StoredProfile
 * @property {number} version
 * @property {{id:string,name:string,createdAt:string,updatedAt:string}} user
 * @property {ProfileSettings} settings
 * @property {Record<OpKey, StoredSkill>} skills
 * @property {SessionLogEntry[]} sessionLog
 */

/**
 * Saved Speed/Drops/Text settings plus per-op levels.
 * @typedef {Object} ProfileSettings
 * @property {number} speed                 0–100 (fall speed + spawn interval).
 * @property {number} rate                  0–10 (active-drop cap).
 * @property {string} pressureTier          Derived tier key for `speed`.
 * @property {"normal"|"large"|"huge"} textSize
 * @property {Record<OpKey, number>} difficulties  Saved current level per op.
 */

/**
 * Per-operation durable stats for one player. `createEmptySkill()`.
 * @typedef {Object} StoredSkill
 * @property {OpKey}  opKey
 * @property {number} currentLevel
 * @property {number} readiness             0–100 (persisted snapshot).
 * @property {boolean} bossReady
 * @property {number} bossThreshold
 * @property {Array}  bossAttempts
 * @property {Array}  levelAdvances
 * @property {SkillTotals} totals
 * @property {Array}  recent                Bounded recent-outcome ring (for recency weighting).
 * @property {Object<string, ProblemStat>} problems  statsKey → per-problem record.
 * @property {Array}  placementCredits      Test Me "placed-out" credit.
 * @property {Object} pressureTiers         Per-pressure-tier compatibility stats.
 * @property {Array}  blitzAttempts
 * @property {Array}  challengeAttempts
 */

/**
 * @typedef {Object} SkillTotals
 * @property {number} attempts
 * @property {number} correct
 * @property {number} wrong
 * @property {number} missed
 * @property {number} helped
 * @property {number} distinct
 * @property {number} currentStreak
 * @property {number} bestStreak
 * @property {number} totalResponseMs
 * @property {number} responseCount
 */

/**
 * One problem's durable record inside `StoredSkill.problems`.
 * @typedef {Object} ProblemStat
 * @property {number} attempts
 * @property {number} correct
 * @property {number} [wrong]
 * @property {number} [missed]
 * @property {number} [helped]
 * @property {Object} [placement]   Set when the fact was placed-out by Test Me.
 */

/**
 * One bounded session record in `StoredProfile.sessionLog`.
 * @typedef {Object} SessionLogEntry
 * @property {string} id
 * @property {string|number} startedAt
 * @property {number} durationMs
 */

// ---------------------------------------------------------------------------
// Derived summaries (computed for the UI, not persisted)
// ---------------------------------------------------------------------------

/**
 * Per-operation summary for the UI. Built in `summarizeProfile()` by spreading
 * `computeSkillReadiness(skill)` (the authoritative source of the readiness
 * fields) and adding current-settings context. Consumed by the results/stats
 * views and the `formatSkill*` helpers in game-core.
 * @typedef {Object} SkillSummary
 * @property {OpKey}  opKey
 * @property {number} currentLevel
 * @property {number} readiness             0–100 (mastered %).
 * @property {boolean} bossReady
 * @property {number} bossThreshold
 * @property {number} attempts
 * @property {number} distinct
 * @property {number} universeCount         Size of the current-level fact set.
 * @property {number} masteredCount
 * @property {number} accuracy              0–1 lifetime.
 * @property {number} recentAccuracy        0–1 recent-weighted.
 * @property {number|null} averageResponseMs
 * @property {number} [blitzUnlockedLevel]
 * @property {PracticeSuggestion[]} practiceSuggestions   Weak/unseen facts to drill next.
 * @property {Array}  challengeBestsByLevel Per-level Blitz/Wave/Worksheet bests.
 */

/**
 * A "practice next" suggestion. Review items (already-attempted weak facts)
 * carry attempt stats; "new" items (unseen facts) do not. Consumers
 * (`formatPracticeNext`) use only the common fields.
 * @typedef {Object} PracticeSuggestion
 * @property {"review"|"new"} kind
 * @property {string} statsKey
 * @property {string} text
 * @property {number} mastery     0–100 (0 for unseen).
 * @property {number} [attempts]
 * @property {number} [correct]
 */

/**
 * Whole-profile summary. `summarizeProfile()`.
 * @typedef {Object} ProfileSummary
 * @property {{id:string,name:string}} user
 * @property {number} overallReadiness
 * @property {number} practicedCount
 * @property {Record<OpKey, SkillSummary>} skills
 */

export {};
