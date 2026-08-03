import { expect, test } from "@playwright/test";

test("shows the game lobby", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /用你的拳頭/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /建立拳擊房間/ })).toBeVisible();
  await expect(page.getByLabel("房間碼")).toBeVisible();
});

test("prefills a shared room code from the invite URL", async ({ page }) => {
  await page.goto("/?room=BOX42");
  await expect(page.getByLabel("房間碼")).toHaveValue("BOX42");
});
