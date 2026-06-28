// Splash particle burst when a drop is cleared.
//
// First of the engine subsystems pulled out of script.js: it OWNS its state
// (the `splashes` array, module-private) and receives the one thing it reads
// from outside — the canvas 2D context — once via initSplashes(). The game loop
// / input / draw pass call create/update/draw; resets call resetSplashes().

let splashes = [];
let ctx = null;

export function initSplashes(context) {
  ctx = context;
}

export function resetSplashes() {
  splashes = [];
}

export function createSplash(drop) {
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

export function updateSplashes(dt) {
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

export function drawSplashes() {
  for (const splash of splashes) {
    const alpha = Math.max(0, splash.life / splash.maxLife);
    ctx.fillStyle = splash.color.replace("{a}", alpha.toFixed(2));
    ctx.beginPath();
    ctx.ellipse(splash.x, splash.y, splash.rx, splash.ry, splash.rotation, 0, Math.PI * 2);
    ctx.fill();
  }
}
