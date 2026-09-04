// Cross-platform layout screenshots for visual review — a review tool, not a
// regression test. Captures seven states per device profile as
// /tmp/rainmath-shots/<project>-<state>.png, then read the PNGs to eyeball
// each platform. Useful for catching layout breaks that assertions miss.
//
// SHOTS=1 npx playwright test _platform-shots --project=chromium \
//   --project=webkit --project=mobile-chrome --project=mobile-safari --project=ipad
import { test } from "../support/fixtures.js";

// Opt-in: this is a review tool, not a regression test, so it stays out of the
// normal `npm run test:e2e` run. Enable with SHOTS=1:
//   SHOTS=1 npx playwright test _platform-shots --project=mobile-safari
test.skip(!process.env.SHOTS, "set SHOTS=1 to capture platform screenshots");

// Outside test-results/ on purpose — Playwright wipes that dir on every run.
const OUT = "/tmp/rainmath-shots";

async function open(page, query = "") {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/gc.zgo.at/**", (route) => route.abort());
  await page.goto(`/?test=1${query}`);
  await page.waitForFunction(() => window.__RAIN_MATH_READY__ && window.__RAIN_MATH_TEST__);
  return (method, ...args) =>
    page.evaluate(
      ({ m, a }) => window.__RAIN_MATH_TEST__[m](...a),
      { m: method, a: args }
    );
}

const shot = (page, project, name) =>
  page.screenshot({ path: `${OUT}/${project}-${name}.png` });

test("welcome menu", async ({ page }, info) => {
  const call = await open(page, "&welcome=1");
  await call("clearWelcomeSeen");
  await call("showWelcome");
  await page.waitForTimeout(400);
  await shot(page, info.project.name, "1-welcome");
});

test("ready gate", async ({ page }, info) => {
  const call = await open(page);
  await call("reset");
  await call("enableOps", []);
  await page.waitForTimeout(300);
  await shot(page, info.project.name, "2-ready");
});

test("practice with drops", async ({ page }, info) => {
  const call = await open(page);
  await call("reset");
  await call("enableOps", ["add", "sub", "mul"]);
  await call("setControls", { speed: 30, drops: 5 });
  await call("clearDrops");
  await call("addDrop", { x: 140, y: 120, text: "7 + 8", answer: 15 });
  await call("addDrop", { x: 340, y: 240, text: "12 - 5", answer: 7 });
  await call("addDrop", { x: 240, y: 60, text: "6 × 7", answer: 42 });
  await page.waitForTimeout(500);
  await shot(page, info.project.name, "3-practice");
});

// Touch layouts hide `.top-bar` and rebuild the nav links inside the controls
// bar (`#touchLoginLink` etc.), so pick whichever is actually visible.
const isTouch = (page) => page.locator("body.touch-device").count().then(Boolean);

test("login popup", async ({ page }, info) => {
  const call = await open(page);
  await call("reset");
  await page.waitForTimeout(250);
  const id = (await isTouch(page)) ? "#touchLoginLink" : "#loginLink";
  await page.locator(id).click();
  await page.waitForTimeout(400);
  await shot(page, info.project.name, "4-login");
});

test("stats grid popup", async ({ page }, info) => {
  const call = await open(page);
  await call("reset");
  await call("enableOps", ["mul"]);
  // seedStats assigns problemStats[opKey] directly, so it wants a keyed map.
  await call("seedStats", "mul", {
    "3,4": { asked: 6, correct: 6 },
    "5,6": { asked: 4, correct: 1 },
    "7,8": { asked: 3, correct: 2 },
  });
  await page.waitForTimeout(250);
  // Desktop: the "Grid" hint on a diff card. Touch: tapping the diff-strip item.
  const grid = (await isTouch(page))
    ? page.locator("#kpDiffStrip .kp-diff-item").first()
    : page.locator(".diff-grid-hint").first();
  await grid.click();
  await page.waitForTimeout(400);
  await shot(page, info.project.name, "5-stats");
});

test("session report", async ({ page }, info) => {
  const call = await open(page);
  await call("reset");
  await call("enableOps", ["add"]);
  await call("setControls", { speed: 30, drops: 4 });
  await call("addDrop", { x: 200, y: 100, text: "2 + 3", answer: 5, statsKey: "2,3" });
  await call("submit", "5");
  await call("addDrop", { x: 200, y: 100, text: "4 + 4", answer: 8, statsKey: "4,4" });
  await call("submit", "8");
  await page.waitForTimeout(200);
  await call("finishSession");
  await page.waitForTimeout(500);
  await shot(page, info.project.name, "6-report");
});

test("boss fight", async ({ page }, info) => {
  const call = await open(page);
  await call("reset");
  await call("enableOps", ["add"]);
  await call("markReady", "add");
  await call("startBoss", "add");
  await call("skipToBossFight");
  await page.waitForTimeout(600);
  await shot(page, info.project.name, "7-boss");
});
