import { expect, test } from "./fixtures.js";

async function openEditModal(page, eventTitle) {
  const block = page.locator(".event-block", { hasText: eventTitle }).first();
  await block.dblclick();
  await expect(page.locator(".event-modal[open]")).toBeVisible();
}

async function readStoredEvents(page) {
  return page.evaluate(() => window.__ORDNING_TAURI_MOCK_STATE.events);
}

test("bulk update all — updates descriptions on all matching events", async ({ page }) => {
  await page.goto("/");

  await openEditModal(page, "Design Workshop");
  await page.locator(".event-modal__textarea[name='descriptionPrivate']").fill("Shared private note");
  await page.locator(".event-modal__actions button[type='submit']").click();

  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await expect(page.locator(".confirm-dialog__message")).toContainText("1");
  await page.locator(".confirm-dialog__btn--success").click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(page.locator(".event-modal[open]")).toHaveCount(0);

  const events = await readStoredEvents(page);
  const workshops = events.filter((e) => e.title === "Design Workshop");
  expect(workshops).toHaveLength(2);
  for (const workshop of workshops) {
    expect(workshop.descriptionPrivate).toBe("Shared private note");
  }
});

test("only this one — updates only the edited event description", async ({ page }) => {
  await page.goto("/");

  await openEditModal(page, "Design Workshop");
  await page.locator(".event-modal__textarea[name='descriptionPublic']").fill("Solo public note");
  await page.locator(".event-modal__actions button[type='submit']").click();

  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.locator(".confirm-dialog__btn", { hasText: "Bara den här" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(page.locator(".event-modal[open]")).toHaveCount(0);

  const events = await readStoredEvents(page);
  const workshops = events.filter((e) => e.title === "Design Workshop");
  expect(workshops).toHaveLength(2);
  const updated = workshops.find((e) => e.descriptionPublic === "Solo public note");
  const untouched = workshops.find((e) => e.descriptionPublic !== "Solo public note");
  expect(updated).toBeTruthy();
  expect(untouched).toBeTruthy();
});

test("no dialog when no matching events", async ({ page }) => {
  await page.goto("/");

  await openEditModal(page, "Sprint Planning");
  await page.locator(".event-modal__textarea[name='descriptionPrivate']").fill("New private note");
  await page.locator(".event-modal__actions button[type='submit']").click();

  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(page.locator(".event-modal[open]")).toHaveCount(0);
});

test("cancel aborts save entirely", async ({ page }) => {
  await page.goto("/");

  await openEditModal(page, "Design Workshop");
  const originalPrivate = await page.locator(".event-modal__textarea[name='descriptionPrivate']").inputValue();
  await page.locator(".event-modal__textarea[name='descriptionPrivate']").fill("Should not persist");
  await page.locator(".event-modal__actions button[type='submit']").click();

  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.locator(".confirm-dialog__btn", { hasText: "Avbryt" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(page.locator(".event-modal[open]")).toBeVisible();

  const events = await readStoredEvents(page);
  const workshops = events.filter((e) => e.title === "Design Workshop");
  for (const workshop of workshops) {
    expect(workshop.descriptionPrivate).not.toBe("Should not persist");
  }
});
