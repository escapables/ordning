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
  await page.locator(".settings-dialog__field").first().locator("select").selectOption("en");
  await expect(page.locator(".sidebar__new-event-btn")).toHaveText("New event");
});

test("settings timezone selection persists", async ({ page }) => {
  await page.goto("/");

  await page.locator(".sidebar__settings-btn").click();
  const timezoneSelect = page.locator(".settings-dialog__field").nth(1).locator("select");
  const selectedTimezone = await timezoneSelect.evaluate((node) => node.value);
  const nextTimezone = await timezoneSelect.evaluate((node) => {
    const options = Array.from(node.options).map((option) => option.value);
    return options.find((value) => value !== node.value) ?? node.value;
  });
  await timezoneSelect.selectOption(nextTimezone);
  await expect(page.locator(".settings-dialog[open]")).toHaveCount(0);

  await page.locator(".sidebar__settings-btn").click();
  await expect(page.locator(".settings-dialog__field").nth(1).locator("select")).toHaveValue(
    nextTimezone
  );
  expect(nextTimezone).not.toBe(selectedTimezone);
});

test("toolbar print button uses iframe print trigger", async ({ page }) => {
  await page.addInitScript(() => {
    window.__printContexts = [];
    window.print = function mockPrint() {
      window.__printContexts.push(this === window ? "window" : "iframe");
    };
  });
  await page.goto("/");

  await page.locator(".main-toolbar__print-btn").click();
  const printContexts = await page.evaluate(() => window.__printContexts);
  expect(printContexts).toHaveLength(1);
  expect(printContexts[0]).toBe("iframe");
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

test("cross-midnight event renders continuation segment on next day", async ({ page }) => {
  await page.goto("/");

  const mondaySegment = page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Night Deploy" });
  const tuesdaySegment = page.locator(".day-column").nth(1).locator(".event-block", { hasText: "Night Deploy" });

  await expect(mondaySegment).toHaveCount(1);
  await expect(tuesdaySegment).toHaveCount(1);
  await expect(mondaySegment.locator(".event-block__time")).toHaveText("22:00 - 02:00");
  await expect(tuesdaySegment.locator(".event-block__time")).toHaveText("22:00 - 02:00");
});

test("hovering cross-midnight segment highlights all segments with same event id", async ({ page }) => {
  await page.goto("/");

  const mondaySegment = page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Night Deploy" });
  const tuesdaySegment = page.locator(".day-column").nth(1).locator(".event-block", { hasText: "Night Deploy" });

  await expect(mondaySegment).toHaveCount(1);
  await expect(tuesdaySegment).toHaveCount(1);

  await mondaySegment.hover();
  await expect(mondaySegment).toHaveClass(/event-block--hover-synced/);
  await expect(tuesdaySegment).toHaveClass(/event-block--hover-synced/);

  await page.locator(".main-toolbar__title").hover();
  await expect(mondaySegment).not.toHaveClass(/event-block--hover-synced/);
  await expect(tuesdaySegment).not.toHaveClass(/event-block--hover-synced/);
});

test("all-day events support select open context menu and keyboard delete", async ({ page }) => {
  await page.goto("/");

  const allDayEvent = page.locator(".all-day-event", { hasText: "Company Offsite" });
  await expect(allDayEvent).toHaveCount(1);

  await allDayEvent.click();
  await expect(allDayEvent).toHaveClass(/event-block--selected/);

  await allDayEvent.dblclick();
  await expect(page.locator(".event-modal[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".event-modal[open]")).toHaveCount(0);

  await allDayEvent.click({ button: "right" });
  await expect(page.locator(".context-menu__item", { hasText: "Öppna" })).toBeVisible();
  await expect(page.locator(".context-menu__item", { hasText: "Ta bort" })).toBeVisible();
  await expect(page.locator(".context-menu__item", { hasText: "Kopiera" })).toBeVisible();
  await page.keyboard.press("Escape");

  await allDayEvent.focus();
  await page.keyboard.press("Backspace");
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.locator(".confirm-dialog__btn").first().click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(allDayEvent).toHaveCount(1);
});

test("dragging selected event moves it to a different day/time with preview", async ({ page }) => {
  await page.goto("/");

  const sourceEvent = page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Sprint Planning" });
  await expect(sourceEvent).toHaveCount(1);
  await sourceEvent.click();
  await expect(sourceEvent).toHaveClass(/event-block--selected/);

  const sourceBox = await sourceEvent.boundingBox();
  const targetHour = page.locator(".day-column").nth(2).locator(".day-column__hour").nth(12);
  const targetBox = await targetHour.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  await page.mouse.move(sourceBox.x + 12, sourceBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + 20, targetBox.y + 8, { steps: 8 });
  await expect(page.locator(".day-column__move-preview")).toHaveCount(1);
  await page.mouse.up();

  await expect(page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Sprint Planning" })).toHaveCount(0);
  const movedEvent = page.locator(".day-column").nth(2).locator(".event-block", { hasText: "Sprint Planning" });
  await expect(movedEvent).toHaveCount(1);
  await expect(movedEvent.locator(".event-block__time")).toContainText("12:");
});

test("drag ghost reflows width with overlap changes while dragging", async ({ page }) => {
  await page.goto("/");

  const sourceEvent = page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Sprint Planning" });
  await sourceEvent.click();
  const sourceBox = await sourceEvent.boundingBox();
  expect(sourceBox).not.toBeNull();

  await page.mouse.move(sourceBox.x + 12, sourceBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 20, sourceBox.y + 14, { steps: 6 });

  const overlapPreviewBox = await page.locator(".day-column__move-preview").boundingBox();
  expect(overlapPreviewBox).not.toBeNull();

  const nonOverlapHour = page.locator(".day-column").nth(0).locator(".day-column__hour").nth(12);
  const nonOverlapBox = await nonOverlapHour.boundingBox();
  expect(nonOverlapBox).not.toBeNull();

  await page.mouse.move(nonOverlapBox.x + 24, nonOverlapBox.y + 10, { steps: 10 });
  const expandedPreviewBox = await page.locator(".day-column__move-preview").boundingBox();
  expect(expandedPreviewBox).not.toBeNull();
  expect(expandedPreviewBox.width).toBeGreaterThan(overlapPreviewBox.width + 20);

  await page.mouse.up();
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

test("empty day-column context menu opens New event with 30-minute snap", async ({ page }) => {
  await page.goto("/");

  const firstColumn = page.locator(".day-column").first();
  await firstColumn.click({ button: "right", position: { x: 24, y: 112 } });
  await expect(page.locator(".context-menu")).toBeVisible();
  await page.locator(".context-menu__item", { hasText: "Nytt event" }).click();

  await expect(page.locator(".event-modal[open]")).toBeVisible();
  await expect(page.locator(".event-modal__input[name='startTime']")).toHaveValue("02:00");
  await expect(page.locator(".event-modal__input[name='endTime']")).toHaveValue("02:30");
});

test("empty day-column context menu shows Paste after copy and creates event at snapped time", async ({
  page
}) => {
  await page.goto("/");

  const sourceEvent = page.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(sourceEvent).toHaveCount(1);
  await sourceEvent.click({ button: "right" });
  await page.locator(".context-menu__item", { hasText: "Kopiera" }).click();

  const firstColumn = page.locator(".day-column").first();
  await firstColumn.click({ button: "right", position: { x: 28, y: 420 } });
  await expect(page.locator(".context-menu__item", { hasText: "Klistra in" })).toBeVisible();
  await page.locator(".context-menu__item", { hasText: "Klistra in" }).click();

  await expect(page.locator(".event-block", { hasText: "Sprint Planning" })).toHaveCount(2);
  await expect(page.locator(".event-block", { hasText: "07:30 - 09:00" })).toHaveCount(1);
});

test("context menu is suppressed on non-column non-interactive areas", async ({ page }) => {
  await page.goto("/");

  await page.locator(".week-grid__headers").click({ button: "right", position: { x: 20, y: 20 } });
  await expect(page.locator(".context-menu")).toHaveCount(0);

  await page.locator(".time-labels").click({ button: "right", position: { x: 20, y: 20 } });
  await expect(page.locator(".context-menu")).toHaveCount(0);

  await page.locator(".main-toolbar__title").click({ button: "right", position: { x: 10, y: 10 } });
  await expect(page.locator(".context-menu")).toHaveCount(0);

  await page.locator(".sidebar").click({ button: "right", position: { x: 8, y: 8 } });
  await expect(page.locator(".context-menu")).toHaveCount(0);
});
