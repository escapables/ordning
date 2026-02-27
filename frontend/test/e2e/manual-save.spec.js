import { expect, test } from "./fixtures.js";

test("manual save button enables on dirty state and returns to disabled after save", async ({ page }) => {
  await page.goto("/");

  const saveButton = page.locator(".main-toolbar__save-btn");
  await expect(saveButton).toBeDisabled();

  await page.locator(".calendar-list__checkbox").first().click();

  await expect.poll(async () => {
    return saveButton.isDisabled();
  }).toBe(false);

  await saveButton.click();

  await expect(saveButton).toContainText("Sparat");
  await expect.poll(async () => {
    return saveButton.isDisabled();
  }).toBe(true);
});
