import { expect, test } from "./fixtures.js";

test("slot drag opens modal and submit creates event", async ({ page }) => {
  await page.goto("/");

  const beforeCount = await page.locator(".event-block").count();
  const sourceHour = page.locator(".day-column").first().locator(".day-column__hour").nth(1);
  const targetHour = page.locator(".day-column").first().locator(".day-column__hour").nth(3);
  await sourceHour.dragTo(targetHour);

  await expect(page.locator(".event-modal[open]")).toBeVisible();
  await expect(page.locator(".event-modal__empty")).toBeHidden();

  await page.locator(".event-modal__input[name='title']").fill("Playwright Event");
  await page.locator(".event-modal__actions button[type='submit']").click();

  await expect(page.locator(".event-modal[open]")).toHaveCount(0);
  await expect(page.locator(".event-block")).toHaveCount(beforeCount + 1);
});

test("empty title submit shows inline error and keeps modal open", async ({ page }) => {
  await page.goto("/");

  const sourceHour = page.locator(".day-column").first().locator(".day-column__hour").nth(1);
  const targetHour = page.locator(".day-column").first().locator(".day-column__hour").nth(3);
  await sourceHour.dragTo(targetHour);

  const modal = page.locator(".event-modal[open]");
  const titleInput = page.locator(".event-modal__input[name='title']");
  await expect(modal).toBeVisible();
  await titleInput.fill("");
  await page.locator(".event-modal__actions button[type='submit']").click();

  await expect(modal).toBeVisible();
  await expect(titleInput).toHaveClass(/event-modal__input--error/);
  await expect(titleInput).toBeFocused();

  await titleInput.fill("Valid title");
  await expect(titleInput).not.toHaveClass(/event-modal__input--error/);
});

test("single click on empty slot does not open modal", async ({ page }) => {
  await page.goto("/");

  await page.locator(".day-column").first().locator(".day-column__hour").first().click();
  await expect(page.locator(".event-modal[open]")).toHaveCount(0);
});

test("Delete key cancel keeps focused event", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);
  await targetEvent.focus();

  await page.keyboard.press("Delete");
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.locator(".confirm-dialog__btn", { hasText: "Avbryt" }).click();
  await expect(targetEvent).toHaveCount(1);
});

test("Delete key confirm deletes focused event", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);
  await targetEvent.focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.locator(".confirm-dialog__btn--danger").click();
  await expect(targetEvent).toHaveCount(0);
});

test("Delete key confirm deletes click-selected event", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);
  await targetEvent.click();
  await expect(targetEvent).toHaveClass(/event-block--selected/);
  await page.keyboard.press("Delete");
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.locator(".confirm-dialog__btn--danger").click();
  await expect(targetEvent).toHaveCount(0);
});

test("modal delete cancel keeps event", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);
  await targetEvent.dblclick();
  await expect(page.locator(".event-modal[open]")).toBeVisible();
  await page.locator(".event-modal__btn--danger").click();
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.locator(".confirm-dialog__btn", { hasText: "Avbryt" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(page.locator(".event-modal[open]")).toBeVisible();
  await expect(targetEvent).toHaveCount(1);
});

test("confirm dialog autofocuses confirm button and Enter confirms", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);
  await targetEvent.focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await expect(page.locator(".confirm-dialog__btn--danger")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(targetEvent).toHaveCount(0);
});

test("confirm dialog Escape cancels action", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);
  await targetEvent.focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".confirm-dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(targetEvent).toHaveCount(1);
});

test("multi-day timed event renders segments across all spanned days", async ({ page }) => {
  await page.goto("/");

  const dayKeys = await page.locator(".day-column").evaluateAll((nodes) =>
    nodes.slice(0, 3).map((node) => node.dataset.date)
  );
  const [startDay, middleDay, endDay] = dayKeys;

  await page.locator(".sidebar__new-event-btn").click();
  await expect(page.locator(".event-modal[open]")).toBeVisible();
  await page.locator(".event-modal__input[name='title']").fill("Playwright Multi-day Span");
  await page.locator(".event-modal__input[name='startDate']").fill(startDay);
  await page.locator(".event-modal__input[name='endDate']").fill(endDay);
  await page.locator(".event-modal__input[name='startTime']").fill("10:00");
  await page.locator(".event-modal__input[name='endTime']").fill("12:00");
  await page.locator(".event-modal__actions button[type='submit']").click();
  await expect(page.locator(".event-modal[open]")).toHaveCount(0);

  await expect(
    page.locator(`.day-column[data-date='${startDay}'] .event-block`, { hasText: "Playwright Multi-day Span" })
  ).toHaveCount(1);
  await expect(
    page.locator(`.day-column[data-date='${middleDay}'] .event-block`, { hasText: "Playwright Multi-day Span" })
  ).toHaveCount(1);
  await expect(
    page.locator(`.day-column[data-date='${endDay}'] .event-block`, { hasText: "Playwright Multi-day Span" })
  ).toHaveCount(1);
});
