// The player's cannon ship, its targeting laser, and the base shield visual.
//
// OWNS its state: the `laser` (or null) and the `playerShip` pose object.
// Everything it reads from the rest of the engine is injected once via
// initShip(): the canvas context, the current canvas size, the game clock, the
// shared rounded-rect helper, and a getter for the shield render state (which
// itself reads boss/placement game state and stays in script.js).
import { clamp } from "../game-core.js";

const PLAYER_SHIP_IDLE_ANGLE = 0;
const PLAYER_SHIP_NOSE_LENGTH = 31;
const PLAYER_SHIP_FIRE_PULSE_MS = 190;
const PLAYER_SHIP_RECOIL_MS = 150;
const PLAYER_SHIP_TURN_MS = 90;
const PLAYER_SHIP_RETURN_MS = 280;

let laser = null;
const playerShip = {
  angle: PLAYER_SHIP_IDLE_ANGLE,
  targetAngle: PLAYER_SHIP_IDLE_ANGLE,
  firePulseMs: 0,
  recoilMs: 0,
  lastTarget: null,
};

let ctx = null;
let getCanvasSize = () => ({ w: 0, h: 0 });
let getGameTime = () => 0;
let getShieldState = () => null;
let fillRoundRect = () => {};

export function initShip(deps) {
  ({ ctx, getCanvasSize, getGameTime, getShieldState, fillRoundRect } = deps);
}

// Test/instrumentation accessors (script.js exposes these on window in test mode).
export function getLaser() {
  return laser;
}
export function getPlayerShip() {
  return playerShip;
}

export function resetLaser() {
  laser = null;
}

export function resetPlayerShipVisuals() {
  playerShip.angle = PLAYER_SHIP_IDLE_ANGLE;
  playerShip.targetAngle = PLAYER_SHIP_IDLE_ANGLE;
  playerShip.firePulseMs = 0;
  playerShip.recoilMs = 0;
  playerShip.lastTarget = null;
}

function normalizeAngleDelta(delta) {
  let next = delta;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function getPlayerShipScale() {
  return clamp(0.74, 1.1, getCanvasSize().w / 760);
}

function getPlayerShipPosition() {
  const scale = getPlayerShipScale();
  const { w, h } = getCanvasSize();
  return { x: w / 2, y: h - 24 * scale, scale };
}

function getPlayerShipNose(angle = playerShip.angle) {
  const ship = getPlayerShipPosition();
  const length = PLAYER_SHIP_NOSE_LENGTH * ship.scale;
  return { x: ship.x + Math.sin(angle) * length, y: ship.y - Math.cos(angle) * length };
}

function getPlayerShipAngleTo(target) {
  const ship = getPlayerShipPosition();
  const targetX = Number.isFinite(target?.x) ? target.x : ship.x;
  const targetY = Number.isFinite(target?.y) ? target.y : ship.y - 120;
  return Math.atan2(targetX - ship.x, ship.y - targetY);
}

export function fireLaser(target) {
  const { w, h } = getCanvasSize();
  const targetX = Number.isFinite(target?.x) ? target.x : w / 2;
  const targetY = Number.isFinite(target?.y) ? target.y : h / 2;
  const targetAngle = getPlayerShipAngleTo({ x: targetX, y: targetY });
  const initialTurn = normalizeAngleDelta(targetAngle - playerShip.angle);
  playerShip.angle += initialTurn * 0.72;
  playerShip.targetAngle = targetAngle;
  playerShip.firePulseMs = PLAYER_SHIP_FIRE_PULSE_MS;
  playerShip.recoilMs = PLAYER_SHIP_RECOIL_MS;
  playerShip.lastTarget = { x: targetX, y: targetY };

  const nose = getPlayerShipNose(playerShip.angle);
  laser = { x1: nose.x, y1: nose.y, x2: targetX, y2: targetY, life: 140, maxLife: 140 };
}

export function updatePlayerShip(dt) {
  const shooting = Boolean(laser) || playerShip.firePulseMs > 0 || playerShip.recoilMs > 0;
  const targetAngle = shooting ? playerShip.targetAngle : PLAYER_SHIP_IDLE_ANGLE;
  const turnMs = shooting ? PLAYER_SHIP_TURN_MS : PLAYER_SHIP_RETURN_MS;
  const ratio = clamp(0, 1, dt / turnMs);
  const delta = normalizeAngleDelta(targetAngle - playerShip.angle);
  playerShip.angle += delta * ratio;
  if (Math.abs(delta) < 0.002) playerShip.angle = targetAngle;

  playerShip.firePulseMs = Math.max(0, playerShip.firePulseMs - dt);
  playerShip.recoilMs = Math.max(0, playerShip.recoilMs - dt);
  if (!shooting && Math.abs(playerShip.angle - PLAYER_SHIP_IDLE_ANGLE) < 0.004) {
    playerShip.lastTarget = null;
  }
}

export function updateLaser(dt) {
  if (!laser) return;
  laser.life -= dt;
  if (laser.life <= 0) laser = null;
}

export function drawLaser() {
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

function drawBlitzShield(ship = getPlayerShipPosition()) {
  const s = getShieldState();
  if (!s) return;
  const shieldY = ship.y + 4 * ship.scale;
  const shieldX = ship.x;
  const ratio = s.ratio;
  const pulse = s.pulse;
  const hit = s.hit;
  const low = ratio <= 0.28 || s.forceLow;
  const color = low ? "248, 113, 113" : "56, 189, 248";
  const arcW = (62 + ratio * 32 + pulse * 6) * ship.scale;
  const arcH = (26 + ratio * 16 + pulse * 4) * ship.scale;

  ctx.save();
  ctx.fillStyle = `rgba(${color}, ${(0.03 + ratio * 0.1 + pulse * 0.05).toFixed(2)})`;
  ctx.strokeStyle = `rgba(${color}, ${(0.36 + ratio * 0.44 + pulse * 0.18).toFixed(2)})`;
  ctx.lineWidth = 2.5 + ratio * 8 + pulse * 3;
  ctx.shadowColor = `rgba(${color}, ${(0.22 + ratio * 0.36).toFixed(2)})`;
  ctx.shadowBlur = 10 + ratio * 18 + pulse * 14;
  ctx.beginPath();
  ctx.ellipse(shieldX, shieldY - 11 * ship.scale, arcW, arcH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (hit > 0 || s.forceLow) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(254, 202, 202, ${(0.36 + hit * 0.46).toFixed(2)})`;
    ctx.lineWidth = 2;
    const crack = (18 + hit * 10) * ship.scale;
    ctx.beginPath();
    ctx.moveTo(shieldX - 22 * ship.scale, shieldY - 34 * ship.scale);
    ctx.lineTo(shieldX - 8 * ship.scale, shieldY - 20 * ship.scale);
    ctx.lineTo(shieldX - 16 * ship.scale, shieldY - 7 * ship.scale);
    ctx.moveTo(shieldX + 20 * ship.scale, shieldY - 33 * ship.scale);
    ctx.lineTo(shieldX + 7 * ship.scale, shieldY - 18 * ship.scale);
    ctx.lineTo(shieldX + crack, shieldY - 9 * ship.scale);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawPlayerShip() {
  const ship = getPlayerShipPosition();
  const fire = clamp(0, 1, playerShip.firePulseMs / PLAYER_SHIP_FIRE_PULSE_MS);
  const recoil = clamp(0, 1, playerShip.recoilMs / PLAYER_SHIP_RECOIL_MS);
  const engineFlicker = 0.5 + Math.sin(getGameTime() * 0.016) * 0.5;
  const flame = 0.45 + engineFlicker * 0.25 + fire * 0.45;

  drawBlitzShield(ship);

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(playerShip.angle);
  ctx.scale(ship.scale, ship.scale);
  ctx.translate(0, recoil * 4);

  ctx.save();
  ctx.globalAlpha = 0.55 + flame * 0.35;
  const flameGradient = ctx.createLinearGradient(0, 14, 0, 42 + fire * 8);
  flameGradient.addColorStop(0, "rgba(125, 211, 252, 0.95)");
  flameGradient.addColorStop(0.38, "rgba(251, 191, 36, 0.82)");
  flameGradient.addColorStop(1, "rgba(249, 115, 22, 0)");
  ctx.fillStyle = flameGradient;
  ctx.beginPath();
  ctx.moveTo(-7 - fire * 2, 13);
  ctx.quadraticCurveTo(0, 34 + flame * 10, 7 + fire * 2, 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.shadowColor = "rgba(56, 189, 248, 0.28)";
  ctx.shadowBlur = 14 + fire * 10;

  const wingGradient = ctx.createLinearGradient(0, -30, 0, 26);
  wingGradient.addColorStop(0, "#64748b");
  wingGradient.addColorStop(0.42, "#1e293b");
  wingGradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = wingGradient;
  ctx.strokeStyle = "rgba(125, 211, 252, 0.68)";
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.bezierCurveTo(13, -18, 20, 0, 30, 19);
  ctx.lineTo(11, 13);
  ctx.lineTo(5, 25);
  ctx.quadraticCurveTo(0, 21, -5, 25);
  ctx.lineTo(-11, 13);
  ctx.lineTo(-30, 19);
  ctx.bezierCurveTo(-20, 0, -13, -18, 0, -32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const bodyGradient = ctx.createLinearGradient(0, -31, 0, 23);
  bodyGradient.addColorStop(0, "#e0f2fe");
  bodyGradient.addColorStop(0.22, "#38bdf8");
  bodyGradient.addColorStop(0.5, "#1e3a8a");
  bodyGradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = "rgba(224, 242, 254, 0.74)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.bezierCurveTo(9, -24, 13, -6, 9, 11);
  ctx.quadraticCurveTo(7, 20, 0, 24);
  ctx.quadraticCurveTo(-7, 20, -9, 11);
  ctx.bezierCurveTo(-13, -6, -9, -24, 0, -34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(14, 165, 233, 0.75)";
  ctx.strokeStyle = "rgba(224, 242, 254, 0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -11, 5.4, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(148, 163, 184, 0.95)";
  fillRoundRect(-19, 2, 5, 13, 2);
  fillRoundRect(14, 2, 5, 13, 2);

  if (fire > 0) {
    ctx.shadowColor = "rgba(96, 180, 240, 0.82)";
    ctx.shadowBlur = 18 * fire;
    ctx.fillStyle = `rgba(224, 242, 254, ${(0.48 + fire * 0.5).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(0, -31, 3.5 + fire * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
