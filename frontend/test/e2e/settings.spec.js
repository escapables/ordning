import { expect, test } from "./fixtures.js";

async function selectPickerOption(page, name, value) {
  await page.evaluate(({ n, v }) => {
    const s = document.querySelector(`select[name='${n}']`);
    s.value = v;
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }, { n: name, v: value });
}

test("settings language switch updates UI text", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".sidebar__new-event-btn")).toHaveText("Ny händelse");
  await page.locator(".sidebar__settings-btn").click();
  await selectPickerOption(page, "settingsLanguage", "en");
  await expect(page.locator(".sidebar__new-event-btn")).toHaveText("New event");
});

test("settings timezone selection persists", async ({ page }) => {
  await page.goto("/");

  await page.locator(".sidebar__settings-btn").click();
  const timezoneSelect = page.locator("select[name='settingsTimezone']");
  const selectedTimezone = await timezoneSelect.evaluate((node) => node.value);
  const nextTimezone = await timezoneSelect.evaluate((node) => {
    const options = Array.from(node.options).map((option) => option.value);
    return options.find((value) => value !== node.value) ?? node.value;
  });
  await selectPickerOption(page, "settingsTimezone", nextTimezone);
  await expect(page.locator(".settings-dialog[open]")).toHaveCount(0);

  await page.locator(".sidebar__settings-btn").click();
  await expect(page.locator("select[name='settingsTimezone']")).toHaveValue(
    nextTimezone
  );
  expect(nextTimezone).not.toBe(selectedTimezone);
});
