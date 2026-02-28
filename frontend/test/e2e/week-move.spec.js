import { expect, test } from "./fixtures.js";

test("dragging wrapped continuation segment keeps start-day offset", async ({ page }) => {
  await page.goto("/");

  const tuesdaySegment = page.locator(".day-column").nth(1).locator(".event-block", { hasText: "Night Deploy" });
  await expect(tuesdaySegment).toHaveCount(1);
  await tuesdaySegment.scrollIntoViewIfNeeded();

  const sourceBox = await tuesdaySegment.boundingBox();
  const targetHour = page.locator(".day-column").nth(3).locator(".day-column__hour").first();
  const targetBox = await targetHour.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  await page.mouse.move(sourceBox.x + 12, sourceBox.y + 28);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 18, sourceBox.y + 32, { steps: 4 });
  await page.mouse.move(targetBox.x + 20, targetBox.y + 28, { steps: 10 });
  await expect(page.locator(".day-column__move-preview")).toHaveCount(2);
  await page.mouse.up();

  await expect(page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Night Deploy" })).toHaveCount(0);
  await expect(page.locator(".day-column").nth(1).locator(".event-block", { hasText: "Night Deploy" })).toHaveCount(0);
  await expect(page.locator(".day-column").nth(2).locator(".event-block", { hasText: "Night Deploy" })).toHaveCount(1);
  await expect(page.locator(".day-column").nth(3).locator(".event-block", { hasText: "Night Deploy" })).toHaveCount(1);
  await expect(page.locator(".day-column").nth(2).locator(".event-block", { hasText: "Night Deploy" })).toContainText("22:00 - 02:00");
});
