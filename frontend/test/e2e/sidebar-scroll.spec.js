import { expect, test } from "./fixtures.js";

test("opening event modal preserves sidebar calendar scroll position", async ({ page }) => {
  await page.goto("/");

  for (let index = 0; index < 12; index += 1) {
    await page.locator(".calendar-list__add").click();
    await page.locator(".calendar-create-dialog__input:not(.calendar-create-dialog__group)").fill(`Scroll ${index}`);
    await page.locator(".calendar-create-dialog__btn--primary").click();
  }

  const groups = page.locator(".calendar-list__groups");
  const beforeScroll = await groups.evaluate((node) => {
    node.scrollTop = 120;
    return node.scrollTop;
  });

  await page.locator(".sidebar__new-event-btn").click();
  await expect(page.locator(".event-modal[open]")).toHaveCount(1);

  const duringScroll = await groups.evaluate((node) => node.scrollTop);
  expect(Math.abs(duringScroll - beforeScroll)).toBeLessThan(3);

  await page.locator(".event-modal__actions .event-modal__btn", { hasText: "Avbryt" }).click();
  await expect(page.locator(".event-modal[open]")).toHaveCount(0);

  const afterScroll = await groups.evaluate((node) => node.scrollTop);
  expect(Math.abs(afterScroll - beforeScroll)).toBeLessThan(3);
});
