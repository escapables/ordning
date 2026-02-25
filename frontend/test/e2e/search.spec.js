import { expect, test } from "./fixtures.js";

test("toolbar search shows results, no-results state, and selection", async ({ page }) => {
  await page.goto("/");

  const input = page.locator(".toolbar-search__input");
  await expect(input).toBeVisible();

  await input.fill("Dentist");
  await expect(page.locator(".toolbar-search__item-title", { hasText: "Dentist" })).toBeVisible();

  await input.fill("does-not-exist");
  await expect(page.locator(".toolbar-search__empty")).toBeVisible();

  await input.fill("Dentist");
  await page.locator(".toolbar-search__item", { hasText: "Dentist" }).click();
  await expect(page.locator(".toolbar-search__dropdown")).toBeHidden();
  await expect(page.locator(".event-block--highlighted")).toHaveCount(1);
});
