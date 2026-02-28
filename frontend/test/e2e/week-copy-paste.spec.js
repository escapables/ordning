import { expect, test } from "./fixtures.js";

async function pressShortcut(page, key) {
  await page.keyboard.down("Control");
  await page.keyboard.press(key);
  await page.keyboard.up("Control");
}

test("keyboard copy enters paste mode, Escape cancels, and Ctrl+V pastes at cursor", async ({ page }) => {
  await page.goto("/");

  const sourceEvent = page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Sprint Planning" });
  const targetHour = page.locator(".day-column").nth(2).locator(".day-column__hour").nth(13);
  await expect(sourceEvent).toHaveCount(1);
  await targetHour.scrollIntoViewIfNeeded();

  const targetBox = await targetHour.boundingBox();
  expect(targetBox).not.toBeNull();

  await sourceEvent.click();
  await page.mouse.move(targetBox.x + 20, targetBox.y + 2);
  await pressShortcut(page, "c");
  await expect(page.locator(".day-column__move-preview")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.locator(".day-column__move-preview")).toHaveCount(0);
  await pressShortcut(page, "v");
  await expect(page.locator(".event-block", { hasText: "Sprint Planning" })).toHaveCount(1);

  await sourceEvent.click();
  await page.mouse.move(targetBox.x + 20, targetBox.y + 2);
  await pressShortcut(page, "c");
  await expect(page.locator(".day-column__move-preview")).toHaveCount(1);

  await pressShortcut(page, "v");

  await expect(page.locator(".event-block", { hasText: "Sprint Planning" })).toHaveCount(2);
  const pastedEvent = page.locator(".day-column").nth(2).locator(".event-block", { hasText: "Sprint Planning" });
  await expect(pastedEvent).toHaveCount(1);
  await expect(pastedEvent.locator(".event-block__time")).toContainText("13:00 - 14:30");
});
