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

test("search result navigates week and scrolls with one-hour margin", async ({ page }) => {
  await page.goto("/");

  const toolbarTitle = page.locator(".main-toolbar__title");
  const beforeTitle = await toolbarTitle.textContent();
  const body = page.locator(".week-grid__body");

  const input = page.locator(".toolbar-search__input");
  await input.fill("Archived Planning");
  await expect(page.locator(".toolbar-search__item-title", { hasText: "Archived Planning" })).toBeVisible();
  await page.locator(".toolbar-search__item", { hasText: "Archived Planning" }).click();

  await expect(toolbarTitle).not.toHaveText(beforeTitle || "");
  const highlightedEvent = page.locator(".event-block--highlighted", { hasText: "Archived Planning" });
  await expect(highlightedEvent).toHaveCount(1);

  const scrollTop = await body.evaluate((node) => node.scrollTop);
  expect(scrollTop).toBeGreaterThan(285);
  expect(scrollTop).toBeLessThan(305);
});
