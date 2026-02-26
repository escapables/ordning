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

test("settings language switch updates UI text", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".sidebar__new-event-btn")).toHaveText("Nytt event");
  await page.locator(".sidebar__settings-btn").click();
  await page.locator(".settings-dialog__select").selectOption("en");
  await expect(page.locator(".sidebar__new-event-btn")).toHaveText("New event");
});

test("overlapping Monday events are rendered in equal-width columns", async ({ page }) => {
  await page.goto("/");

  const sprint = page.locator(".event-block", { hasText: "Sprint Planning" });
  const parallel = page.locator(".event-block", { hasText: "Parallel Sync" });
  const ops = page.locator(".event-block", { hasText: "Ops Check-in" });
  const designReview = page.locator(".event-block", { hasText: "Design Review" });

  await expect(sprint).toHaveCount(1);
  await expect(parallel).toHaveCount(1);
  await expect(ops).toHaveCount(1);

  const [sprintBox, parallelBox, opsBox, designReviewBox] = await Promise.all([
    sprint.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, width: rect.width };
    }),
    parallel.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, width: rect.width };
    }),
    ops.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, width: rect.width };
    }),
    designReview.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, width: rect.width };
    })
  ]);

  const overlapWidths = [sprintBox.width, parallelBox.width, opsBox.width];
  const minWidth = Math.min(...overlapWidths);
  const maxWidth = Math.max(...overlapWidths);
  expect(maxWidth - minWidth).toBeLessThan(2);

  expect(designReviewBox.width).toBeGreaterThan(maxWidth * 2.5);
  expect(sprintBox.x).toBeLessThan(parallelBox.x);
  expect(parallelBox.x).toBeLessThan(opsBox.x);
});

test("single click selects event, dblclick opens modal, and clear selection works", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);

  await targetEvent.click();
  await expect(page.locator(".event-block--selected")).toHaveCount(1);
  await expect(targetEvent).toHaveClass(/event-block--selected/);

  await targetEvent.dblclick();
  await expect(page.locator(".event-modal[open]")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".event-block--selected")).toHaveCount(0);
  await expect(page.locator(".event-block:focus")).toHaveCount(0);

  await targetEvent.click();
  await expect(page.locator(".event-block--selected")).toHaveCount(1);
  await page.locator(".day-column").nth(2).dispatchEvent("click");
  await expect(page.locator(".event-block--selected")).toHaveCount(0);
});
