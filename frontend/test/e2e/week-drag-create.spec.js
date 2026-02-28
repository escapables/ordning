import { expect, test } from "./fixtures.js";

test("drag-create across adjacent columns pre-fills multi-day modal dates", async ({ page }) => {
  await page.goto("/");

  const sourceHour = page.locator(".day-column").nth(0).locator(".day-column__hour").nth(14);
  const targetHour = page.locator(".day-column").nth(1).locator(".day-column__hour").nth(16);
  const sourceDate = await page.locator(".day-column").nth(0).getAttribute("data-date");
  const targetDate = await page.locator(".day-column").nth(1).getAttribute("data-date");
  await sourceHour.scrollIntoViewIfNeeded();
  const sourceBox = await sourceHour.boundingBox();
  const targetBox = await targetHour.boundingBox();
  expect(sourceDate).toBeTruthy();
  expect(targetDate).toBeTruthy();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  await page.mouse.move(sourceBox.x + 24, sourceBox.y + Math.round(sourceBox.height / 2));
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 28, sourceBox.y + Math.round(sourceBox.height / 2) + 4, { steps: 4 });
  await page.mouse.move(targetBox.x + 24, targetBox.y + Math.round(targetBox.height / 2), { steps: 10 });
  await expect(page.locator(".day-column__selection-preview")).toHaveCount(2);
  await page.mouse.up();

  await expect(page.locator(".event-modal[open]")).toBeVisible();
  await expect(page.locator(".event-modal__input[name='startDate']")).toHaveValue(sourceDate);
  await expect(page.locator(".event-modal__input[name='endDate']")).toHaveValue(targetDate);
  await expect(page.locator(".event-modal__input[name='startTime']")).toHaveValue("14:30");
  await expect(page.locator(".event-modal__input[name='endTime']")).toHaveValue("16:30");
});

test("drag-resize bottom edge can extend event into next day", async ({ page }) => {
  await page.goto("/");

  const sourceEvent = page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Sprint Planning" });
  const targetHour = page.locator(".day-column").nth(1).locator(".day-column__hour").nth(14);
  await expect(sourceEvent).toHaveCount(1);
  await targetHour.scrollIntoViewIfNeeded();
  await sourceEvent.scrollIntoViewIfNeeded();
  const sourceBox = await sourceEvent.boundingBox();
  const targetBox = await targetHour.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  await page.mouse.move(sourceBox.x + (sourceBox.width / 2), sourceBox.y + sourceBox.height - 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + (sourceBox.width / 2), sourceBox.y + sourceBox.height + 8, { steps: 4 });
  await page.mouse.move(targetBox.x + 20, targetBox.y + Math.round(targetBox.height / 2), { steps: 10 });
  await expect(page.locator(".day-column__move-preview")).toHaveCount(2);
  await page.mouse.up();

  await expect(page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Sprint Planning" })).toHaveCount(1);
  const nextDaySegment = page.locator(".day-column").nth(1).locator(".event-block", { hasText: "Sprint Planning" });
  await expect(nextDaySegment).toHaveCount(1);
  await expect(nextDaySegment.locator(".event-block__time")).toContainText("09:00 - 14:30");
});
