import { expect, test } from "./fixtures.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function parseDateKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const diff = (next.getDay() - 1 + 7) % 7;
  next.setDate(next.getDate() - diff);
  return next;
}

function firstWeekdayOfNextMonth(fromDateKey, weekdayIndex) {
  const nextMonth = parseDateKey(fromDateKey);
  nextMonth.setDate(1);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const offset = (weekdayIndex - nextMonth.getDay() + 7) % 7;
  nextMonth.setDate(1 + offset);
  return formatDateKey(nextMonth);
}

async function getWeekDates(page) {
  return page.locator(".day-column").evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.date)
  );
}

async function openCreateModal(page) {
  await page.locator(".sidebar__new-event-btn").click();
  await expect(page.locator(".event-modal[open]")).toBeVisible();
}

async function saveModal(page) {
  await page.locator(".event-modal__actions button[type='submit']").click();
  await expect(page.locator(".event-modal[open]")).toHaveCount(0);
}

async function fillBaseEvent(page, { title, startDate, startTime = "09:00", endTime = "09:30" }) {
  await page.locator(".event-modal__input[name='title']").fill(title);
  await page.locator(".event-modal__input[name='startDate']").fill(startDate);
  await page.locator(".event-modal__input[name='endDate']").fill(startDate);
  await page.locator(".event-modal__input[name='startTime']").fill(startTime);
  await page.locator(".event-modal__input[name='endTime']").fill(endTime);
}

async function readStoredEventByTitle(page, title) {
  return page.evaluate((eventTitle) => (
    window.__ORDNING_TAURI_MOCK_STATE.events.find((event) => event.title === eventTitle) ?? null
  ), title);
}

async function readStoredEventById(page, eventId) {
  return page.evaluate((id) => (
    window.__ORDNING_TAURI_MOCK_STATE.events.find((event) => event.id === id) ?? null
  ), eventId);
}

async function advanceToWeek(page, targetDateKey) {
  const [currentWeekStart] = await getWeekDates(page);
  let diffWeeks = Math.round(
    (startOfWeek(parseDateKey(targetDateKey)).getTime()
      - startOfWeek(parseDateKey(currentWeekStart)).getTime()) / MS_PER_WEEK
  );

  const nextButton = page.locator(".main-toolbar__icon-btn[aria-label='Nästa vecka']");
  const previousButton = page.locator(".main-toolbar__icon-btn[aria-label='Föregående vecka']");

  while (diffWeeks > 0) {
    await nextButton.click();
    diffWeeks -= 1;
  }

  while (diffWeeks < 0) {
    await previousButton.click();
    diffWeeks += 1;
  }
}

async function createWeeklyEvent(page, { title, startDate, extraDay = "wed", count = 6 }) {
  await openCreateModal(page);
  await fillBaseEvent(page, { title, startDate });
  await page.locator("select[name='recurrenceRepeat']").selectOption("weekly");
  await page.locator(`.recurrence-picker__chip[data-value='${extraDay}']`).click();
  await page.locator("select[name='recurrenceEnds']").selectOption("after");
  await page.locator("input[name='recurrenceOccurrences']").fill(String(count));
  await saveModal(page);
}

async function createWeeklyPayloadEvent(page, { title, startDate, endMode, count, untilDate }) {
  await openCreateModal(page);
  await fillBaseEvent(page, { title, startDate });
  await page.locator("select[name='recurrenceRepeat']").selectOption("weekly");

  if (endMode !== "never") {
    await page.locator("select[name='recurrenceEnds']").selectOption(endMode);
  }

  if (endMode === "after") {
    await page.locator("input[name='recurrenceOccurrences']").fill(String(count));
  }

  if (endMode === "on_date") {
    await page.locator("input[name='recurrenceUntilDate']").fill(untilDate);
  }

  await saveModal(page);
  return readStoredEventByTitle(page, title);
}

test("weekly recurrence picker creates recurring instances and shows repeat icon", async ({ page }) => {
  await page.goto("/");

  const [monday, , wednesday, , friday] = await getWeekDates(page);
  const title = "Playwright Weekly Recurrence";

  await openCreateModal(page);
  await fillBaseEvent(page, { title, startDate: monday, startTime: "08:30", endTime: "09:00" });
  await page.locator("select[name='recurrenceRepeat']").selectOption("weekly");
  await expect(page.locator(".recurrence-picker__chip[data-value='mon']")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.locator(".recurrence-picker__chip[data-value='wed']").click();
  await page.locator(".recurrence-picker__chip[data-value='fri']").click();
  await page.locator("select[name='recurrenceEnds']").selectOption("after");
  await page.locator("input[name='recurrenceOccurrences']").fill("4");
  await saveModal(page);

  await expect(
    page.locator(`.day-column[data-date='${monday}'] .event-block--recurring`, { hasText: title })
  ).toHaveCount(1);
  await expect(
    page.locator(`.day-column[data-date='${wednesday}'] .event-block--recurring`, { hasText: title })
  ).toHaveCount(1);
  await expect(
    page.locator(`.day-column[data-date='${friday}'] .event-block--recurring`, { hasText: title })
  ).toHaveCount(1);

  const iconContent = await page
    .locator(".event-block--recurring", { hasText: title })
    .first()
    .locator(".event-block__title")
    .evaluate((node) => window.getComputedStyle(node, "::before").content);
  expect(iconContent).toContain("↻");

  const stored = await readStoredEventByTitle(page, title);
  expect(stored?.recurrence?.daysOfWeek ?? []).toEqual(["mon", "wed", "fri"]);
  expect(stored?.recurrence?.endConditionType).toBe("after_count");
  expect(stored?.recurrence?.endConditionCount).toBe(4);
});

test("recurrence picker hides inactive controls as the mode changes", async ({ page }) => {
  await page.goto("/");
  await openCreateModal(page);

  const repeatSelect = page.locator("select[name='recurrenceRepeat']");
  const endsSelect = page.locator("select[name='recurrenceEnds']");
  const intervalInput = page.locator("input[name='recurrenceInterval']");
  const weeklyChip = page.locator(".recurrence-picker__chip[data-value='mon']");
  const weekOfMonth = page.locator("select[name='recurrenceWeekOfMonth']");
  const dayOfWeek = page.locator("select[name='recurrenceDayOfWeek']");
  const occurrences = page.locator("input[name='recurrenceOccurrences']");
  const untilDate = page.locator("input[name='recurrenceUntilDate']");

  await expect(intervalInput).toBeHidden();
  await expect(weeklyChip).toBeHidden();
  await expect(weekOfMonth).toBeHidden();
  await expect(dayOfWeek).toBeHidden();
  await expect(endsSelect).toBeHidden();
  await expect(occurrences).toBeHidden();
  await expect(untilDate).toBeHidden();

  await repeatSelect.selectOption("weekly");
  await expect(intervalInput).toBeVisible();
  await expect(weeklyChip).toBeVisible();
  await expect(weekOfMonth).toBeHidden();
  await expect(dayOfWeek).toBeHidden();
  await expect(endsSelect).toBeVisible();
  await expect(occurrences).toBeHidden();
  await expect(untilDate).toBeHidden();

  await endsSelect.selectOption("after");
  await expect(occurrences).toBeVisible();
  await expect(untilDate).toBeHidden();

  await repeatSelect.selectOption("monthly");
  await expect(weeklyChip).toBeHidden();
  await expect(weekOfMonth).toBeVisible();
  await expect(dayOfWeek).toBeVisible();
  await expect(occurrences).toBeVisible();
  await expect(untilDate).toBeHidden();

  await endsSelect.selectOption("on_date");
  await expect(occurrences).toBeHidden();
  await expect(untilDate).toBeVisible();

  await repeatSelect.selectOption("none");
  await expect(intervalInput).toBeHidden();
  await expect(weeklyChip).toBeHidden();
  await expect(weekOfMonth).toBeHidden();
  await expect(dayOfWeek).toBeHidden();
  await expect(endsSelect).toBeHidden();
  await expect(occurrences).toBeHidden();
  await expect(untilDate).toBeHidden();
});

test("monthly recurrence picker expands nth weekday into a future week", async ({ page }) => {
  await page.goto("/");

  const [weekStart] = await getWeekDates(page);
  const targetDate = firstWeekdayOfNextMonth(weekStart, 3);
  const title = "Playwright Monthly Recurrence";

  await openCreateModal(page);
  await fillBaseEvent(page, { title, startDate: weekStart, startTime: "11:00", endTime: "11:30" });
  await page.locator("select[name='recurrenceRepeat']").selectOption("monthly");
  await page.locator("select[name='recurrenceWeekOfMonth']").selectOption("1");
  await page.locator("select[name='recurrenceDayOfWeek']").selectOption("wed");
  await saveModal(page);

  await advanceToWeek(page, targetDate);
  await expect(
    page.locator(`.day-column[data-date='${targetDate}'] .event-block--recurring`, { hasText: title })
  ).toHaveCount(1);

  const stored = await readStoredEventByTitle(page, title);
  expect(stored?.recurrence?.frequency).toBe("monthly");
  expect(stored?.recurrence?.weekOfMonth).toBe(1);
  expect(stored?.recurrence?.dayOfWeek).toBe("wed");
});

test("editing a recurring event hydrates the picker and preserves the rule", async ({ page }) => {
  await page.goto("/");

  const [monday] = await getWeekDates(page);
  const title = "Playwright Edit Recurrence";
  await createWeeklyEvent(page, { title, startDate: monday, extraDay: "wed", count: 6 });

  const recurringBlock = page.locator(".event-block--recurring", { hasText: title }).first();
  const eventId = await recurringBlock.getAttribute("data-event-action-id");
  expect(eventId).toBeTruthy();

  await recurringBlock.dblclick();
  await expect(page.locator(".event-modal[open]")).toBeVisible();
  await expect(page.locator("select[name='recurrenceRepeat']")).toHaveValue("weekly");
  await expect(page.locator("input[name='recurrenceInterval']")).toHaveValue("1");
  await expect(page.locator(".recurrence-picker__chip[data-value='mon']")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".recurrence-picker__chip[data-value='wed']")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator("select[name='recurrenceEnds']")).toHaveValue("after");
  await expect(page.locator("input[name='recurrenceOccurrences']")).toHaveValue("6");

  await page.locator(".event-modal__input[name='title']").fill("Playwright Edit Recurrence Saved");
  await saveModal(page);

  const stored = await readStoredEventById(page, eventId);
  expect(stored?.title).toBe("Playwright Edit Recurrence Saved");
  expect(stored?.recurrence?.daysOfWeek ?? []).toEqual(["mon", "wed"]);
  expect(stored?.recurrence?.endConditionType).toBe("after_count");
  expect(stored?.recurrence?.endConditionCount).toBe(6);
});

test("recurrence end condition payloads map to never after and on date", async ({ page }) => {
  await page.goto("/");

  const [startDate] = await getWeekDates(page);
  const untilDate = formatDateKey(new Date(parseDateKey(startDate).getTime() + (21 * MS_PER_DAY)));

  const neverEvent = await createWeeklyPayloadEvent(page, {
    title: "Playwright Recurrence Never",
    startDate,
    endMode: "never"
  });
  const afterEvent = await createWeeklyPayloadEvent(page, {
    title: "Playwright Recurrence After",
    startDate,
    endMode: "after",
    count: 7
  });
  const untilEvent = await createWeeklyPayloadEvent(page, {
    title: "Playwright Recurrence Until",
    startDate,
    endMode: "on_date",
    untilDate
  });

  expect(neverEvent?.recurrence?.endConditionType).toBe("never");
  expect(neverEvent?.recurrence?.endConditionCount ?? null).toBeNull();
  expect(neverEvent?.recurrence?.endConditionUntilDate ?? null).toBeNull();

  expect(afterEvent?.recurrence?.endConditionType).toBe("after_count");
  expect(afterEvent?.recurrence?.endConditionCount).toBe(7);
  expect(afterEvent?.recurrence?.endConditionUntilDate ?? null).toBeNull();

  expect(untilEvent?.recurrence?.endConditionType).toBe("until_date");
  expect(untilEvent?.recurrence?.endConditionCount ?? null).toBeNull();
  expect(untilEvent?.recurrence?.endConditionUntilDate).toBe(untilDate);
});
