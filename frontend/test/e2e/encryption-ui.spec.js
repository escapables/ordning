import { expect, test } from "./fixtures.js";

test("locked startup requires a valid password before rendering the app shell", async ({ page }) => {
  await page.goto("/?locked=1");

  await expect(page.locator(".unlock-screen")).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);

  await page.locator(".unlock-screen__input").fill("wrong password");
  await page.locator(".unlock-screen__submit").click();
  await expect(page.locator(".unlock-screen__error")).toContainText("Fel");

  await page.locator(".unlock-screen__input").fill("top secret");
  await page.locator(".unlock-screen__submit").click();

  await expect(page.locator(".unlock-screen")).toHaveCount(0);
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".sidebar__new-event-btn")).toHaveText("Ny händelse");
});

test("settings dialog enables encryption and shows the encrypted state on reopen", async ({ page }) => {
  await page.goto("/");

  await page.locator(".sidebar__settings-btn").click();
  await expect(page.locator(".settings-dialog[open]")).toBeVisible();
  await expect(page.locator(".settings-dialog__passwords")).toBeHidden();
  await page.locator(".settings-dialog__btn--ghost").click();
  await page.locator(".settings-dialog__password-input").fill("top secret");
  await page.locator(".settings-dialog__password-confirm-input").fill("top secret");
  await page.locator(".settings-dialog__btn--primary").click();

  await expect(page.locator(".settings-dialog[open]")).toHaveCount(0);

  await page.locator(".sidebar__settings-btn").click();
  await expect(page.locator(".settings-dialog__passwords")).toBeHidden();
  await expect(page.locator(".settings-dialog__status")).toContainText("På");
  await expect(page.locator(".settings-dialog__description")).toContainText("Lokal data är krypterad.");
  await expect(page.locator(".settings-dialog__btn", { hasText: "Avaktivera kryptering" })).toBeVisible();

  const encrypted = await page.evaluate(() => {
    return window.__ORDNING_TAURI_MOCK_STATE.settings.storageEncrypted;
  });
  expect(encrypted).toBe(true);
});

test("settings dialog disables encryption after confirming the password", async ({ page }) => {
  await page.goto("/");

  await page.locator(".sidebar__settings-btn").click();
  await page.locator(".settings-dialog__btn--ghost").click();
  await page.locator(".settings-dialog__password-input").fill("top secret");
  await page.locator(".settings-dialog__password-confirm-input").fill("top secret");
  await page.locator(".settings-dialog__btn--primary").click();
  await expect(page.locator(".settings-dialog[open]")).toHaveCount(0);

  await page.locator(".sidebar__settings-btn").click();
  await page.locator(".settings-dialog__btn", { hasText: "Avaktivera kryptering" }).click();
  await expect(page.locator(".settings-dialog__password-confirm-input")).toBeHidden();
  await page.locator(".settings-dialog__password-input").fill("top secret");
  await page.locator(".settings-dialog__btn--primary").click();
  await expect(page.locator(".settings-dialog[open]")).toHaveCount(0);

  await page.locator(".sidebar__settings-btn").click();
  await expect(page.locator(".settings-dialog__status")).toBeHidden();
  await expect(page.locator(".settings-dialog__description")).toContainText("Lokal data är inte krypterad.");
  await expect(page.locator(".settings-dialog__btn--ghost")).toBeVisible();

  const encrypted = await page.evaluate(() => {
    return window.__ORDNING_TAURI_MOCK_STATE.settings.storageEncrypted;
  });
  expect(encrypted).toBe(false);
});
