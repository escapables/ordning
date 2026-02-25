import { expect, test } from "./fixtures.js";

test("app shell loads core week view surfaces", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");

  await expect(page.locator(".calendar-list__item")).toHaveCount(2);
  await expect(page.locator(".main-toolbar")).toBeVisible();
  await expect(page.locator(".day-column")).toHaveCount(7);
  await expect(page.locator(".event-block").first()).toBeVisible();
  await expect(page.locator(".day-column--today")).toHaveCount(1);
  await expect(page.locator(".all-day-bar .all-day-event").first()).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
