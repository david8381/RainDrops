import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function openApp(page) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/gc.zgo.at/**", (route) => route.abort());

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/?test=1");
  await page.waitForFunction(() => window.__RAIN_MATH_READY__ && window.__RAIN_MATH_TEST__);
  await invoke(page, "reset");

  return { pageErrors };
}

async function invoke(page, method, ...args) {
  return page.evaluate(
    ({ method: methodName, args: methodArgs }) => window.__RAIN_MATH_TEST__[methodName](...methodArgs),
    { method, args }
  );
}

test("loads without page errors and paints the canvas", async ({ page }) => {
  const { pageErrors } = await openApp(page);

  await expect(page).toHaveTitle("Rain Math");
  await expect(page.locator("#canvas")).toBeVisible();
  await expect(page.locator(".stats .label")).toHaveText("Cleared");
  await expect(page.locator(".op-chit")).toHaveCount(9);
  expect(pageErrors).toEqual([]);

  const hasPaintedPixel = await page.locator("#canvas").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
  expect(hasPaintedPixel).toBe(true);
});

test("loads directly from index.html and operation chits respond", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/gc.zgo.at/**", (route) => route.abort());

  await page.goto(pathToFileURL(resolve("index.html")).href);
  await expect(page.locator(".op-chit")).toHaveCount(9);

  await page.locator('.op-chit[data-op="add"]').click();
  await expect(page.locator('.op-chit[data-op="add"]')).toHaveClass(/active/);
});

test.describe("desktop gameplay", () => {
  test.skip(({ isMobile }) => isMobile, "desktop-only input bar flows");

  test("toggles operation chits and builds difficulty controls", async ({ page }) => {
    await openApp(page);

    await page.locator('.op-chit[data-op="si"]').click();
    await page.locator('.op-chit[data-op="factor"]').click();

    await expect(page.locator('.op-chit[data-op="si"]')).toHaveClass(/active/);
    await expect(page.locator('.op-chit[data-op="factor"]')).toHaveClass(/active/);
    await expect(page.locator(".diff-card")).toHaveCount(2);
    await expect(page.locator('.diff-card[data-op="si"] .diff-value')).toHaveText("1");
    await expect(page.locator('.diff-card[data-op="factor"] .diff-value')).toHaveText("1");
    await expect(page.locator('.diff-card[data-op="si"] .diff-ready')).toHaveText("Ready 0%");
    await expect(page.locator('.diff-card[data-op="factor"] .diff-ready')).toHaveText("Ready 0%");
    await expect(page.locator("#inputHint")).toContainText("SI: type *1000 or /100 + Enter");
    await expect(page.locator("#inputHint")).toContainText("p·q: type 2^2*3 + Enter");
  });

  test("requires a Ready click before increasing a level", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    const addCard = page.locator('.diff-card[data-op="add"]');

    await expect(addCard.locator(".diff-value")).toHaveText("1");
    await addCard.locator(".diff-btn").last().click();
    await expect(addCard.locator(".diff-value")).toHaveText("1");
    await expect(addCard.locator(".diff-ready")).toHaveText("Click Ready first");

    await addCard.locator(".diff-ready").click();
    await expect(addCard.locator(".diff-ready")).toHaveText(/Ready 0% ✓/);

    await addCard.locator(".diff-btn").last().click();
    await expect(addCard.locator(".diff-value")).toHaveText("2");
    const state = await invoke(page, "getState");
    expect(state.progressSummary.skills.add.currentLevel).toBe(2);
    expect(state.progressSummary.skills.add.bossAttemptedForLevel).toBe(false);
  });

  test("updates speed, rate, and pace displays", async ({ page }) => {
    await openApp(page);

    await invoke(page, "setControls", { speed: 80, rate: 7, pace: 10 });

    await expect(page.locator("#speedValue")).toHaveText("80%");
    await expect(page.locator("#rateValue")).toHaveText("7");
    await expect(page.locator("#paceValue")).toHaveText("3s");
  });

  test("clears a numeric drop immediately when the answer is typed", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "3 + 5",
      answer: 8,
      answerText: "8",
      statsKey: "3,5",
      y: 120,
    });

    await page.locator("#answer").fill("8");

    await expect(page.locator("#score")).toHaveText("1");
    const state = await invoke(page, "getState");
    expect(state.drops).toHaveLength(0);
    expect(state.problemStats.add["3,5"]).toEqual({ asked: 1, correct: 1 });
  });

  test("results popup shows local readiness progress", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "2 + 3",
      answer: 5,
      answerText: "5",
      statsKey: "2,3",
      y: 120,
    });

    await page.locator("#answer").fill("5");
    const state = await invoke(page, "getState");
    expect(state.progressSummary.skills.add.attempts).toBe(1);
    expect(state.progressSummary.skills.add.totals.correct).toBe(1);
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toHaveText(/Ready [1-9]\d?%/);

    await page.locator("#resultsLink").click();
    await expect(page.locator("#resultsOverlay")).toBeVisible();
    await expect(page.locator("#resultsOverlay h2")).toHaveText("Learning Results");
    await expect(page.locator("#resultsOverlay")).toContainText("Add");
    await expect(page.locator("#resultsOverlay")).toContainText("1 attempts");
    await expect(page.locator("#resultsOverlay")).toContainText("1/9 seen");
    await expect(page.locator("#resultsOverlay")).toContainText("0 mastered");
    await expect(page.locator("#resultsOverlay")).toContainText("Practice next: 2 + 3");
    await expect(page.locator("#resultsOverlay")).toContainText("(new)");
  });

  test("creates and switches local player profiles", async ({ page }) => {
    await openApp(page);

    await expect(page.locator("#loginLink")).toHaveText("Login");
    await page.locator("#loginLink").click();
    await expect(page.locator("#loginOverlay")).toBeVisible();
    await page.locator("#profileNameInput").fill("Ada Lovelace");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.locator("#loginOverlay")).toHaveCount(0);
    await expect(page.locator("#loginLink")).toHaveText("Ada Lovelace");

    await page.locator("#loginLink").click();
    await page.locator("#profileNameInput").fill("Ben");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.locator("#loginLink")).toHaveText("Ben");

    await page.locator("#loginLink").click();
    await page.getByRole("button", { name: /Ada Lovelace/ }).click();
    await expect(page.locator("#loginLink")).toHaveText("Ada Lovelace");

    const state = await invoke(page, "getState");
    expect(state.progressProfile.user.name).toBe("Ada Lovelace");
  });

  test("requires Enter for SI conversion answers", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["si"]);
    await invoke(page, "addDrop", {
      opKey: "si",
      text: "km → m",
      answer: "*1000",
      answerText: "*1000",
      statsKey: "k,base",
      y: 120,
    });

    await page.locator("#answer").fill("*1000");
    await expect(page.locator("#score")).toHaveText("0");

    await page.keyboard.press("Enter");
    await expect(page.locator("#score")).toHaveText("1");
  });

  test("accepts full prime factorization only on Enter", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["factor"]);
    await invoke(page, "addDrop", {
      opKey: "factor",
      text: "12",
      factorOriginal: 12,
      factorRemaining: 12,
      statsKey: "12",
      y: 120,
    });

    await page.locator("#answer").fill("2^2*3");
    await expect(page.locator("#score")).toHaveText("0");

    await page.keyboard.press("Enter");
    await expect(page.locator("#score")).toHaveText("1");
  });

  test("targets factor drops with Tab and requires each factor explicitly", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["factor"]);
    const drop = await invoke(page, "addDrop", {
      opKey: "factor",
      text: "6",
      factorOriginal: 6,
      factorRemaining: 6,
      statsKey: "6",
      y: 120,
    });

    await page.keyboard.press("Tab");
    let state = await invoke(page, "getState");
    expect(state.factorTargetId).toBe(drop.id);

    await page.locator("#answer").fill("2");
    state = await invoke(page, "getState");
    expect(state.score).toBe(0);
    expect(state.drops[0].factorCollected).toEqual({ 2: 1 });
    expect(state.drops[0].factorRemaining).toBe(3);
    expect(state.drops[0].factorComplete).toBe(false);

    await page.locator("#answer").fill("3");
    state = await invoke(page, "getState");
    expect(state.score).toBe(0);
    expect(state.drops[0].factorCollected).toEqual({ 2: 1, 3: 1 });
    expect(state.drops[0].factorRemaining).toBe(1);
    expect(state.drops[0].factorComplete).toBe(true);

    await page.keyboard.press("Enter");
    await expect(page.locator("#score")).toHaveText("1");
  });

  test("pause, restart, feedback, and stats overlays work", async ({ page }) => {
    await openApp(page);

    await page.locator("#pauseBtn").click();
    await expect(page.locator("#pauseOverlay")).toBeVisible();
    await page.locator("#resumeBtnOverlay").click();
    await expect(page.locator("#pauseOverlay")).toBeHidden();

    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "1 + 1",
      answer: 2,
      answerText: "2",
      statsKey: "1,1",
      y: 120,
    });
    await page.locator("#answer").fill("2");
    await expect(page.locator("#score")).toHaveText("1");
    await page.locator("#restartBtn").click();
    await expect(page.locator("#score")).toHaveText("0");

    await page.locator("#feedbackLink").click();
    await expect(page.locator("#feedbackOverlay")).toBeVisible();
    await page.locator("#fbCancel").click();
    await expect(page.locator("#feedbackOverlay")).toBeHidden();

    await invoke(page, "seedStats", "add", { "1,1": { asked: 2, correct: 1 } });
    await page.locator('.diff-card[data-op="add"]').click();
    await expect(page.locator("#statsOverlay")).toBeVisible();
    await expect(page.locator("#statsOverlay h2")).toHaveText("Add — Problem Accuracy");
  });
});

test.describe("mobile gameplay", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile-only keypad flows");

  test("shows the touch keypad and submits numeric answers", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "7 + 5",
      answer: 12,
      answerText: "12",
      statsKey: "7,5",
      y: 120,
    });

    await expect(page.locator("#touchKeypad")).toBeVisible();
    await expect(page.locator(".touch-score")).toContainText("Cleared:");
    await page.locator('.kp-key[data-key="1"]').click();
    await page.locator('.kp-key[data-key="2"]').click();

    await expect(page.locator("#touchScore")).toHaveText("1");
    const state = await invoke(page, "getState");
    expect(state.drops).toHaveLength(0);
  });

  test("updates mobile inline controls", async ({ page }) => {
    await openApp(page);

    await page.locator("#kpSpeedUp").click();
    await page.locator("#kpRateUp").click();
    await page.locator("#kpPaceUp").click();

    await expect(page.locator("#kpSpeedVal")).toHaveText("40%");
    await expect(page.locator("#kpRateVal")).toHaveText("1");
    await expect(page.locator("#kpPaceVal")).toHaveText("8s");
  });

  test("opens results from the touch header", async ({ page }) => {
    await openApp(page);

    await expect(page.locator("#touchResultsLink")).toBeVisible();
    await page.locator("#touchResultsLink").click();

    await expect(page.locator("#resultsOverlay")).toBeVisible();
    await expect(page.locator("#resultsOverlay h2")).toHaveText("Learning Results");
  });

  test("opens login from the touch header", async ({ page }) => {
    await openApp(page);

    await expect(page.locator("#touchLoginLink")).toBeVisible();
    await page.locator("#touchLoginLink").click();

    await expect(page.locator("#loginOverlay")).toBeVisible();
    await expect(page.locator("#loginOverlay h2")).toHaveText("Players");
  });
});
