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
  await expect(page.locator(".mini-month__day")).toHaveCount(42);
  await expect(page.locator(".mini-month__day--today")).toHaveCount(1);
  await expect(page.locator(".mini-month__day--outside").first()).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("mini-month day click navigates week and month arrows work", async ({ page }) => {
  await page.goto("/");

  const toolbarTitle = page.locator(".main-toolbar__title");
  const beforeToolbarText = await toolbarTitle.textContent();

  await page.locator(".mini-month__day:not(.mini-month__day--current-week)").first().click();
  await expect(toolbarTitle).not.toHaveText(beforeToolbarText || "");

  const monthTitle = page.locator(".mini-month__title");
  const beforeMonthText = await monthTitle.textContent();
  await page.locator(".mini-month__nav").last().click();
  await expect(monthTitle).not.toHaveText(beforeMonthText || "");
});

test("event block context menu supports delete action", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);

  await targetEvent.click({ button: "right" });
  await expect(page.locator(".context-menu")).toBeVisible();
  await expect(page.locator(".context-menu__item", { hasText: "Öppna" })).toBeVisible();
  await expect(page.locator(".context-menu__item", { hasText: "Ta bort" })).toBeVisible();
  await expect(page.locator(".context-menu__item", { hasText: "Kopiera" })).toBeVisible();

  await page.locator(".context-menu__item--danger").click();
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.locator(".confirm-dialog__btn--danger").click();
  await expect(targetEvent).toHaveCount(0);
});

test("purge past events flow removes archived items after two-step confirm", async ({ page }) => {
  await page.goto("/");

  await page.locator(".calendar-list__purge").click();
  await expect(page.locator(".confirm-dialog__message")).toContainText(
    "Raderar alla händelser i kalendern innan dagens datum."
  );
  await page.locator(".confirm-dialog__btn--danger").click();
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await expect(page.locator(".confirm-dialog__message")).toContainText("kan inte ångras");
  await page.locator(".confirm-dialog__btn--danger").click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
});
