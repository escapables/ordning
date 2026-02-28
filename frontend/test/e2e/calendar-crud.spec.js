import { expect, test } from "./fixtures.js";

test("calendar create dialog supports create delete toggle and zero-state", async ({ page }) => {
  await page.goto("/");

  await page.locator(".calendar-list__add").click();
  await expect(page.locator(".calendar-create-dialog")).toBeVisible();
  await page.locator(".calendar-create-dialog__input:not(.calendar-create-dialog__group)").fill("Errands");
  await page.locator(".calendar-create-dialog__btn--primary").click();

  await expect(page.locator(".calendar-list__name", { hasText: "Errands" })).toBeVisible();

  const firstCheckbox = page.locator(".calendar-list__checkbox").first();
  await firstCheckbox.uncheck();
  await expect(firstCheckbox).not.toBeChecked();

  const workCalendar = page.locator(".calendar-list__item", { hasText: "Work" });
  await expect(workCalendar).toHaveCount(1);

  await page.locator(".calendar-list__item .calendar-list__delete").first().click();
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.locator(".confirm-dialog__btn", { hasText: "Avbryt" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(workCalendar).toHaveCount(1);
  await expect(page.locator(".calendar-list__item")).toHaveCount(3);

  for (let index = 0; index < 3; index += 1) {
    await page.locator(".calendar-list__item .calendar-list__delete").first().click();
    await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
    await page.locator(".confirm-dialog__btn--danger").click();
    await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  }

  await expect(page.locator(".calendar-list__item")).toHaveCount(0);
  await expect(page.locator(".week-grid__empty-title")).toBeVisible();
});
