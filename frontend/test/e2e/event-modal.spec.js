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

test("template search pre-fills create modal while preserving chosen start date and time", async ({ page }) => {
  await page.goto("/");

  const [targetDate] = await page.locator(".day-column").evaluateAll((nodes) =>
    nodes.slice(1, 2).map((node) => node.dataset.date)
  );

  await page.locator(".sidebar__new-event-btn").click();
  await expect(page.locator(".event-modal[open]")).toBeVisible();

  await page.locator(".event-modal__input[name='startDate']").fill(targetDate);
  await page.locator(".event-modal__input[name='startTime']").fill("08:20");

  const titleInput = page.locator(".event-modal__input[name='title']");
  await titleInput.fill("Design");
  await expect(page.locator(".event-modal__template-item")).toHaveCount(4);
  const workshopResults = page.locator(".event-modal__template-item", { hasText: "Design Workshop" });
  await expect(workshopResults).toHaveCount(2);
  await expect(workshopResults.nth(0)).toContainText("Personal");
  await expect(workshopResults.nth(0)).toContainText("13:15-15:00");
  await expect(workshopResults.nth(0)).toContainText("Studio");
  await expect(workshopResults.nth(0)).toContainText("Review mockups");
  await expect(workshopResults.nth(1)).toContainText("Annex");
  await expect(workshopResults.nth(1)).toContainText("Ship v2");

  await page.locator(".event-modal__template-item", { hasText: "Review mockups" }).click();

  await expect(titleInput).toHaveValue("Design Workshop");
  await expect(titleInput).toBeFocused();
  await expect(page.locator(".event-modal__input[name='location']")).toHaveValue("Studio");
  await expect(page.locator(".event-modal__textarea[name='descriptionPrivate']")).toHaveValue("Bring sketches");
  await expect(page.locator(".event-modal__textarea[name='descriptionPublic']")).toHaveValue("Review mockups");
  await expect(page.locator(".event-modal__input[name='startDate']")).toHaveValue(targetDate);
  await expect(page.locator(".event-modal__input[name='startTime']")).toHaveValue("08:20");
  await expect(page.locator(".event-modal__input[name='endDate']")).toHaveValue(targetDate);
  await expect(page.locator(".event-modal__input[name='endTime']")).toHaveValue("10:05");
  await expect(page.locator(".event-modal__input[name='calendarId']")).toHaveValue("cal-personal");
});

test("clicking outside title suggestions collapses dropdown without changing typed title", async ({ page }) => {
  await page.goto("/");

  await page.locator(".sidebar__new-event-btn").click();
  await expect(page.locator(".event-modal[open]")).toBeVisible();

  const titleInput = page.locator(".event-modal__input[name='title']");
  await titleInput.fill("Design Workshop");
  await expect(page.locator(".event-modal__template-item")).toHaveCount(2);

  await page.locator(".event-modal__title").click();
  await expect(page.locator(".event-modal__template-dropdown")).toBeHidden();
  await expect(titleInput).toHaveValue("Design Workshop");

  const locationInput = page.locator(".event-modal__input[name='location']");
  await locationInput.click();
  await locationInput.fill("Custom venue");
  await expect(locationInput).toHaveValue("Custom venue");
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
