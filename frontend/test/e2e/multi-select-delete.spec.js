import { expect, test } from "./fixtures.js";

test("Ctrl+click selects multiple events", async ({ page }) => {
  await page.goto("/");

  const monday = page.locator(".day-column").nth(0);
  const events = monday.locator(".event-block");
  await expect(events).toHaveCount(4);

  const first = events.nth(0);
  const second = events.nth(1);

  await first.click();
  await expect(first).toHaveClass(/event-block--selected/);
  await expect(second).not.toHaveClass(/event-block--selected/);

  await second.click({ modifiers: ["Control"] });
  await expect(first).toHaveClass(/event-block--selected/);
  await expect(second).toHaveClass(/event-block--selected/);
});

test("Ctrl+click toggles deselects already-selected event", async ({ page }) => {
  await page.goto("/");

  const monday = page.locator(".day-column").nth(0);
  const events = monday.locator(".event-block");
  const first = events.nth(0);
  const second = events.nth(1);

  await first.click();
  await second.click({ modifiers: ["Control"] });
  await expect(first).toHaveClass(/event-block--selected/);
  await expect(second).toHaveClass(/event-block--selected/);

  await first.click({ modifiers: ["Control"] });
  await expect(first).not.toHaveClass(/event-block--selected/);
  await expect(second).toHaveClass(/event-block--selected/);
});

test("plain click deselects all and selects one", async ({ page }) => {
  await page.goto("/");

  const monday = page.locator(".day-column").nth(0);
  const events = monday.locator(".event-block");
  const first = events.nth(0);
  const second = events.nth(1);
  const third = events.nth(2);

  await first.click();
  await second.click({ modifiers: ["Control"] });
  await expect(first).toHaveClass(/event-block--selected/);
  await expect(second).toHaveClass(/event-block--selected/);

  await third.click();
  await expect(first).not.toHaveClass(/event-block--selected/);
  await expect(second).not.toHaveClass(/event-block--selected/);
  await expect(third).toHaveClass(/event-block--selected/);
});

test("DEL key on multi-selection shows confirm dialog with count and deletes", async ({ page }) => {
  await page.goto("/");

  const monday = page.locator(".day-column").nth(0);
  const events = monday.locator(".event-block");
  const initialCount = await events.count();

  const first = events.nth(0);
  const second = events.nth(1);

  await first.click();
  await second.click({ modifiers: ["Control"] });

  await page.keyboard.press("Delete");

  const dialog = page.locator(".confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("2");

  await dialog.locator("button", { hasText: /Ta bort|Delete|Ja|Yes|OK/ }).first().click();

  await expect(monday.locator(".event-block")).toHaveCount(initialCount - 2);
});

test("context menu on multi-selection shows Delete (N) and deletes", async ({ page }) => {
  await page.goto("/");

  const monday = page.locator(".day-column").nth(0);
  const events = monday.locator(".event-block");
  const initialCount = await events.count();

  const first = events.nth(0);
  const second = events.nth(1);

  await first.click();
  await second.click({ modifiers: ["Control"] });

  await first.click({ button: "right" });

  const contextMenu = page.locator(".context-menu");
  await expect(contextMenu).toBeVisible();
  const deleteItem = contextMenu.locator(".context-menu__item--danger");
  await expect(deleteItem).toContainText("(2)");

  await deleteItem.click();

  const dialog = page.locator(".confirm-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("button", { hasText: /Ta bort|Delete|Ja|Yes|OK/ }).first().click();

  await expect(monday.locator(".event-block")).toHaveCount(initialCount - 2);
});

test("pointerdown without Ctrl on multi-selection deselects to one, no drag", async ({ page }) => {
  await page.goto("/");

  const monday = page.locator(".day-column").nth(0);
  const events = monday.locator(".event-block");

  const first = events.nth(0);
  const second = events.nth(1);

  await first.click();
  await second.click({ modifiers: ["Control"] });
  await expect(first).toHaveClass(/event-block--selected/);
  await expect(second).toHaveClass(/event-block--selected/);

  const thirdEvent = events.nth(2);
  await thirdEvent.click();

  const selectedEvents = monday.locator(".event-block--selected");
  await expect(selectedEvents).toHaveCount(1);
  await expect(thirdEvent).toHaveClass(/event-block--selected/);
});

test("plain click on different event clears multi-selection", async ({ page }) => {
  await page.goto("/");

  const columns = page.locator(".day-column");
  const monday = columns.nth(0);
  const mondayEvents = monday.locator(".event-block");

  const first = mondayEvents.nth(0);
  const second = mondayEvents.nth(1);

  await first.click();
  await second.click({ modifiers: ["Control"] });

  const selectedCount = await page.locator(".event-block--selected").count();
  expect(selectedCount).toBe(2);

  const tuesday = columns.nth(1);
  const tuesdayEvent = tuesday.locator(".event-block").first();
  await tuesdayEvent.click();

  await expect(first).not.toHaveClass(/event-block--selected/);
  await expect(second).not.toHaveClass(/event-block--selected/);
  await expect(tuesdayEvent).toHaveClass(/event-block--selected/);
});
