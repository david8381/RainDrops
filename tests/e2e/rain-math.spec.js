import { expect, test } from "../support/fixtures.js";

async function openApp(page) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/gc.zgo.at/**", (route) => route.abort());

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/?test=1");
  await waitForAppReady(page);
  await invoke(page, "reset");

  return { pageErrors };
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => window.__RAIN_MATH_READY__ && window.__RAIN_MATH_TEST__);
}

async function invoke(page, method, ...args) {
  return page.evaluate(
    ({ method: methodName, args: methodArgs }) => window.__RAIN_MATH_TEST__[methodName](...methodArgs),
    { method, args }
  );
}

async function freezeAutoSpawns(page) {
  await invoke(page, "setControls", { speed: 0, drops: 0 });
  await invoke(page, "clearDrops");
}

test("loads without page errors and paints the canvas", async ({ page }) => {
  const { pageErrors } = await openApp(page);

  await expect(page).toHaveTitle("Rain Math");
  await expect(page.locator("#canvas")).toBeVisible();
  await expect(page.locator(".stats .label")).toHaveText("Cleared");
  await expect(page.locator(".op-chit")).toHaveCount(10);
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

test("boots over HTTP through the welcome flow and operation chits respond", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/gc.zgo.at/**", (route) => route.abort());

  // Real boot path (no ?test=1): the app is an ES module served over HTTP.
  await page.goto("/");
  if (await page.locator("#welcomeOverlay").isVisible()) {
    await page.locator("#welcomePlay").click();
  }
  await expect(page.locator(".op-chit")).toHaveCount(10);

  await page.locator('.op-chit[data-op="add"]').click();
  await expect(page.locator('.op-chit[data-op="add"]')).toHaveClass(/active/);
});

test("operation chits show current level and course progress", async ({ page }) => {
  await openApp(page);
  const addChit = page.locator('.op-chit[data-op="add"]');

  await expect(addChit).toHaveAttribute("data-tip", /Level 1 of 10 · Course 10%/);
  await expect(addChit).toHaveAttribute("data-course-progress", "10");

  await invoke(page, "setOpDifficulty", "add", 5, { force: true });
  await expect(addChit).toHaveAttribute("data-tip", /Level 5 of 10 · Course 50%/);
  await expect(addChit).toHaveAttribute("data-level", "5");
  await expect(addChit).toHaveAttribute("data-course-progress", "50");

  const courseProgress = await addChit.evaluate((el) => getComputedStyle(el).getPropertyValue("--course-progress").trim());
  expect(courseProgress).toBe("50%");
});

test("first visit menu creates a player, starts the tutorial, and enters play", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/gc.zgo.at/**", (route) => route.abort());

  await page.goto("/?test=1&welcome=1");
  await page.waitForFunction(() => window.__RAIN_MATH_READY__ && window.__RAIN_MATH_TEST__);

  await expect(page.locator("#welcomeOverlay")).toBeVisible();
  await expect(page.locator(".welcome-card h1")).toHaveText("Rain Math");
  await expect(page.locator("#welcomePlay")).toBeVisible();
  await expect(page.locator("#welcomeTestMe")).toHaveText("Test Me");
  await expect(page.locator(".welcome-support a")).toHaveAttribute("href", "https://ko-fi.com/davidedaniels");
  await expect(page.locator(".welcome-support a")).toHaveText("Donate");
  await expect(page.locator("#supportLink")).toHaveAttribute("href", "https://ko-fi.com/davidedaniels");
  await expect(page.locator(".welcome-profile-list")).toHaveCount(0);
  await expect(page.locator(".welcome-create")).toHaveCount(0);
  await expect(page.locator(".welcome-current-player")).toHaveText("Current player: Local player");
  await expect(page.locator("#welcomeLogin")).toHaveText("Switch / manage players");

  await page.locator("#welcomeLogin").click();
  await expect(page.locator("#loginOverlay")).toBeVisible();
  await expect(page.locator(".login-backup h3")).toHaveText("Backup / Restore");
  await page.locator("#profileNameInput").fill("Grace Hopper");
  await page.getByRole("button", { name: /^Create$/ }).click();
  await expect(page.locator("#loginOverlay")).toHaveCount(0);
  await expect(page.locator("#welcomeOverlay")).toBeVisible();
  await expect(page.locator("#loginLink")).toHaveText("Grace Hopper");
  await expect(page.locator(".welcome-current-player")).toHaveText("Current player: Grace Hopper");

  await page.locator("#welcomeTutorial").click();
  await expect(page.locator("#tutorialOverlay")).toBeVisible();
  await expect(page.locator(".tutorial-kicker")).toContainText("1/8");
  await expect(page.locator(".tutorial-card h2")).toContainText("Choose problem types");

  await page.locator(".tutorial-next").click();
  await expect(page.locator(".tutorial-kicker")).toContainText("2/8");
  await expect(page.locator(".tutorial-card h2")).toContainText("Read the drop");

  await page.locator(".tutorial-skip").click();
  await expect(page.locator("#tutorialOverlay")).toHaveCount(0);
  await expect(page.locator("#welcomeOverlay")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("rainMath.welcomeSeen.v1"))).toBe("1");
});

// Runs on every project (desktop + mobile + iPad): a parent commonly opens a
// shared link on their phone, so the decode/decompress/checksum/view path must
// work on every browser engine, not just desktop.
test("a shared report link opens read-only on this device", async ({ page }) => {
  await openApp(page);
  await invoke(page, "enableOps", ["add"]);
  await invoke(page, "setControls", { speed: 0, drops: 0 });
  await invoke(page, "addDrop", { opKey: "add", text: "1 + 1", answer: 2, answerText: "2", statsKey: "1,1", y: 120 });
  const state = await invoke(page, "submit", "2");
  const code = await invoke(page, "getShareReportCode", state.activeSessionId);
  expect(code.length).toBeGreaterThan(0);
  expect(code.length).toBeLessThan(300);

  const parent = await page.context().newPage();
  await parent.goto(`/?test=1#report=${code}`);
  await parent.waitForFunction(() => window.__RAIN_MATH_READY__ && window.__RAIN_MATH_TEST__);
  await expect(parent.locator("#sessionReportOverlay")).toBeVisible();
  await expect(parent.locator("#sessionReportOverlay")).toContainText("Shared progress (read-only)");
  expect((await parent.evaluate(() => window.__RAIN_MATH_TEST__.getState())).viewingSharedReport).toBe(true);
  await parent.close();
});

test.describe("desktop gameplay", () => {
  test.skip(({ isMobile }) => isMobile, "desktop-only input bar flows");

  test("toggles operation chits and builds difficulty controls", async ({ page }) => {
    await openApp(page);

    await invoke(page, "enableOps", ["si", "factor"]);

    await expect(page.locator('.op-chit[data-op="si"]')).toHaveClass(/active/);
    await expect(page.locator('.op-chit[data-op="factor"]')).toHaveClass(/active/);
    await expect(page.locator(".diff-card")).toHaveCount(2);
    await expect(page.locator('.diff-card[data-op="si"] .diff-value')).toHaveText("1");
    await expect(page.locator('.diff-card[data-op="factor"] .diff-value')).toHaveText("1");
    await expect(page.locator('.diff-card[data-op="si"] .diff-grid-hint')).toHaveText("Grid");
    await expect(page.locator('.diff-card[data-op="factor"] .diff-grid-hint')).toHaveText("Grid");
    await expect(page.locator('.diff-card[data-op="si"] .diff-ready')).toHaveText("Mastered: 0%");
    await expect(page.locator('.diff-card[data-op="factor"] .diff-ready')).toHaveText("Mastered: 0%");
    await expect(page.locator("#inputHint")).toContainText("SI: type *1000 or /100 + Enter");
    await expect(page.locator("#inputHint")).toContainText("p·q: type 2^2*3 + Enter");
  });

  test("rounding operation has its own lane and clears rounded answers", async ({ page }) => {
    await openApp(page);

    await page.locator('.op-chit[data-op="add"]').click();
    await expect(page.locator('.op-chit[data-op="add"]')).toHaveClass(/active/);
    await page.locator('.op-chit[data-op="round"]').click();
    await expect(page.locator('.op-chit[data-op="round"]')).toHaveClass(/active/);
    await expect(page.locator('.op-chit[data-op="add"]')).not.toHaveClass(/active/);
    await expect(page.locator('.diff-card[data-op="round"]')).toBeVisible();
    await invoke(page, "setOpDifficulty", "round", 6, { force: true });
    await expect(page.locator('.diff-card[data-op="round"] .diff-value')).toHaveText("6");

    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "round",
      text: "3.45 ≈ 0.1",
      answer: 3.5,
      answerText: "3.5",
      statsKey: "r:tenth:norm:half",
      y: 120,
    });

    const state = await invoke(page, "submit", "3.50");
    expect(state.drops).toHaveLength(0);
    expect(state.problemStats.round["r:tenth:norm:half"]).toEqual({ asked: 1, correct: 1 });

    await page.locator('.diff-card[data-op="round"] .diff-grid-hint').click();
    await expect(page.locator("#statsOverlay h2")).toHaveText("Rounding — Problem Accuracy");
    await expect(page.locator("#statsOverlay .stats-f10-row")).toHaveCount(4);
    await expect(page.locator("#statsOverlay")).toContainText("nearest 0.1 · normal · half rounds up");
  });

  test("requires mastery before increasing a level and locks controls during boss", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    const addCard = page.locator('.diff-card[data-op="add"]');

    await expect(addCard.locator(".diff-value")).toHaveText("1");
    await addCard.locator(".diff-btn").last().click();
    await expect(addCard.locator(".diff-value")).toHaveText("1");
    await expect(addCard.locator(".diff-ready")).toHaveText("Mastered: 0%");
    await expect(addCard.locator(".diff-level-feedback")).toContainText("Master 100% of L1");
    await expect(addCard.locator(".diff-challenge-lock")).toContainText("Master this level");

    await addCard.locator(".diff-ready").click();
    await expect(addCard.locator(".diff-ready")).toContainText("Master 100% of L1");
    await expect(page.locator("#bossOfferOverlay")).toHaveCount(0);

    await invoke(page, "masterCurrentLevel", "add");
    await addCard.locator(".diff-btn").last().click();
    await expect(addCard.locator(".diff-value")).toHaveText("2");
    let state = await invoke(page, "getState");
    expect(state.progressSummary.skills.add.unlockedLevel).toBe(1);
    expect(state.progressSummary.skills.add.bossAttemptedForLevel).toBe(false);

    await invoke(page, "setOpDifficulty", "add", 1);
    await expect(addCard.locator(".diff-blitz")).toBeVisible();
    await expect(addCard.locator(".diff-blitz")).toHaveText("Blitz L1");

    await invoke(page, "startBoss", "add");
    expect((await invoke(page, "getState")).bossMode.active).toBe(true);
    await expect(addCard.locator(".diff-btn").last()).toBeDisabled();
    await expect(page.locator('.op-chit[data-op="add"]')).toBeDisabled();
    await invoke(page, "setOpDifficulty", "add", 2);
    expect((await invoke(page, "getState")).opConfig.add.difficulty).toBe(1);
  });

  test("updates speed, drops, and text size controls", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);

    await invoke(page, "setControls", { speed: 80, drops: 9, textSize: "huge" });

    await expect(page.locator("#speedValue")).toHaveText("80%");
    await expect(page.locator("#dropLimitValue")).toHaveText("9");
    await expect(page.locator("#textSizeSelect")).toHaveValue("huge");
    await expect(page.locator("#textSizeValue")).toHaveText("Huge");
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toHaveText("Mastered: 0%");

    const state = await invoke(page, "getState");
    expect(state.textSize).toBe("huge");
    expect(state.progressProfile.settings.textSize).toBe("huge");
  });

  test("test me runs as falling drops and applies placed-out credit", async ({ page }) => {
    await openApp(page);

    await page.locator("#testMeLink").click();
    await expect(page.locator("#placementOverlay")).toBeVisible();
    await expect(page.locator(".placement-card h2")).toHaveText("Test Me");

    await page.locator('.placement-op[data-op="add"]').click();
    await expect(page.locator("#placementOverlay")).toHaveCount(0);

    let state = await invoke(page, "advanceDrops", 250);
    expect(state.placementState.active).toBe(true);
    expect(state.scoreReadout.label).toBe("Test Me");
    const drop = state.drops.find((candidate) => candidate.placementRunId);
    expect(drop).toBeTruthy();

    state = await invoke(page, "submit", drop.answerText);
    expect(state.placementState.totalAsked).toBe(1);
    expect(state.placementState.totalCorrect).toBe(1);
    expect(state.progressSummary.skills.add.attempts).toBe(1);

    state = await invoke(page, "acceptPlacement", 3);
    expect(state.placementVisible).toBe(false);
    expect(state.opConfig.add.enabled).toBe(true);
    expect(state.opConfig.add.difficulty).toBe(3);
    expect(state.progressProfile.skills.add.placementCredits.at(-1).placedOutThrough).toBe(2);
    expect(state.progressProfile.skills.add.levelAdvances.map((advance) => advance.level)).toEqual([1, 2]);

    state = await invoke(page, "setOpDifficulty", "add", 2);
    expect(state.opConfig.add.difficulty).toBe(2);
    state = await invoke(page, "setOpDifficulty", "add", 3);
    expect(state.opConfig.add.difficulty).toBe(3);

    const placedEntry = Object.entries(state.progressProfile.skills.add.problems)
      .find(([, problem]) => problem.placementStatus === "placed-out" && problem.attempts === 0);
    expect(placedEntry).toBeTruthy();
    const [placedKey] = placedEntry;
    const [a, b] = placedKey.split(",").map(Number);
    const label = `${a} + ${b} = ${a + b}`;

    await page.locator('.diff-card[data-op="add"] .diff-grid-hint').click();
    const cell = page.locator(`.stats-cell[aria-label^="${label}"]`);
    await expect(cell).toHaveClass(/stats-cell-placed-out/);
    await cell.hover();
    await expect(page.locator("#statsHoverTooltip")).toContainText("Placed out by Test Me");
    await expect(page.locator("#statsHoverTooltip")).toContainText("No attempts yet");
    await expect(page.locator("#statsHoverTooltip")).toContainText("Boss mastered: yes (placement credit)");
  });

  test("test me climbs a level when the shield fills from correct answers", async ({ page }) => {
    await openApp(page);

    await page.locator("#testMeLink").click();
    await page.locator('.placement-op[data-op="add"]').click();

    let state = await invoke(page, "getState");
    expect(state.placementState.level).toBe(1);
    const startShield = state.placementState.shield;
    expect(startShield).toBeGreaterThan(0);
    expect(state.scoreReadout.label).toBe("Test Me");
    expect(state.scoreReadout.value).toContain("🛡");

    // Answer correctly until the shield fills and the run climbs to level 2.
    let guard = 0;
    while (state.placementState.active && state.placementState.level === 1 && guard < 20) {
      guard += 1;
      state = await invoke(page, "advanceDrops", 250);
      const drop = state.drops.find((candidate) => candidate.placementRunId);
      if (!drop) continue;
      state = await invoke(page, "submit", drop.answerText);
    }

    expect(state.placementState.level).toBe(2);
    expect(state.placementState.passedLevel).toBe(1);
  });

  test("placement-advanced levels can reopen choices after real attempts supersede placement credit", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);

    await invoke(page, "addDrop", {
      opKey: "add",
      text: "1 + 1",
      answer: 2,
      answerText: "2",
      statsKey: "1,1",
      y: 120,
    });
    for (let i = 0; i < 3; i += 1) {
      await invoke(page, "submit", "999", { enter: true });
    }

    await invoke(page, "startPlacement", "add", 3);
    let state = await invoke(page, "acceptPlacement", 3);
    expect(state.progressProfile.skills.add.problems["1,1"].placementStatus).toBe("superseded");

    state = await invoke(page, "setOpDifficulty", "add", 2);
    expect(state.opConfig.add.difficulty).toBe(2);
    expect(state.progressSummary.skills.add.bossReady).toBe(false);
    expect(state.progressSummary.skills.add.levelAdvancedForLevel).toBe(true);

    const ready = page.locator('.diff-card[data-op="add"] .diff-ready');
    await expect(ready).toHaveText(/Unlocked:/);
    await expect(ready).toBeEnabled();
    await ready.click();
    await expect(page.locator("#bossOfferOverlay")).toContainText("Level Unlocked");
    await page.getByRole("button", { name: "Boss" }).click();
    state = await invoke(page, "getState");
    expect(state.bossMode.active).toBe(true);
  });

  test("clears a numeric drop immediately when the answer is typed", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "3 + 5",
      answer: 8,
      answerText: "8",
      statsKey: "3,5",
      x: 220,
      y: 120,
    });

    const state = await invoke(page, "submit", "8");
    expect(state.laser).not.toBeNull();
    expect(Math.abs(state.playerShip.targetAngle)).toBeGreaterThan(0.1);
    expect(Math.abs(state.playerShip.angle)).toBeGreaterThan(0.05);
    expect(state.playerShip.firePulseMs).toBeGreaterThan(0);
    expect(state.playerShip.lastTarget).toEqual({ x: 220, y: 120 });

    await expect(page.locator("#score")).toHaveText("1");
    expect(state.drops).toHaveLength(0);
    expect(state.problemStats.add["3,5"]).toEqual({ asked: 1, correct: 1 });
  });

  test("clears a half-value drop when answered as a fraction", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["shapes"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "shapes",
      text: "A△ b=3 h=3",
      answer: 4.5,
      answerText: "4.5",
      statsKey: "tri,A,3,3",
      y: 120,
    });

    // Typing the numerator alone must not penalize while a fractional drop is up.
    await invoke(page, "submit", "9");
    expect((await invoke(page, "getState")).drops).toHaveLength(1);

    await invoke(page, "submit", "9/2");
    await expect(page.locator("#score")).toHaveText("1");
    expect((await invoke(page, "getState")).drops).toHaveLength(0);
  });

  test("clears powers and roots, including a negative power of 10", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["pow"]);
    await freezeAutoSpawns(page);

    // A square clears on the integer answer.
    await invoke(page, "addDrop", { opKey: "pow", text: "7²", answer: 49, answerText: "49", statsKey: "sq,7", y: 120 });
    await invoke(page, "submit", "49");
    await expect(page.locator("#score")).toHaveText("1");

    // A negative power of 10 clears on the decimal answer.
    await invoke(page, "addDrop", { opKey: "pow", text: "10⁻³", answer: 0.001, answerText: "0.001", statsKey: "neg10,3", y: 120 });
    await invoke(page, "submit", "0.001");
    await expect(page.locator("#score")).toHaveText("2");
    expect((await invoke(page, "getState")).drops).toHaveLength(0);
  });

  test("impossible typed input does not penalize every visible drop", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "1 + 2",
      answer: 3,
      answerText: "3",
      statsKey: "1,2",
      y: 120,
    });
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "2 + 2",
      answer: 4,
      answerText: "4",
      statsKey: "2,2",
      y: 180,
    });

    await page.locator("#answer").fill("9");

    const state = await invoke(page, "getState");
    await expect(page.locator("#answer")).toHaveValue("");
    expect(state.problemStats.add).toEqual({});
    expect(state.progressSummary.skills.add.attempts).toBe(0);
  });

  test("rapid impossible submissions briefly overload the cannon", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "2 + 2",
      answer: 4,
      answerText: "4",
      statsKey: "2,2",
      y: 120,
    });

    const overload = await page.evaluate(() => {
      let state;
      for (let i = 0; i < 5; i += 1) {
        state = window.__RAIN_MATH_TEST__.submit("9");
      }
      const hintText = document.getElementById("inputHint")?.textContent || "";
      const blockedState = window.__RAIN_MATH_TEST__.submit("4");
      return { state, hintText, blockedState };
    });
    expect(overload.state.cannonOverloadMs).toBeGreaterThan(0);
    expect(overload.hintText).toContain("Cannon overloaded");
    expect(overload.blockedState.drops).toHaveLength(1);
    expect(overload.blockedState.score).toBe(0);

    let state = await invoke(page, "advanceDrops", 2100);
    expect(state.cannonOverloadMs).toBe(0);
    state = await invoke(page, "submit", "4");
    expect(state.drops).toHaveLength(0);
    expect(state.score).toBe(1);
  });

  test("small answer spaces overload the cannon faster than large ones", async ({ page }) => {
    await openApp(page);

    // Small space: L1 subtraction answers are only {0,1,2} — brute-forceable, so a
    // false fire heats the cannon hard. One miss is tolerated; the second overloads.
    await invoke(page, "enableOps", ["sub"]);
    await invoke(page, "setOpDifficulty", "sub", 1, { force: true });
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "sub", text: "3 - 1", answer: 2, answerText: "2", statsKey: "3,1", y: 120,
    });

    let state = await invoke(page, "submit", "9"); // impossible (sub L1 max answer is 2)
    expect(state.cannonOverloadMs).toBe(0); // one typo is fine
    state = await invoke(page, "submit", "9");
    expect(state.cannonOverloadMs).toBeGreaterThan(0); // small space → 2 misses overload

    // Large space: L10 subtraction has ~20 answers — guessing isn't viable, so the
    // old ~5-miss tolerance holds (each miss costs the minimum).
    await invoke(page, "reset");
    await invoke(page, "enableOps", ["sub"]);
    await invoke(page, "setOpDifficulty", "sub", 10, { force: true });
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "sub", text: "18 - 2", answer: 16, answerText: "16", statsKey: "18,2", y: 120,
    });

    state = await invoke(page, "submit", "98"); // impossible (sub L10 max answer is 19)
    state = await invoke(page, "submit", "97");
    expect(state.cannonOverloadMs).toBe(0); // large space → 2 misses do NOT overload
    for (let i = 0; i < 3; i += 1) state = await invoke(page, "submit", String(90 + i));
    expect(state.cannonOverloadMs).toBeGreaterThan(0); // 5 total misses overload
  });

  test("NumLock does not break numpad answer entry", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "5 + 7",
      answer: 12,
      answerText: "12",
      statsKey: "5,7",
      y: 120,
    });

    await page.locator("#answer").focus();
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "NumLock",
        code: "NumLock",
        bubbles: true,
        cancelable: true,
      }));
      const input = document.getElementById("answer");
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "End",
        code: "Numpad1",
        bubbles: true,
        cancelable: true,
      }));
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "Numpad2",
        bubbles: true,
        cancelable: true,
      }));
    });

    await expect(page.locator("#score")).toHaveText("1");
    const state = await invoke(page, "getState");
    expect(state.drops).toHaveLength(0);
    expect(state.problemStats.add["5,7"]).toEqual({ asked: 1, correct: 1 });
  });

  test("shades falling drops by accuracy hue and attempt evidence", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "seedStats", "add", {
      "1,1": { asked: 4, correct: 0 },
      "4,4": { asked: 1, correct: 1 },
      "2,2": { asked: 10, correct: 10 },
    });

    const untested = await invoke(page, "addDrop", {
      opKey: "add",
      text: "3 + 3",
      answer: 6,
      answerText: "6",
      statsKey: "3,3",
      y: 120,
    });
    const weak = await invoke(page, "addDrop", {
      opKey: "add",
      text: "1 + 1",
      answer: 2,
      answerText: "2",
      statsKey: "1,1",
      y: 180,
    });
    const oneRight = await invoke(page, "addDrop", {
      opKey: "add",
      text: "4 + 4",
      answer: 8,
      answerText: "8",
      statsKey: "4,4",
      y: 240,
    });
    const mastered = await invoke(page, "addDrop", {
      opKey: "add",
      text: "2 + 2",
      answer: 4,
      answerText: "4",
      statsKey: "2,2",
      y: 300,
    });

    const visuals = await Promise.all([
      invoke(page, "getDropVisual", untested.id),
      invoke(page, "getDropVisual", weak.id),
      invoke(page, "getDropVisual", oneRight.id),
      invoke(page, "getDropVisual", mastered.id),
    ]);

    expect(visuals[0].legendColor).toBe("#1a1a2e");
    expect(visuals[0].fillColor).toContain("26, 26, 46");
    expect(visuals[1].legendColor).toBe("rgba(239, 68, 68, 0.84)");
    expect(visuals[1].fillColor).toContain("239, 68, 68");
    expect(visuals[2].legendColor).toBe("rgba(34, 197, 94, 0.34)");
    expect(visuals[2].fillColor).toContain("34, 197, 94");
    expect(visuals[3].legendColor).toBe("rgba(34, 197, 94, 1.00)");
    expect(visuals[3].fillColor).toContain("34, 197, 94");
  });

  test("space starts a breather until visible drops are cleared", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "1 + 2",
      answer: 3,
      answerText: "3",
      statsKey: "1,2",
      y: 120,
    });
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "2 + 2",
      answer: 4,
      answerText: "4",
      statsKey: "2,2",
      y: 180,
    });

    await page.keyboard.press("Space");
    let state = await invoke(page, "getState");
    expect(state.isBreatherMode).toBe(true);
    await expect(page.locator("#breatherHud")).toBeVisible();

    await page.locator("#answer").fill("3");
    state = await invoke(page, "getState");
    expect(state.isBreatherMode).toBe(true);

    await page.locator("#answer").fill("4");
    state = await invoke(page, "getState");
    expect(state.isBreatherMode).toBe(false);
    expect(state.drops).toHaveLength(0);
    await expect(page.locator("#breatherHud")).toBeHidden();
  });

  test("header omits the old results tab while level cards show progress", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
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
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toHaveText("Mastered: 0%");
    await expect(page.locator("#resultsLink")).toHaveCount(0);
    await expect(page.locator('.diff-card[data-op="add"] .diff-grid-hint')).toHaveText("Grid");
  });

  test("session log report shows per-operation stats and mastery changes", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);

    let state;
    for (let i = 0; i < 3; i += 1) {
      await invoke(page, "addDrop", {
        opKey: "add",
        text: "1 + 1",
        answer: 2,
        answerText: "2",
        statsKey: "1,1",
        y: 120,
      });
      state = await invoke(page, "submit", "2");
    }

    expect(state.sessionLog).toHaveLength(1);
    expect(state.sessionLog[0].id).toBe(state.activeSessionId);
    expect(state.sessionLog[0].practice.correct).toBe(3);
    expect(state.sessionLog[0].practice.attempts).toBe(3);
    expect(state.sessionLog[0].operations[0].opKey).toBe("add");
    expect(state.sessionLog[0].operations[0].durationMs).toBeGreaterThan(0);
    expect(state.sessionLog[0].operations[0].started.readiness).toBe(0);
    expect(state.sessionLog[0].operations[0].ended.readiness).toBe(11);

    await page.locator("#sessionLogLink").click();
    await expect(page.locator("#sessionLogOverlay")).toBeVisible();
    await expect(page.locator("#sessionLogOverlay")).toContainText("Session Log");
    await expect(page.locator("#sessionLogOverlay")).toContainText("current");
    await expect(page.locator("#sessionLogOverlay")).toContainText("Practice: 3/3 correct (100%)");

    await page.locator(".session-log-report").click();
    await expect(page.locator("#sessionReportOverlay")).toBeVisible();
    await expect(page.locator("#sessionReportOverlay h2")).toHaveText("Session Report");
    await expect(page.locator("#sessionReportOverlay")).toContainText("Add");
    await expect(page.locator("#sessionReportOverlay")).toContainText("Correct/missed: 3/0");
    await expect(page.locator("#sessionReportOverlay .session-report-mastery-title")).toContainText("Mastery by level");
    await expect(page.locator("#sessionReportOverlay .session-report-level-line")).toContainText("L1 0% -> 11%");
    await expect(page.locator("#sessionReportOverlay")).toContainText("0/9 -> 1/9 mastered");
    await expect(page.locator("#sessionReportOverlay .session-report-donate-note")).toContainText("Enjoying and benefiting? Please consider donating.");
    await expect(page.locator("#sessionReportOverlay .session-report-donate")).toHaveText("donating");
  });

  test("session duration uses active time instead of long idle wall-clock", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", { opKey: "add", text: "1 + 1", answer: 2, answerText: "2", statsKey: "1,1", y: 120 });
    await invoke(page, "submit", "2");

    await invoke(page, "backdateActiveSession", 6 * 60 * 60 * 1000);
    await page.locator("#sessionLogLink").click();

    const state = await invoke(page, "getState");
    const durationMs = state.sessionLog[0].durationMs;
    expect(durationMs).toBeGreaterThanOrEqual(119_000);
    expect(durationMs).toBeLessThan(3 * 60 * 1000);

    const expectedDurations = await page.evaluate(
      (ms) => [0, 1000, 2000].map((delta) => window.RainMathCore.formatDuration(ms + delta)),
      durationMs
    );
    const durationPattern = new RegExp(
      expectedDurations.map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
    );
    await expect(page.locator("#sessionLogOverlay")).toContainText(durationPattern);
    await page.locator(".session-log-report").click();
    await expect(page.locator("#sessionReportOverlay")).toContainText(durationPattern);
  });

  test("reloads within the grace window resume the same session report", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", { opKey: "add", text: "1 + 1", answer: 2, answerText: "2", statsKey: "1,1", y: 120 });
    const beforeReload = await invoke(page, "submit", "2");
    const sessionId = beforeReload.activeSessionId;

    await page.reload();
    await waitForAppReady(page);

    let state = await invoke(page, "getState");
    expect(state.activeSessionId).toBe(sessionId);
    expect(state.sessionLog).toHaveLength(1);
    expect(state.sessionLog[0].practice.correct).toBe(1);

    await invoke(page, "addDrop", { opKey: "add", text: "2 + 2", answer: 4, answerText: "4", statsKey: "2,2", y: 120 });
    state = await invoke(page, "submit", "4");
    expect(state.activeSessionId).toBe(sessionId);
    expect(state.sessionLog).toHaveLength(1);
    expect(state.sessionLog[0].practice.correct).toBe(2);
  });

  test("stale sessions start a new report row on reload", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", { opKey: "add", text: "1 + 1", answer: 2, answerText: "2", statsKey: "1,1", y: 120 });
    const beforeReload = await invoke(page, "submit", "2");
    await invoke(page, "backdateActiveSession", 31 * 60 * 1000, { deactivate: true });

    await page.reload();
    await waitForAppReady(page);

    const state = await invoke(page, "getState");
    expect(state.activeSessionId).not.toBe(beforeReload.activeSessionId);
    expect(state.sessionLog).toHaveLength(2);
    expect(state.sessionLog[0].id).toBe(state.activeSessionId);
    expect(state.sessionLog[1].id).toBe(beforeReload.activeSessionId);
  });

  test("Finish stops play, opens the combined report, and keeps later work in the same session", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add", "sub"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", { opKey: "add", text: "1 + 1", answer: 2, answerText: "2", statsKey: "1,1", y: 120 });
    const beforeFinish = await invoke(page, "submit", "2");

    await page.locator("#finishBtn").click();
    await expect(page.locator("#sessionReportOverlay")).toBeVisible();
    await expect(page.locator("#sessionReportShare")).toBeVisible();
    await expect(page.locator("#sessionReportOverlay")).toContainText("Correct/missed: 1/0");

    let state = await invoke(page, "getState");
    expect(state.activeSessionId).toBe(beforeFinish.activeSessionId);
    expect(state.drops).toHaveLength(0);
    expect(state.opConfig.add.enabled).toBe(false);
    expect(state.opConfig.sub.enabled).toBe(false);

    await page.locator('#sessionReportOverlay button:has-text("Close")').click();
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "addDrop", { opKey: "add", text: "2 + 2", answer: 4, answerText: "4", statsKey: "2,2", y: 120 });
    state = await invoke(page, "submit", "4");
    expect(state.activeSessionId).toBe(beforeFinish.activeSessionId);
    expect(state.sessionLog).toHaveLength(1);
    expect(state.sessionLog[0].practice.correct).toBe(2);
  });

  test("session report breaks out boss and challenge activity", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);

    await invoke(page, "recordSessionChallenge", {
      action: "start",
      type: "full",
      opKey: "add",
      level: 1,
    });
    await invoke(page, "recordSessionChallenge", {
      action: "complete",
      type: "boss",
      opKey: "add",
      level: 1,
      cleared: true,
      durationMs: 65000,
      score: 9,
    });

    await page.locator("#sessionLogLink").click();
    await page.locator(".session-log-report").click();
    await expect(page.locator("#sessionReportOverlay")).toContainText("Challenges: 1 started, 1 completed");
    await expect(page.locator("#sessionReportOverlay")).toContainText("1 cleared");
    await expect(page.locator("#sessionReportOverlay")).toContainText("best worksheet 1:05");
    await expect(page.locator("#sessionReportOverlay")).toContainText("activity: Worksheet 2");
  });

  test("shares a single report a parent opens straight to the report, read-only", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);

    for (let i = 0; i < 3; i += 1) {
      await invoke(page, "addDrop", {
        opKey: "add",
        text: "1 + 1",
        answer: 2,
        answerText: "2",
        statsKey: "1,1",
        y: 120,
      });
      await invoke(page, "submit", "2");
    }
    const state = await invoke(page, "getState");
    const sessionId = state.activeSessionId;

    // The kid opens their report and sees Share + Copy buttons.
    await page.locator("#sessionLogLink").click();
    await page.locator(".session-log-report").click();
    await expect(page.locator("#sessionReportShare")).toBeVisible();
    await expect(page.locator("#sessionReportCopy")).toBeVisible();
    const code = await invoke(page, "getShareReportCode", sessionId);
    expect(code.length).toBeGreaterThan(0);
    expect(code.length).toBeLessThan(300);

    // A parent opening the link (fresh page = cold load) lands straight on that
    // report, read-only — no log list, no share button.
    const parent = await page.context().newPage();
    await parent.goto(`/?test=1#report=${code}`);
    await parent.waitForFunction(() => window.__RAIN_MATH_READY__ && window.__RAIN_MATH_TEST__);
    await expect(parent.locator("#sessionReportOverlay")).toBeVisible();
    await expect(parent.locator("#sessionReportOverlay")).toContainText("Shared progress (read-only)");
    await expect(parent.locator("#sessionReportOverlay")).toContainText("Correct/missed: 3/0");
    await expect(parent.locator("#sessionReportShare")).toHaveCount(0);
    await expect(parent.locator("#sessionLogOverlay")).toHaveCount(0);
    let viewState = await parent.evaluate(() => window.__RAIN_MATH_TEST__.getState());
    expect(viewState.viewingSharedReport).toBe(true);

    // Exiting the shared view returns to normal play.
    await parent.locator('#sessionReportOverlay button:has-text("Exit shared view")').click();
    viewState = await parent.evaluate(() => window.__RAIN_MATH_TEST__.getState());
    expect(viewState.viewingSharedReport).toBe(false);
    await expect(parent.locator("#sessionReportOverlay")).toHaveCount(0);
    await parent.close();
  });

  test("opens a shared report when the hash changes on an already-loaded page", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", { opKey: "add", text: "1 + 1", answer: 2, answerText: "2", statsKey: "1,1", y: 120 });
    const state = await invoke(page, "submit", "2");
    const code = await invoke(page, "getShareReportCode", state.activeSessionId);

    // Same tab already open: only the hash changes (no reload) — the view should
    // still open via the hashchange listener.
    await page.evaluate((c) => { window.location.hash = `#report=${c}`; }, code);
    await expect(page.locator("#sessionReportOverlay")).toBeVisible();
    await expect(page.locator("#sessionReportOverlay")).toContainText("Shared progress (read-only)");
    expect((await invoke(page, "getState")).viewingSharedReport).toBe(true);

    // A broken link surfaces a friendly message instead of doing nothing.
    await page.locator('#sessionReportOverlay button:has-text("Exit shared view")').click();
    await page.evaluate(() => { window.location.hash = "#report=1this-is-not-valid-deflate"; });
    await expect(page.locator("#bossOfferToast")).toContainText("broken or incomplete");
  });

  test("rejects a tampered report link via the hidden checksum", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", { opKey: "add", text: "1 + 1", answer: 2, answerText: "2", statsKey: "1,1", y: 120 });
    const state = await invoke(page, "submit", "2");

    // A valid link opens; an edited-content link (stale checksum) is rejected.
    const good = await invoke(page, "getShareReportCode", state.activeSessionId);
    const tampered = await invoke(page, "getTamperedReportCode", state.activeSessionId);
    expect(tampered).not.toEqual(good);

    const parent = await page.context().newPage();
    await parent.goto(`/?test=1#report=${tampered}`);
    await parent.waitForFunction(() => window.__RAIN_MATH_READY__ && window.__RAIN_MATH_TEST__);
    await expect(parent.locator("#bossOfferToast")).toContainText("broken or incomplete");
    await expect(parent.locator("#sessionReportOverlay")).toHaveCount(0);
    expect((await parent.evaluate(() => window.__RAIN_MATH_TEST__.getState())).viewingSharedReport).toBe(false);
    await parent.close();
  });

  test("stats grid hover text shows problem attempts and mastery state", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "2 + 3",
      answer: 5,
      answerText: "5",
      statsKey: "2,3",
      y: 120,
    });
    await page.locator("#answer").fill("5");

    await page.locator('.diff-card[data-op="add"] .diff-grid-hint').click();
    const cell = page.locator('.stats-cell[aria-label^="2 + 3 = 5"]');
    await cell.hover();
    await expect(page.locator("#statsHoverTooltip")).toContainText("Attempts: 1");
    await expect(page.locator("#statsHoverTooltip")).toContainText("Current accuracy: 100%");
    await expect(page.locator("#statsHoverTooltip")).toContainText("Boss mastered: no");
  });

  test("SI stats popup renders the prefix reference table", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["si"]);

    await page.locator('.diff-card[data-op="si"] .diff-grid-hint').click();

    const refTable = page.locator(".si-ref-table");
    await expect(refTable).toBeVisible();
    await expect(page.locator(".si-ref-title")).toHaveText("Prefix Reference");
    // 1 header row + 13 prefix rows, descending exponent order.
    await expect(refTable.locator("tr")).toHaveCount(14);

    const kiloRow = refTable.locator("tr", { hasText: "kilo" });
    await expect(kiloRow).toContainText("10³");
    await expect(kiloRow).toContainText("1,000");
  });

  test("creates and switches local player profiles", async ({ page }) => {
    await openApp(page);
    const firstSession = (await invoke(page, "getState")).activeSessionId;

    await expect(page.locator("#loginLink")).toHaveText("Login");
    await page.locator("#loginLink").click();
    await expect(page.locator("#loginOverlay")).toBeVisible();
    await page.locator("#profileNameInput").fill("Ada Lovelace");
    await page.getByRole("button", { name: /^Create$/ }).click();
    await expect(page.locator("#loginOverlay")).toHaveCount(0);
    await expect(page.locator("#loginLink")).toHaveText("Ada Lovelace");
    const adaFirstSession = (await invoke(page, "getState")).activeSessionId;
    expect(adaFirstSession).not.toBe(firstSession);

    await page.locator("#loginLink").click();
    await page.locator("#profileNameInput").fill("Ben");
    await page.getByRole("button", { name: /^Create$/ }).click();
    await expect(page.locator("#loginLink")).toHaveText("Ben");
    const benSession = (await invoke(page, "getState")).activeSessionId;
    expect(benSession).not.toBe(adaFirstSession);

    await page.locator("#loginLink").click();
    await page.locator(".login-profile-row", { hasText: "Ada Lovelace" }).locator(".login-profile-btn").click();
    await expect(page.locator("#loginLink")).toHaveText("Ada Lovelace");
    const adaSecondSession = (await invoke(page, "getState")).activeSessionId;
    expect(adaSecondSession).not.toBe(adaFirstSession);
    expect(adaSecondSession).not.toBe(benSession);

    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "2 + 2",
      answer: 4,
      answerText: "4",
      statsKey: "2,2",
      y: 120,
    });
    await page.locator("#answer").fill("4");
    let state = await invoke(page, "getState");
    expect(state.progressProfile.user.name).toBe("Ada Lovelace");
    expect(state.progressSummary.skills.add.attempts).toBe(1);

    await page.locator("#loginLink").click();
    await page.getByRole("button", { name: "Clear Current Stats" }).click();
    await expect(page.locator("#loginOverlay")).toHaveCount(0);
    await expect(page.locator("#loginLink")).toHaveText("Ada Lovelace");
    await expect(page.locator("#score")).toHaveText("0");
    state = await invoke(page, "getState");
    expect(state.progressProfile.user.name).toBe("Ada Lovelace");
    expect(state.progressSummary.skills.add.attempts).toBe(0);
  });

  test("deletes local player profiles without stranding the active player", async ({ page }) => {
    await openApp(page);
    page.on("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Delete");
      await dialog.accept();
    });

    await page.locator("#loginLink").click();
    await page.locator("#profileNameInput").fill("Ada");
    await page.getByRole("button", { name: /^Create$/ }).click();
    await page.locator("#loginLink").click();
    await page.locator("#profileNameInput").fill("Ben");
    await page.getByRole("button", { name: /^Create$/ }).click();
    await expect(page.locator("#loginLink")).toHaveText("Ben");

    await page.locator("#loginLink").click();
    await page.getByRole("button", { name: "Delete Ada" }).click();
    await expect(page.locator("#loginOverlay")).toHaveCount(0);
    await expect(page.locator("#loginLink")).toHaveText("Ben");
    let profiles = await page.evaluate(() => window.RainMathProgress.getProfileList());
    expect(profiles.map((profile) => profile.name)).toEqual(["Ben", "Local Player"]);
    expect(profiles.find((profile) => profile.name === "Ben").active).toBe(true);

    await page.locator("#loginLink").click();
    await page.getByRole("button", { name: "Delete Ben" }).click();
    await expect(page.locator("#loginLink")).toHaveText("Login");
    profiles = await page.evaluate(() => window.RainMathProgress.getProfileList());
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("Local Player");
    expect(profiles[0].active).toBe(true);

    await page.locator("#loginLink").click();
    await page.getByRole("button", { name: "Delete Local Player" }).click();
    profiles = await page.evaluate(() => window.RainMathProgress.getProfileList());
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe("local-default");
    expect(profiles[0].name).toBe("Local Player");
    expect(profiles[0].active).toBe(true);
  });

  test("backs up and restores the active local player profile", async ({ page }) => {
    await openApp(page);

    await page.locator("#loginLink").click();
    await expect(page.locator(".login-backup h3")).toHaveText("Backup / Restore");
    await page.locator("#profileNameInput").fill("Ada Backup");
    await page.getByRole("button", { name: /^Create$/ }).click();

    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "2 + 2",
      answer: 4,
      answerText: "4",
      statsKey: "2,2",
      y: 120,
    });
    let state = await invoke(page, "submit", "4");
    expect(state.progressProfile.user.name).toBe("Ada Backup");
    expect(state.progressSummary.skills.add.attempts).toBe(1);

    const code = await invoke(page, "getBackupCode");
    expect(code).toMatch(/^RMBAK1:/);

    await page.locator("#loginLink").click();
    await page.getByRole("button", { name: "Clear Current Stats" }).click();
    state = await invoke(page, "getState");
    expect(state.progressProfile.user.name).toBe("Ada Backup");
    expect(state.progressSummary.skills.add.attempts).toBe(0);

    const restored = await invoke(page, "restoreBackup", code, { confirmReplace: false });
    expect(restored.ok).toBe(true);
    expect(restored.replaced).toBe(true);
    state = await invoke(page, "getState");
    expect(state.progressProfile.user.name).toBe("Ada Backup");
    expect(state.progressSummary.skills.add.attempts).toBe(1);

    const tampered = await invoke(page, "getTamperedBackupCode");
    const bad = await invoke(page, "restoreBackup", tampered, { confirmReplace: false });
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain("damaged");

    const newer = await invoke(page, "getNewerBackupCode");
    const unsupported = await invoke(page, "restoreBackup", newer, { confirmReplace: false });
    expect(unsupported.ok).toBe(false);
    expect(unsupported.message).toContain("newer version");

    state = await invoke(page, "deletePlayer", state.progressProfile.user.id);
    expect(state.progressProfile.user.name).toBe("Local Player");
    expect(state.progressSummary.skills.add.attempts).toBe(0);

    const restoredAfterDelete = await invoke(page, "restoreBackup", code, { confirmReplace: false });
    expect(restoredAfterDelete.ok).toBe(true);
    expect(restoredAfterDelete.replaced).toBe(false);
    state = await invoke(page, "getState");
    expect(state.progressProfile.user.name).toBe("Ada Backup");
    expect(state.progressSummary.skills.add.attempts).toBe(1);
  });

  test("boss mode starts from a level card, then boss bombs stun input", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);

    const ready = page.locator('.diff-card[data-op="add"] .diff-ready');
    await expect(ready).toBeEnabled();
    await expect(ready).toHaveText("Mastered: 0%");
    await expect(ready).toHaveClass(/is-locked/);
    await expect(page.locator('.diff-card[data-op="add"] .diff-challenge-lock')).toContainText("Master this level");

    await invoke(page, "masterCurrentLevel", "add");
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toHaveText("Mastered: 100%");
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toBeEnabled();
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toHaveClass(/is-ready-attention/);
    await page.locator('.diff-card[data-op="add"] .diff-ready').click();
    await expect(page.locator("#bossOfferOverlay")).toContainText("Level Mastered");
    await page.locator(".boss-offer-start").click();
    expect((await invoke(page, "getState")).bossMode.active).toBe(true);
    await expect(page.locator("#bossHudTitle")).toContainText("Add Boss");
    await expect(page.locator("#bossHudStatus")).toHaveText("Wave 1: shields up");

    let state = await invoke(page, "getState");
    expect(state.bossMode.active).toBe(true);
    expect(state.bossMode.phase).toBe("announce");

    state = await invoke(page, "advanceBossTime", 1400);
    expect(state.bossMode.phase).toBe("challenge");
    expect(state.bossMode.challengeType).toBe("blitz");
    await expect(page.locator("#bossHudMeta")).toContainText("Solved");
    await expect(page.locator("#bossHudMeta")).toContainText("drops");
    await invoke(page, "advanceBossTime", 30000);
    await expect(page.locator("#bossHudMeta")).toContainText("drops");
    state = await invoke(page, "triggerBossBombHit");
    expect(state.bossMode.phase).toBe("challenge");
    expect(state.bossMode.blitzShield).toBe(15);
    await expect(page.locator("#bossHudStatus")).toHaveText("Bomb hit: shields -5");

    state = await invoke(page, "skipToBossFight");
    expect(state.bossMode.phase).toBe("boss");
    state = await invoke(page, "triggerBossBombHit");
    expect(state.bossMode.stunMs).toBeGreaterThan(0);
    await expect(page.locator("#bossHud")).toHaveClass(/is-stunned/);
    await expect(page.locator("#bossHudMeta")).toContainText("Stunned");
  });

  test("boss credit uses the speed and drops locked at boss start", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "setControls", { speed: 30, drops: 3 });
    await invoke(page, "startBoss", "add");

    await expect(page.locator("#speedSlider")).toBeDisabled();
    await expect(page.locator("#dropLimitSlider")).toBeDisabled();
    await invoke(page, "setControls", { speed: 90, drops: 10 });
    const state = await invoke(page, "forceBossVictory");
    const actualClear = state.progressProfile.skills.add.bossAttempts.find((attempt) => (
      attempt.level === 1 && attempt.inferred === false
    ));

    expect(actualClear.pressureTier).toBe("steady");
    expect(actualClear.speedPercent).toBe(30);
    expect(actualClear.spawnRate).toBe(3);
  });

  test("boss wrong answers and landed bombs do not update practice accuracy", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    await invoke(page, "advanceBossTime", 1400);

    await invoke(page, "addDrop", {
      opKey: "add",
      text: "1 + 2",
      answer: 3,
      answerText: "3",
      statsKey: "1,2",
      bossKind: "bomb",
      y: 120,
    });
    let state = await invoke(page, "submit", "9", { enter: true });
    expect(state.bossMode.phase).toBe("challenge");
    expect(state.bossMode.blitzShield).toBe(20);
    expect(state.problemStats.add).toEqual({});
    expect(state.progressSummary.skills.add.attempts).toBe(0);
    expect(state.progressProfile.skills.add.problems).toEqual({});

    await invoke(page, "clearDrops");
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "2 + 2",
      answer: 4,
      answerText: "4",
      statsKey: "2,2",
      bossKind: "bomb",
      y: 10000,
      baseSpeed: 0,
    });
    state = await invoke(page, "advanceDrops", 16);
    expect(state.bossMode.phase).toBe("challenge");
    expect(state.bossMode.blitzShield).toBe(15);
    expect(state.problemStats.add).toEqual({});
    expect(state.progressSummary.skills.add.attempts).toBe(0);
    expect(state.progressProfile.skills.add.problems).toEqual({});
  });

  test("blitz records a shield endurance score without advancing the level", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    await invoke(page, "forceBossVictory");
    await invoke(page, "advanceBossTime", 2500);
    await page.locator(".boss-victory-next").click();

    const addCard = page.locator('.diff-card[data-op="add"]');
    await expect(addCard.locator(".diff-value")).toHaveText("2");
    // Replays live on the cleared level; select it to reach them.
    await invoke(page, "setOpDifficulty", "add", 1);
    await expect(addCard.locator(".diff-blitz")).toHaveText("Blitz L1");

    await addCard.locator(".diff-blitz").click();
    let state = await invoke(page, "getState");
    expect(state.bossMode.mode).toBe("blitz");
    expect(state.bossMode.level).toBe(1);
    await expect(page.locator("#bossHudTitle")).toContainText("Add Blitz");
    await expect(page.locator("#bossHudStatus")).toContainText("Blitz");
    expect(state.bossMode.blitzShield).toBe(20);
    await expect(page.locator("#bossHudMeta")).toContainText("Shields 20/30");

    await invoke(page, "addDrop", {
      opKey: "add",
      text: "1 + 2",
      answer: 3,
      answerText: "3",
      statsKey: "1,2",
      bossKind: "bomb",
      y: 120,
    });
    state = await invoke(page, "submit", "3");
    expect(state.bossMode.phase).toBe("challenge");
    expect(state.bossMode.blitzShield).toBe(21);
    expect(state.progressSummary.skills.add.attempts).toBe(0);
    expect(state.problemStats.add).toEqual({});
    await expect(page.locator("#bossHudMeta")).toContainText("Shields 21/30");

    state = await invoke(page, "triggerBossBombHit");
    expect(state.bossMode.phase).toBe("challenge");
    expect(state.bossMode.blitzShield).toBe(16);
    await expect(page.locator("#bossHudStatus")).toHaveText("Bomb hit: shields -5");

    for (let i = 0; i < 4; i += 1) {
      state = await invoke(page, "triggerBossBombHit");
    }
    expect(state.bossMode.phase).toBe("challengeComplete");
    expect(state.bossMode.transitionAction).toBe("end");
    await expect(page.locator("#bossHudStatus")).toContainText("Shields are down. Blitz lasted");

    state = await invoke(page, "advanceBossTime", 1900);
    expect(state.opConfig.add.difficulty).toBe(1); // blitz does not change the level
    expect(state.progressProfile.skills.add.blitzAttempts.at(-1).level).toBe(1);
    expect(state.progressProfile.skills.add.blitzAttempts.at(-1).result).toBe("shields-down");
    expect(state.progressProfile.skills.add.blitzAttempts.at(-1).durationMs).toBeGreaterThanOrEqual(0);
    expect(state.progressProfile.skills.add.blitzAttempts.at(-1).fastestDropSeconds).toBeGreaterThan(0);
  });

  test("full boss mode runs Wave 1, Wave 2, then the mothership", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "masterCurrentLevel", "add");

    await page.locator('.diff-card[data-op="add"] .diff-ready').click();
    await page.locator(".boss-offer-start").click();
    let state = await invoke(page, "advanceBossTime", 1400);
    expect(state.bossMode.mode).toBe("full");
    expect(state.bossMode.phase).toBe("challenge");
    expect(state.bossMode.challengeType).toBe("blitz");

    for (let i = 0; i < 4; i += 1) {
      state = await invoke(page, "triggerBossBombHit");
    }
    expect(state.bossMode.phase).toBe("challengeComplete");
    expect(state.bossMode.transitionAction).toBe("wave");
    await expect(page.locator("#bossHudStatus")).toContainText("Super weapon");

    state = await invoke(page, "advanceBossTime", 1900);
    expect(state.bossMode.phase).toBe("challenge");
    expect(state.bossMode.challengeType).toBe("wave");
    await expect(page.locator("#bossHudMeta")).toContainText("fixed");
    expect(state.bossMode.challengeLoad).toBe(1);
    const waveMetaBefore = await page.locator("#bossHudMeta").textContent();

    // Wave 2 steps up the load only after the current round is fully cleared.
    state = await invoke(page, "advanceBossTime", 400); // spawn round 1 (1 bomb)
    const bomb = state.drops.find((drop) => drop.bossKind === "bomb");
    expect(bomb).toBeTruthy();
    expect(state.bossMode.challengeLoad).toBe(1);
    await invoke(page, "submit", bomb.answerText);
    state = await invoke(page, "advanceBossTime", 400); // round cleared -> step to 2
    expect(state.bossMode.challengeLoad).toBe(2);
    await expect(page.locator("#bossHudMeta")).toContainText("trying 2");
    expect(state.bossMode.waveMaxLoadCleared).toBe(1);
    const waveMetaAfter = await page.locator("#bossHudMeta").textContent();
    expect(waveMetaAfter.match(/fixed \d+% speed/)?.[0]).toBe(waveMetaBefore.match(/fixed \d+% speed/)?.[0]);

    for (let i = 0; i < 5; i += 1) {
      state = await invoke(page, "triggerBossBombHit");
    }
    expect(state.bossMode.phase).toBe("challengeComplete");
    expect(state.bossMode.transitionAction).toBe("boss");
    await expect(page.locator("#bossHudStatus")).toContainText("Super weapon clears the path");

    state = await invoke(page, "advanceBossTime", 1900);
    expect(state.bossMode.phase).toBe("boss");

    state = await invoke(page, "forceBossVictory");
    expect(state.opConfig.add.difficulty).toBe(2);
    const attempts = state.progressProfile.skills.add.challengeAttempts;
    expect(attempts.some((attempt) => attempt.type === "blitz" && attempt.level === 1)).toBe(true);
    expect(attempts.some((attempt) => attempt.type === "wave" && attempt.level === 1)).toBe(true);
    expect(attempts.some((attempt) => attempt.type === "boss" && attempt.level === 1 && attempt.cleared)).toBe(true);
    expect(state.sessionLog[0].challenges.started).toBe(1);
    expect(state.sessionLog[0].challenges.completed).toBe(1);
  });

  test("wave and worksheet replay buttons save challenge bests for the cleared level", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    await invoke(page, "forceBossVictory");
    await invoke(page, "advanceBossTime", 2500);
    await page.locator(".boss-victory-next").click();

    const addCard = page.locator('.diff-card[data-op="add"]');
    // Replays live on the cleared level; select it to reach them.
    await invoke(page, "setOpDifficulty", "add", 1);
    await expect(addCard.locator(".diff-wave")).toHaveText("Wave L1");
    await expect(addCard.locator(".diff-boss")).toHaveText("Worksheet L1");

    await addCard.locator(".diff-wave").click();
    let state = await invoke(page, "advanceBossTime", 1400);
    expect(state.bossMode.mode).toBe("wave");
    expect(state.bossMode.challengeType).toBe("wave");
    expect(state.bossMode.challengeLoad).toBe(1);

    for (let i = 0; i < 4; i += 1) {
      state = await invoke(page, "triggerBossBombHit");
    }
    expect(state.bossMode.transitionAction).toBe("end");
    await expect(page.locator("#bossHudStatus")).toContainText("Best load:");
    state = await invoke(page, "advanceBossTime", 1900);
    expect(state.bossMode).toBe(null);

    await addCard.locator(".diff-boss").click();
    state = await invoke(page, "advanceBossTime", 1400);
    expect(state.bossMode.mode).toBe("boss");
    expect(state.bossMode.phase).toBe("boss");
    await expect(page.locator("#bossHudTitle")).toContainText("Add Worksheet");
    await page.waitForTimeout(20);
    state = await invoke(page, "forceBossVictory");
    expect(state.opConfig.add.difficulty).toBe(1); // boss replay does not advance the level
    const bests = state.progressSummary.skills.add.challengeBests;
    expect(bests.wave.level).toBe(1);
    expect(bests.wave.maxLoadCleared).toBeGreaterThanOrEqual(0);
    expect(bests.boss.level).toBe(1);
    expect(bests.boss.durationMs).toBeGreaterThan(0);
  });

  test("auto-targets and step-factors a factor boss node", async ({ page }) => {
    const primeFactors = (n) => {
      const out = [];
      let m = n;
      for (let p = 2; p <= m; p += 1) {
        while (m % p === 0) { out.push(p); m /= p; }
      }
      return out;
    };

    await openApp(page);
    await invoke(page, "enableOps", ["factor"]);
    await invoke(page, "startBoss", "factor");
    await invoke(page, "skipToBossFight");

    // A factor node is auto-targeted without pressing Tab.
    await page.waitForFunction(() => window.__RAIN_MATH_TEST__.getState().factorTargetId !== null);
    let state = await invoke(page, "getState");
    const nodeId = state.factorTargetId;
    const node = state.bossMode.parts.flatMap((part) => part.problems).find((pr) => pr.id === nodeId);
    expect(node).toBeTruthy();
    expect(node.opKey).toBe("factor");

    // Step through each prime factor, then Enter to clear the node.
    for (const f of primeFactors(node.factorOriginal)) {
      await page.locator("#answer").fill(String(f));
    }
    await page.keyboard.press("Enter");

    state = await invoke(page, "getState");
    const stillAlive = (state.bossMode?.parts || [])
      .flatMap((part) => part.problems)
      .some((pr) => pr.id === nodeId && !pr.destroyed);
    expect(stillAlive).toBe(false);
  });

  test("shows a victory summary after a full boss victory", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    await invoke(page, "forceBossVictory");
    await invoke(page, "advanceBossTime", 2500); // run out the victory timer
    await expect(page.locator("#bossVictoryOverlay")).toBeVisible();
    await expect(page.locator("#bossVictoryOverlay")).toContainText("Boss Defeated");
    await expect(page.locator("#bossVictoryOverlay")).toContainText("Blitz");
    await expect(page.locator("#bossVictoryOverlay")).toContainText("Wave");
    await expect(page.locator(".boss-victory-next")).toBeVisible();
    await expect(page.locator(".boss-victory-badge")).toBeVisible();
    await expect(page.locator(".boss-victory-badge")).toHaveText("Recap");

    await page.locator(".boss-victory-badge").click();
    await expect(page.locator("#shareBadgeOverlay")).toBeVisible();
    await expect(page.locator("#shareBadgeOverlay")).toContainText("Add Level 1");
    await expect(page.locator("#shareBadgeOverlay .share-badge-text")).toContainText("Worksheet");
    await page.locator('#shareBadgeOverlay button:has-text("Close")').click();

    // The accuracy grid is still reachable from the summary.
    await page.locator(".boss-victory-grid").click();
    await expect(page.locator("#statsOverlay")).toBeVisible();
  });

  test("interrupts with mastery choices and can skip boss to the next level", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    const addCard = page.locator('.diff-card[data-op="add"]');
    await invoke(page, "masterCurrentLevel", "add");
    await freezeAutoSpawns(page);
    await invoke(page, "addDrop", {
      opKey: "add",
      text: "1 + 1",
      answer: 2,
      answerText: "2",
      statsKey: "1,1",
      y: 120,
    });

    await page.locator("#answer").fill("2"); // a correct answer re-checks readiness
    await expect(page.locator("#bossOfferOverlay")).toBeVisible();
    await expect(page.locator("#bossOfferOverlay")).toContainText("Level Mastered");
    await expect(page.locator(".boss-offer-dismiss")).toHaveText("Keep Practicing");
    await expect(page.locator(".boss-offer-next")).toHaveText("Next Level");

    await page.locator(".boss-offer-dismiss").click();
    let state = await invoke(page, "getState");
    expect(state.opConfig.add.difficulty).toBe(1);
    expect(state.progressSummary.skills.add.unlockedLevel).toBe(0);
    await expect(addCard.locator(".diff-blitz")).toBeVisible();
    await expect(addCard.locator(".diff-wave")).toBeVisible();
    await expect(addCard.locator(".diff-boss")).toBeVisible();

    await addCard.locator(".diff-ready").click();
    await expect(page.locator("#bossOfferOverlay")).toBeVisible();
    await page.locator(".boss-offer-next").click();
    state = await invoke(page, "getState");
    expect(state.bossMode).toBe(null);
    expect(state.opConfig.add.difficulty).toBe(2);
    expect(state.progressSummary.skills.add.unlockedLevel).toBe(1);
    expect(state.progressSummary.skills.add.bossAttemptedForLevel).toBe(false);

    await page.goto("/?test=1");
    await page.waitForFunction(() => window.__RAIN_MATH_READY__ && window.__RAIN_MATH_TEST__);
    const reloaded = await invoke(page, "getState");
    expect(reloaded.opConfig.add.difficulty).toBe(2);
  });

  test("resumes at the unlocked level on reload even if the selector was lowered", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    await invoke(page, "forceBossVictory"); // clears the L1 boss, advances to L2
    await invoke(page, "setOpDifficulty", "add", 1); // lower the selector to replay L1

    // Reload (no reset) so the persisted profile is read back.
    await page.goto("/?test=1");
    await page.waitForFunction(() => window.__RAIN_MATH_READY__ && window.__RAIN_MATH_TEST__);

    const state = await invoke(page, "getState");
    expect(state.opConfig.add.difficulty).toBe(2);
  });

  test("normal game load resumes at the unlocked level", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    await invoke(page, "forceBossVictory");
    await invoke(page, "setOpDifficulty", "add", 1);
    await page.evaluate(() => localStorage.setItem("rainMath.welcomeSeen.v1", "1"));

    await page.goto("/");
    await page.waitForFunction(() => window.__RAIN_MATH_READY__);
    await page.locator('.op-chit[data-op="add"]').click();

    await expect(page.locator('.diff-card[data-op="add"] .diff-value')).toHaveText("2");
  });

  test("boss reveals nodes in capped batches and clears parts only when fully solved", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    let state = await invoke(page, "skipToBossFight");

    const revealedCount = (s) => s.bossMode.parts
      .flatMap((part) => part.problems)
      .filter((problem) => problem.revealed && !problem.destroyed).length;

    // The worksheet ship holds the whole level universe.
    const universeSize = await page.evaluate(
      () => window.RainMathProgress.getSkillUniverseProblems("add", 1).length
    );
    const totalNodes = state.bossMode.parts.reduce((sum, part) => sum + part.problems.length, 0);
    expect(totalNodes).toBe(universeSize);

    let shield = state.bossMode.parts.find((part) => part.id === "shield");
    expect(shield.problems.length).toBeGreaterThan(0);
    expect(shield.destroyed).toBe(false);
    // Only a capped batch of nodes is ever visible at once (no false-positive soup).
    expect(revealedCount(state)).toBeGreaterThan(0);
    expect(revealedCount(state)).toBeLessThanOrEqual(6);

    // Solve every revealed node until the shield part falls; it must not be
    // destroyed until ALL of its nodes are solved.
    let guard = 0;
    while (!shield.destroyed && guard < 120) {
      guard += 1;
      const revealed = shield.problems.filter((problem) => problem.revealed && !problem.destroyed);
      if (revealed.length === 0) {
        state = await invoke(page, "advanceBossTime", 50);
        shield = state.bossMode.parts.find((part) => part.id === "shield");
        continue;
      }
      await invoke(page, "submit", revealed[0].answerText);
      state = await invoke(page, "getState");
      shield = state.bossMode.parts.find((part) => part.id === "shield");
      expect(revealedCount(state)).toBeLessThanOrEqual(6);
    }

    expect(shield.destroyed).toBe(true);
    const guns = state.bossMode.parts.find((part) => part.id === "guns");
    expect(guns.locked).toBe(false);
  });

  test("final boss missiles are slower copies of remaining boss nodes", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "setOpDifficulty", "add", 3, { force: true });
    await invoke(page, "startBoss", "add");
    let state = await invoke(page, "skipToBossFight");

    const remainingBefore = state.bossMode.parts
      .flatMap((part) => part.problems)
      .filter((problem) => !problem.destroyed).length;
    state = await invoke(page, "advanceBossTime", 950);
    const bomb = state.drops.find((drop) => drop.bossKind === "bomb");

    expect(bomb).toBeTruthy();
    expect(bomb.bossSourceNodeId).toBeTruthy();
    expect(bomb.baseSpeed).toBeLessThan(140);

    const sourceBefore = state.bossMode.parts
      .find((part) => part.id === bomb.bossSourcePartId)
      .problems.find((problem) => problem.id === bomb.bossSourceNodeId);
    expect(sourceBefore.destroyed).toBe(false);
    expect(sourceBefore.revealed).toBe(true);

    state = await invoke(page, "submit", bomb.answerText);
    const sourceAfter = state.bossMode.parts
      .find((part) => part.id === bomb.bossSourcePartId)
      .problems.find((problem) => problem.id === bomb.bossSourceNodeId);
    const remainingAfter = state.bossMode.parts
      .flatMap((part) => part.problems)
      .filter((problem) => !problem.destroyed).length;

    expect(sourceAfter.destroyed).toBe(true);
    expect(remainingAfter).toBe(remainingBefore - 1);
    expect(state.progressSummary.skills.add.attempts).toBe(0);
  });

  test("requires Enter for SI conversion answers", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["si"]);
    await freezeAutoSpawns(page);
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
    await freezeAutoSpawns(page);
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

  test("auto-targets the factor drop and requires each factor explicitly", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["factor"]);
    await freezeAutoSpawns(page);
    const drop = await invoke(page, "addDrop", {
      opKey: "factor",
      text: "6",
      factorOriginal: 6,
      factorRemaining: 6,
      statsKey: "6",
      y: 120,
    });

    // Factoring is solo, so the drop is auto-targeted without pressing Tab.
    await page.waitForFunction((id) => window.__RAIN_MATH_TEST__.getState().factorTargetId === id, drop.id);
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
    await expect(page.locator("#pauseBtn")).toHaveText("Resume");
    await expect(page.locator("#canvas")).toBeVisible();
    await expect(page.locator("#resultsLink")).toHaveCount(0);
    await page.locator("#sessionLogLink").click();
    await expect(page.locator("#sessionLogOverlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#sessionLogOverlay")).toHaveCount(0);
    await page.locator("#pauseBtn").click();
    await expect(page.locator("#pauseBtn")).toHaveText("Pause");

    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
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
    await page.locator('.diff-card[data-op="add"] .diff-grid-hint').click();
    await expect(page.locator("#statsOverlay")).toBeVisible();
    await expect(page.locator("#statsOverlay h2")).toHaveText("Add — Problem Accuracy");
    await expect(page.locator("#statsOverlay .stats-note")).toContainText("These colors match the falling drops");
  });
});

test.describe("mobile gameplay", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile-only keypad flows");

  test("shows the touch keypad and submits numeric answers", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await freezeAutoSpawns(page);
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
    await expect(page.locator(".op-chit")).toHaveCount(10);
    const opChitMetrics = await page.locator(".op-chits").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const visibleCount = [...el.children].filter((child) => {
        const childRect = child.getBoundingClientRect();
        return childRect.left >= rect.left - 1 && childRect.right <= rect.right + 1;
      }).length;
      return {
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        visibleCount,
      };
    });
    expect(opChitMetrics.visibleCount).toBe(10);
    expect(opChitMetrics.scrollWidth).toBeLessThanOrEqual(opChitMetrics.clientWidth + 2);
    await page.locator('.kp-key[data-key="1"]').click();
    await page.locator('.kp-key[data-key="2"]').click();

    await expect(page.locator("#touchScore")).toHaveText("1");
    const state = await invoke(page, "getState");
    expect(state.drops).toHaveLength(0);
  });

  test("landscape touch layout preserves playfield height", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await openApp(page);

    const layout = await page.evaluate(() => {
      const playCol = document.querySelector(".play-col");
      const canvas = document.querySelector("#canvas");
      const keypad = document.querySelector("#touchKeypad");
      const canvasRect = canvas.getBoundingClientRect();
      const keypadRect = keypad.getBoundingClientRect();
      return {
        flexDirection: getComputedStyle(playCol).flexDirection,
        canvasHeight: Math.round(canvasRect.height),
        canvasWidth: Math.round(canvasRect.width),
        keypadLeft: Math.round(keypadRect.left),
        canvasRight: Math.round(canvasRect.right),
      };
    });

    expect(layout.flexDirection).toBe("row");
    expect(layout.canvasHeight).toBeGreaterThan(230);
    expect(layout.keypadLeft).toBeGreaterThanOrEqual(layout.canvasRight - 1);
  });

  test("updates mobile inline controls", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);

    await page.locator("#kpSpeedUp").click();
    await page.locator("#kpDropsUp").click();

    await expect(page.locator("#kpSpeedVal")).toHaveText("40%");
    await expect(page.locator("#kpDropsVal")).toHaveText("4");
    await expect(page.locator(".kp-grid-hint").first()).toHaveText("Grid");
    await expect(page.locator('.kp-diff-lock[data-op="add"]')).toContainText("Master this level");

    await page.locator('.kp-diff-ready[data-op="add"]').click();
    await expect(page.locator('.kp-diff-ready[data-op="add"]')).toContainText("Master 100% of L1");
    await expect(page.locator("#bossOfferOverlay")).toHaveCount(0);

    await page.locator(".kp-diff-item").filter({ has: page.locator('.kp-diff-val[data-op="add"]') }).locator(".kp-diff-btn").last().click();
    await expect(page.locator('.kp-diff-val[data-op="add"]')).toHaveText("1");
    await expect(page.locator('.kp-diff-feedback[data-op="add"]')).toContainText("Master 100% of L1");
  });

  test("touch header exposes donate and log without the old results tab", async ({ page }) => {
    await openApp(page);

    await expect(page.locator("#touchSupportLink")).toBeVisible();
    await expect(page.locator("#touchSupportLink")).toHaveAttribute("href", "https://ko-fi.com/davidedaniels");
    await expect(page.locator("#touchResultsLink")).toHaveCount(0);
    await expect(page.locator("#touchFinishLink")).toBeVisible();
    await expect(page.locator("#touchFinishLink")).toHaveText("Finish");
    await expect(page.locator("#touchSessionLogLink")).toBeVisible();
  });

  test("opens session log from the touch header", async ({ page }) => {
    await openApp(page);

    await expect(page.locator("#touchSessionLogLink")).toBeVisible();
    await page.locator("#touchSessionLogLink").click();

    await expect(page.locator("#sessionLogOverlay")).toBeVisible();
    await expect(page.locator("#sessionLogOverlay h2")).toHaveText("Session Log");
  });

  test("opens login from the touch header", async ({ page }) => {
    await openApp(page);

    await expect(page.locator("#touchLoginLink")).toBeVisible();
    await page.locator("#touchLoginLink").click();

    await expect(page.locator("#loginOverlay")).toBeVisible();
    await expect(page.locator("#loginOverlay h2")).toHaveText("Players");
  });
});
