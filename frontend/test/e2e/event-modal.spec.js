import { expect, test } from "./fixtures.js";

test("slot click opens modal and submit creates event", async ({ page }) => {
  await page.goto("/");

  const beforeCount = await page.locator(".event-block").count();

  await page.locator(".day-column").first().locator(".day-column__hour").first().click();
  await expect(page.locator(".event-modal[open]")).toBeVisible();
  await expect(page.locator(".event-modal__empty")).toBeHidden();

  await page.locator(".event-modal__input[name='title']").fill("Playwright Event");
  await page.locator(".event-modal__actions button[type='submit']").click();

  await expect(page.locator(".event-modal[open]")).toHaveCount(0);
  await expect(page.locator(".event-block")).toHaveCount(beforeCount + 1);
});

test("Delete key confirm gates event deletion", async ({ page }) => {
  await page.goto("/");

  const event = page.locator(".event-block").first();
  await event.focus();
  const beforeCount = await page.locator(".event-block").count();

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Delete");
  await expect(page.locator(".event-block")).toHaveCount(beforeCount);

  const nextEvent = page.locator(".event-block").first();
  await nextEvent.focus();
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Delete");
  await expect(page.locator(".event-block")).toHaveCount(beforeCount - 1);
});
