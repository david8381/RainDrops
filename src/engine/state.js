// Shared mutable runtime state for the engine.
//
// One object so engine modules can import it and read/write the SAME live state
// — ES module bindings are read-only for importers, so shared primitives
// (score, gameSpeed, currentInput, …) must live on an object like this rather
// than as exported `let`s. script.js owns initialization (it sets the dynamic
// ones, e.g. `state.progressProfile = readProfile()`, at startup); the values
// below are the static defaults.
export const state = {
  drops: [],
  score: 0,
  gameSpeed: 30,
  dropLimit: 3,
  textSize: "normal",
  spawnTimer: 0,
  lastTime: 0,
  isPaused: false,
  // A fresh run waits at "ready" — problem types can be toggled but nothing
  // spawns/falls until the player presses Start. Turns true once play begins;
  // Restart returns to this ready state. (Test mode starts already-started.)
  hasStarted: false,
  isBreatherMode: false,
  nextDropId: 0,
  canvasW: 0,
  canvasH: 0,
  groundFlash: 0,
  currentInput: "",
  wrongSubmissionTimes: [],
  cannonOverloadMs: 0,
  cannonOverloadLevel: 0,
  cannonOverloadLastAtMs: 0,
  gameTime: 0,
  ambiguousTimer: null,
  canvasDpr: 1,
  starfield: [],
  lastBossVictory: null,
  factorTargetId: null,
  bossMode: null,
  tutorialStepIndex: 0,
  tutorialFromWelcome: false,
  placementState: null,
  activeSessionId: null,
  progressProfile: null,
  reportViewProfile: null,
  reportViewReports: null,
  recapViewData: null,
};
