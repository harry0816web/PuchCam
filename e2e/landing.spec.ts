import { expect, test } from "@playwright/test";

test("shows the game lobby", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /用你的拳頭/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /建立雙人討伐房間/ })).toBeVisible();
  await expect(page.getByLabel("房間碼")).toBeVisible();
});

test("switches between couple raid and boxing duel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /拳擊對決/ }).click();
  await expect(page.getByRole("button", { name: /建立拳擊房間/ })).toBeVisible();
});

test("shows the boss arena with compact player cameras in couple raid", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => new MediaStream() },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /建立雙人討伐房間/ }).click();

  const arena = page.getByLabel("棉花糖拳王戰鬥場景");
  await expect(arena).toBeVisible();
  await expect(arena.getByRole("img", { name: /天空競技場/ })).toBeVisible();

  const arenaBox = await arena.boundingBox();
  const cameraBoxes = await page.locator(".raid-video-grid .fighter").evaluateAll((fighters) => fighters.map((fighter) => fighter.getBoundingClientRect().toJSON()));
  expect(arenaBox).not.toBeNull();
  expect(cameraBoxes).toHaveLength(2);
  for (const camera of cameraBoxes) expect(camera.width).toBeLessThan(arenaBox!.width * 0.35);

  await page.screenshot({ path: "test-results/raid-layout.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(arena).toBeVisible();
  await page.screenshot({ path: "test-results/raid-layout-mobile.png", fullPage: true });
});

test("serves every boss action frame", async ({ request }) => {
  const frames = ["windup", "straight", "sweep", "slam", "hit"];
  for (const frame of frames) {
    const response = await request.get(`/assets/boss/cloud-champion-${frame}.png`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});

test("prefills a shared room code from the invite URL", async ({ page }) => {
  await page.goto("/?room=BOX42");
  await expect(page.getByLabel("房間碼")).toHaveValue("BOX42");
});

test("shows the punch-pattern calibration tool", async ({ page }) => {
  await page.goto("/testing");
  await expect(page.getByRole("heading", { name: /出拳/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "開始記錄動作模式" })).toBeVisible();
});
