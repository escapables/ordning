import { expect, test } from "./fixtures.js";

test("settings language switch updates UI text", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".sidebar__new-event-btn")).toHaveText("Ny händelse");
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
