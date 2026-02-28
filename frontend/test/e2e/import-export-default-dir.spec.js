import { expect, test } from "./fixtures.js";

test("export and import dialogs use launch directory as default path", async ({ page }) => {
  await page.goto("/");

  const launchDirectory = await page.evaluate(() => window.__ORDNING_DIALOG_DEFAULTS.launchDirectory);
  page.once("dialog", (dialog) => dialog.dismiss());

  await page.locator(".calendar-list__io-btn", { hasText: /export/i }).click();
  await page.locator(".export-dialog__btn--primary").click();
  await expect.poll(async () => {
    return page.evaluate(() => window.__ORDNING_DIALOG_DEFAULTS.exportDefaultPath);
  }).toBe(launchDirectory);

  await page.locator(".calendar-list__io-btn", { hasText: /import/i }).click();
  await page.locator(".import-dialog__btn--pick").click();
  await expect.poll(async () => {
    return page.evaluate(() => window.__ORDNING_DIALOG_DEFAULTS.importDefaultPath);
  }).toBe(launchDirectory);
});
