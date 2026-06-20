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

async function freezeAutoSpawns(page) {
  await invoke(page, "setControls", { speed: 0, drops: 0 });
  await invoke(page, "clearDrops");
}

test("loads without page errors and paints the canvas", async ({ page }) => {
  const { pageErrors } = await openApp(page);

  await expect(page).toHaveTitle("Rain Math");
  await expect(page.locator("#canvas")).toBeVisible();
  await expect(page.locator(".stats .label")).toHaveText("Cleared");
  await expect(page.locator(".op-chit")).toHaveCount(8);
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
  if (await page.locator("#welcomeOverlay").isVisible()) {
    await page.locator("#welcomePlay").click();
  }
  await expect(page.locator(".op-chit")).toHaveCount(8);

  await page.locator('.op-chit[data-op="add"]').click();
  await expect(page.locator('.op-chit[data-op="add"]')).toHaveClass(/active/);
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

  await page.locator("#welcomeProfileName").fill("Grace Hopper");
  await page.locator(".welcome-create button").click();
  await expect(page.locator("#loginLink")).toHaveText("Grace Hopper");
  await expect(page.locator(".welcome-profile-btn.active .welcome-profile-name")).toHaveText("Grace Hopper");

  await page.locator("#welcomeTutorial").click();
  await expect(page.locator("#tutorialOverlay")).toBeVisible();
  await expect(page.locator(".tutorial-kicker")).toContainText("1/8");
  await expect(page.locator(".tutorial-card h2")).toContainText("Choose what kind of math");

  await page.locator(".tutorial-next").click();
  await expect(page.locator(".tutorial-kicker")).toContainText("2/8");
  await expect(page.locator(".tutorial-card h2")).toContainText("Read the drop");

  await page.locator(".tutorial-skip").click();
  await expect(page.locator("#tutorialOverlay")).toHaveCount(0);
  await expect(page.locator("#welcomeOverlay")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("rainMath.welcomeSeen.v1"))).toBe("1");
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

  test("requires a boss victory before increasing a level", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    const addCard = page.locator('.diff-card[data-op="add"]');

    await expect(addCard.locator(".diff-value")).toHaveText("1");
    await addCard.locator(".diff-btn").last().click();
    await expect(addCard.locator(".diff-value")).toHaveText("1");
    await expect(addCard.locator(".diff-ready")).toHaveText("Beat Boss first");

    await invoke(page, "startBoss", "add");
    expect((await invoke(page, "getState")).bossMode.active).toBe(true);

    await invoke(page, "forceBossVictory");
    await expect(addCard.locator(".diff-value")).toHaveText("2");
    const state = await invoke(page, "getState");
    expect(state.progressSummary.skills.add.currentLevel).toBe(2);
    expect(state.progressSummary.skills.add.bossAttemptedForLevel).toBe(false);
    expect(state.progressProfile.skills.add.bossAttempts.some((attempt) => (
      attempt.level === 1 && attempt.pressureTier === "steady" && attempt.inferred === false
    ))).toBe(true);

    // Challenge replays are hidden on the new (undefeated) level; selecting the
    // cleared level reveals them.
    await expect(addCard.locator(".diff-blitz")).toBeHidden();
    await invoke(page, "setOpDifficulty", "add", 1);
    await expect(addCard.locator(".diff-blitz")).toBeVisible();
    await expect(addCard.locator(".diff-blitz")).toHaveText("Blitz L1");
  });

  test("updates speed and drops controls", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);

    await invoke(page, "setControls", { speed: 80, drops: 9 });

    await expect(page.locator("#speedValue")).toHaveText("80%");
    await expect(page.locator("#dropLimitValue")).toHaveText("9");
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toHaveText("Mastered: 0%");
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
      y: 120,
    });

    await page.locator("#answer").fill("8");

    await expect(page.locator("#score")).toHaveText("1");
    const state = await invoke(page, "getState");
    expect(state.drops).toHaveLength(0);
    expect(state.problemStats.add["3,5"]).toEqual({ asked: 1, correct: 1 });
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

  test("results popup shows local readiness progress", async ({ page }) => {
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

    await page.locator("#resultsLink").click();
    await expect(page.locator("#resultsOverlay")).toBeVisible();
    await expect(page.locator("#resultsOverlay h2")).toHaveText("Learning Results");
    await expect(page.locator("#resultsOverlay")).toContainText("Add");
    await expect(page.locator("#resultsOverlay")).toContainText("1 attempts");
    await expect(page.locator("#resultsOverlay")).toContainText("1/9 seen");
    await expect(page.locator("#resultsOverlay")).toContainText("0 mastered");
    await expect(page.locator("#resultsOverlay")).toContainText("Practice next: 2 + 3");
    await expect(page.locator("#resultsOverlay")).toContainText("(new)");
    await expect(page.locator("#resultsOverlay")).not.toContainText("Pressure clears:");
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

  test("boss mode starts from a level card, then boss bombs stun input", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);

    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toBeDisabled();
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toHaveText("Mastered: 0%");

    await invoke(page, "masterCurrentLevel", "add");
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toHaveText("Mastered: 100%");
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toBeEnabled();
    await expect(page.locator('.diff-card[data-op="add"] .diff-ready')).toHaveClass(/is-ready-attention/);
    await page.locator('.diff-card[data-op="add"] .diff-ready').click();
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
    await expect(page.locator("#bossHudMeta")).toContainText("2 at once");
    await invoke(page, "advanceBossTime", 30000);
    await expect(page.locator("#bossHudMeta")).toContainText("2 at once");
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

  test("blitz records a shield endurance score without advancing the level", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    await invoke(page, "forceBossVictory");

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
    await expect(page.locator("#bossHudStatus")).toContainText("Shields are down. Blitz solved:");

    state = await invoke(page, "advanceBossTime", 1900);
    expect(state.opConfig.add.difficulty).toBe(1); // blitz does not change the level
    expect(state.progressProfile.skills.add.blitzAttempts.at(-1).level).toBe(1);
    expect(state.progressProfile.skills.add.blitzAttempts.at(-1).result).toBe("shields-down");
  });

  test("full boss mode runs Wave 1, Wave 2, then the mothership", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "masterCurrentLevel", "add");

    await page.locator('.diff-card[data-op="add"] .diff-ready').click();
    let state = await invoke(page, "advanceBossTime", 1400);
    expect(state.bossMode.mode).toBe("full");
    expect(state.bossMode.phase).toBe("challenge");
    expect(state.bossMode.challengeType).toBe("blitz");

    for (let i = 0; i < 4; i += 1) {
      state = await invoke(page, "triggerBossBombHit");
    }
    expect(state.bossMode.phase).toBe("challengeComplete");
    expect(state.bossMode.transitionAction).toBe("wave");
    await expect(page.locator("#bossHudStatus")).toContainText("Nuclear burst");

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
    await expect(page.locator("#bossHudMeta")).toContainText("2 at once");
    const waveMetaAfter = await page.locator("#bossHudMeta").textContent();
    expect(waveMetaAfter.match(/fixed \d+% speed/)?.[0]).toBe(waveMetaBefore.match(/fixed \d+% speed/)?.[0]);

    for (let i = 0; i < 5; i += 1) {
      state = await invoke(page, "triggerBossBombHit");
    }
    expect(state.bossMode.phase).toBe("challengeComplete");
    expect(state.bossMode.transitionAction).toBe("boss");
    await expect(page.locator("#bossHudStatus")).toContainText("mothership is exposed");

    state = await invoke(page, "advanceBossTime", 1900);
    expect(state.bossMode.phase).toBe("boss");

    state = await invoke(page, "forceBossVictory");
    expect(state.opConfig.add.difficulty).toBe(2);
    const attempts = state.progressProfile.skills.add.challengeAttempts;
    expect(attempts.some((attempt) => attempt.type === "blitz" && attempt.level === 1)).toBe(true);
    expect(attempts.some((attempt) => attempt.type === "wave" && attempt.level === 1)).toBe(true);
    expect(attempts.some((attempt) => attempt.type === "boss" && attempt.level === 1 && attempt.cleared)).toBe(true);
  });

  test("wave and boss replay buttons save challenge bests for the cleared level", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    await invoke(page, "forceBossVictory");

    const addCard = page.locator('.diff-card[data-op="add"]');
    // Replays live on the cleared level; select it to reach them.
    await invoke(page, "setOpDifficulty", "add", 1);
    await expect(addCard.locator(".diff-wave")).toHaveText("Wave L1");
    await expect(addCard.locator(".diff-boss")).toHaveText("Boss L1");

    await addCard.locator(".diff-wave").click();
    let state = await invoke(page, "advanceBossTime", 1400);
    expect(state.bossMode.mode).toBe("wave");
    expect(state.bossMode.challengeType).toBe("wave");
    expect(state.bossMode.challengeLoad).toBe(1);

    for (let i = 0; i < 4; i += 1) {
      state = await invoke(page, "triggerBossBombHit");
    }
    expect(state.bossMode.transitionAction).toBe("end");
    await expect(page.locator("#bossHudStatus")).toContainText("Wave 2 solved:");
    state = await invoke(page, "advanceBossTime", 1900);
    expect(state.bossMode).toBe(null);

    await addCard.locator(".diff-boss").click();
    state = await invoke(page, "advanceBossTime", 1400);
    expect(state.bossMode.mode).toBe("boss");
    expect(state.bossMode.phase).toBe("boss");
    await page.waitForTimeout(20);
    state = await invoke(page, "forceBossVictory");
    expect(state.opConfig.add.difficulty).toBe(1); // boss replay does not advance the level
    const bests = state.progressSummary.skills.add.challengeBests;
    expect(bests.wave.level).toBe(1);
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
    await expect(page.locator("#bossVictoryOverlay")).toContainText("Wave 1");
    await expect(page.locator(".boss-victory-next")).toBeVisible();

    // The accuracy grid is still reachable from the summary.
    await page.locator(".boss-victory-grid").click();
    await expect(page.locator("#statsOverlay")).toBeVisible();
  });

  test("offers the boss with a toast when an operation reaches mastery", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
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
    await expect(page.locator("#bossOfferToast")).toBeVisible();
    await expect(page.locator("#bossOfferToast")).toContainText("boss unlocked");

    await page.locator(".boss-offer-start").click();
    expect((await invoke(page, "getState")).bossMode.active).toBe(true);
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

  test("boss reveals nodes in capped batches and clears parts only when fully solved", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);
    await invoke(page, "startBoss", "add");
    let state = await invoke(page, "skipToBossFight");

    const revealedCount = (s) => s.bossMode.parts
      .flatMap((part) => part.problems)
      .filter((problem) => problem.revealed && !problem.destroyed).length;

    // The fact-sheet boss holds the whole level universe (capped at 50).
    const universeSize = await page.evaluate(
      () => window.RainMathProgress.getSkillUniverseProblems("add", 1).length
    );
    const totalNodes = state.bossMode.parts.reduce((sum, part) => sum + part.problems.length, 0);
    expect(totalNodes).toBe(Math.min(50, universeSize));

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
    await page.locator("#resultsLink").click();
    await expect(page.locator("#resultsOverlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#resultsOverlay")).toHaveCount(0);
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
    await page.locator('.kp-key[data-key="1"]').click();
    await page.locator('.kp-key[data-key="2"]').click();

    await expect(page.locator("#touchScore")).toHaveText("1");
    const state = await invoke(page, "getState");
    expect(state.drops).toHaveLength(0);
  });

  test("updates mobile inline controls", async ({ page }) => {
    await openApp(page);
    await invoke(page, "enableOps", ["add"]);

    await page.locator("#kpSpeedUp").click();
    await page.locator("#kpDropsUp").click();

    await expect(page.locator("#kpSpeedVal")).toHaveText("40%");
    await expect(page.locator("#kpDropsVal")).toHaveText("4");
    await expect(page.locator(".kp-grid-hint").first()).toHaveText("Grid");
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
