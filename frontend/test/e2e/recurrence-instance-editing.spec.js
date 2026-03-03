import { expect, test } from "./fixtures.js";

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

function addDaysToDateKey(value, days) {
  const next = parseDateKey(value);
  next.setDate(next.getDate() + days);
  return formatDateKey(next);
}

async function getWeekDates(page) {
  return page.locator(".day-column").evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.date)
  );
}

async function refreshWeek(page) {
  await page.locator(".main-toolbar__today-btn", { hasText: "Idag" }).click();
}

async function createWeeklyRecurringEvent(page, { title, startDate, daysOfWeek = ["mon"], count = 6 }) {
  await page.evaluate(async (payload) => {
    await window.__TAURI__.core.invoke("create_event", {
      event: {
        calendarId: "cal-work",
        title: payload.title,
        startDate: payload.startDate,
        endDate: payload.startDate,
        startTime: "09:00",
        endTime: "09:30",
        allDay: false,
        descriptionPrivate: "",
        descriptionPublic: "",
        location: "",
        recurrence: {
          frequency: "weekly",
          interval: 1,
          daysOfWeek: payload.daysOfWeek,
          endConditionType: "after_count",
          endConditionCount: payload.count,
          endConditionUntilDate: null,
          exceptionDates: [],
          weekOfMonth: null,
          dayOfWeek: null
        }
      }
    });
  }, { title, startDate, daysOfWeek, count });
  await refreshWeek(page);
}

async function dragEventToHour(page, sourceEvent, targetHour) {
  await sourceEvent.scrollIntoViewIfNeeded();

  const sourceBox = await sourceEvent.boundingBox();
  const targetBox = await targetHour.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  await page.mouse.move(sourceBox.x + 12, sourceBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 18, sourceBox.y + 14, { steps: 4 });
  await page.mouse.move(targetBox.x + 20, targetBox.y + 10, { steps: 10 });
  await page.mouse.up();
}

async function readStoredEventsByTitle(page, title) {
  return page.evaluate((eventTitle) => (
    window.__ORDNING_TAURI_MOCK_STATE.events.filter((event) => event.title === eventTitle)
  ), title);
}

test("moving a recurring instance as just this one creates an override", async ({ page }) => {
  await page.goto("/");

  const [monday, tuesday] = await getWeekDates(page);
  const title = "Recurring One-Off Move";
  await createWeeklyRecurringEvent(page, { title, startDate: monday });

  const recurringBlock = page.locator(`.day-column[data-date='${monday}'] .event-block--recurring`, {
    hasText: title
  });
  const targetHour = page.locator(`.day-column[data-date='${tuesday}'] .day-column__hour`).nth(11);

  await dragEventToHour(page, recurringBlock, targetHour);
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(1);
  await page.locator(".confirm-dialog__btn", { hasText: "Bara den här" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);

  await expect(page.locator(`.day-column[data-date='${tuesday}'] .event-block`, { hasText: title })).toHaveCount(1);
  await expect(
    page.locator(`.day-column[data-date='${tuesday}'] .event-block--recurring`, { hasText: title })
  ).toHaveCount(0);

  const stored = await readStoredEventsByTitle(page, title);
  expect(stored).toHaveLength(2);

  const parent = stored.find((event) => event.recurrence);
  const override = stored.find((event) => !event.recurrence);
  expect(parent?.recurrence?.exceptionDates ?? []).toContain(monday);
  expect(override?.recurrenceParentId).toBe(parent?.id);
  expect(override?.startDate).toBe(tuesday);
  expect(override?.startTime).toBe("11:00");
  expect(override?.endTime).toBe("11:30");
});

test("deleting a recurring instance as just this one adds an exception", async ({ page }) => {
  await page.goto("/");

  const [monday] = await getWeekDates(page);
  const title = "Recurring One-Off Delete";
  await createWeeklyRecurringEvent(page, { title, startDate: monday });

  const recurringBlock = page.locator(`.day-column[data-date='${monday}'] .event-block--recurring`, {
    hasText: title
  });
  await recurringBlock.click({ button: "right" });
  await page.locator(".context-menu__item--danger").click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(1);
  await page.locator(".confirm-dialog__btn", { hasText: "Bara den här" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);

  await expect(page.locator(`.day-column[data-date='${monday}'] .event-block`, { hasText: title })).toHaveCount(0);

  const stored = await readStoredEventsByTitle(page, title);
  expect(stored).toHaveLength(1);
  expect(stored[0].recurrence?.exceptionDates ?? []).toContain(monday);
});

test("deleting a recurring instance as all future truncates the parent series", async ({ page }) => {
  await page.goto("/");

  const [monday] = await getWeekDates(page);
  const title = "Recurring Delete Future";
  await createWeeklyRecurringEvent(page, { title, startDate: monday });

  const recurringBlock = page.locator(`.day-column[data-date='${monday}'] .event-block--recurring`, {
    hasText: title
  });
  await recurringBlock.click({ button: "right" });
  await page.locator(".context-menu__item--danger").click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(1);
  await page.locator(".confirm-dialog__btn", { hasText: "Alla framtida" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);

  await expect(page.locator(`.day-column[data-date='${monday}'] .event-block`, { hasText: title })).toHaveCount(0);

  const stored = await readStoredEventsByTitle(page, title);
  expect(stored).toHaveLength(1);
  expect(stored[0].recurrence?.endConditionType).toBe("until_date");
  expect(stored[0].recurrence?.endConditionUntilDate).toBe(addDaysToDateKey(monday, -1));
});

test("moving a recurring instance as all future on first instance updates in-place", async ({ page }) => {
  await page.goto("/");

  const [monday, tuesday] = await getWeekDates(page);
  const title = "Recurring Future Move First";
  await createWeeklyRecurringEvent(page, { title, startDate: monday });

  const recurringBlock = page.locator(`.day-column[data-date='${monday}'] .event-block--recurring`, {
    hasText: title
  });
  const targetHour = page.locator(`.day-column[data-date='${tuesday}'] .day-column__hour`).nth(10);

  await dragEventToHour(page, recurringBlock, targetHour);
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(1);
  await page.locator(".confirm-dialog__btn", { hasText: "Alla framtida" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);

  await expect(
    page.locator(`.day-column[data-date='${tuesday}'] .event-block--recurring`, { hasText: title })
  ).toHaveCount(1);

  const stored = await readStoredEventsByTitle(page, title);
  expect(stored).toHaveLength(1);
  expect(stored[0].startDate).toBe(tuesday);
  expect(stored[0].startTime).toBe("10:00");
  expect(stored[0].endTime).toBe("10:30");
  expect(stored[0].recurrence?.daysOfWeek ?? []).toEqual(["tue"]);
});

test("moving a recurring instance as all future on later instance splits the chain", async ({ page }) => {
  await page.goto("/");

  const [monday, tuesday] = await getWeekDates(page);
  const previousMonday = addDaysToDateKey(monday, -7);
  const title = "Recurring Future Move Split";
  await createWeeklyRecurringEvent(page, { title, startDate: previousMonday });

  const recurringBlock = page.locator(`.day-column[data-date='${monday}'] .event-block--recurring`, {
    hasText: title
  });
  const targetHour = page.locator(`.day-column[data-date='${tuesday}'] .day-column__hour`).nth(10);

  await dragEventToHour(page, recurringBlock, targetHour);
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(1);
  await page.locator(".confirm-dialog__btn", { hasText: "Alla framtida" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);

  await expect(
    page.locator(`.day-column[data-date='${tuesday}'] .event-block--recurring`, { hasText: title })
  ).toHaveCount(1);

  const stored = await readStoredEventsByTitle(page, title);
  expect(stored).toHaveLength(2);

  const parent = stored.find((event) => event.startDate === previousMonday);
  const newChain = stored.find((event) => event.startDate !== previousMonday);
  expect(parent?.recurrence?.endConditionType).toBe("until_date");
  expect(parent?.recurrence?.endConditionUntilDate).toBe(addDaysToDateKey(monday, -1));
  expect(newChain?.startDate).toBe(tuesday);
  expect(newChain?.startTime).toBe("10:00");
  expect(newChain?.endTime).toBe("10:30");
  expect(newChain?.recurrence?.daysOfWeek ?? []).toEqual(["tue"]);
  expect(newChain?.recurrenceParentId).toBeNull();
});

test("editing recurring instance description as just this one creates override", async ({ page }) => {
  await page.goto("/");

  const [monday] = await getWeekDates(page);
  const title = "Recurring Desc Override";
  await createWeeklyRecurringEvent(page, { title, startDate: monday });

  const recurringBlock = page.locator(`.day-column[data-date='${monday}'] .event-block--recurring`, {
    hasText: title
  });
  await recurringBlock.dblclick();
  await expect(page.locator("dialog.event-modal[open]")).toHaveCount(1);

  await page.locator("textarea[name='descriptionPrivate']").fill("new private note");
  await page.locator(".event-modal__btn--primary", { hasText: "Spara" }).click();

  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(1);
  await page.locator(".confirm-dialog__btn", { hasText: "Bara den här" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(page.locator("dialog.event-modal[open]")).toHaveCount(0);

  const stored = await readStoredEventsByTitle(page, title);
  expect(stored).toHaveLength(2);

  const parent = stored.find((event) => event.recurrence);
  const override = stored.find((event) => !event.recurrence);
  expect(parent?.recurrence?.exceptionDates ?? []).toContain(monday);
  expect(override?.recurrenceParentId).toBe(parent?.id);
  expect(override?.startDate).toBe(monday);
  expect(override?.descriptionPrivate).toBe("new private note");
});

test("editing recurring instance description as all future updates parent", async ({ page }) => {
  await page.goto("/");

  const [monday] = await getWeekDates(page);
  const title = "Recurring Desc Future";
  await createWeeklyRecurringEvent(page, { title, startDate: monday });

  const recurringBlock = page.locator(`.day-column[data-date='${monday}'] .event-block--recurring`, {
    hasText: title
  });
  await recurringBlock.dblclick();
  await expect(page.locator("dialog.event-modal[open]")).toHaveCount(1);

  await page.locator("textarea[name='descriptionPrivate']").fill("updated for all");
  await page.locator(".event-modal__btn--primary", { hasText: "Spara" }).click();

  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(1);
  await page.locator(".confirm-dialog__btn", { hasText: "Alla framtida" }).click();
  await expect(page.locator("dialog.event-modal[open]")).toHaveCount(0);

  const stored = await readStoredEventsByTitle(page, title);
  expect(stored).toHaveLength(1);
  expect(stored[0].descriptionPrivate).toBe("updated for all");
  expect(stored[0].recurrence).toBeTruthy();
});

test("deleting from modal on virtual instance shows scope dialog", async ({ page }) => {
  await page.goto("/");

  const [monday] = await getWeekDates(page);
  const title = "Recurring Modal Delete";
  await createWeeklyRecurringEvent(page, { title, startDate: monday });

  const recurringBlock = page.locator(`.day-column[data-date='${monday}'] .event-block--recurring`, {
    hasText: title
  });
  await recurringBlock.dblclick();
  await expect(page.locator("dialog.event-modal[open]")).toHaveCount(1);

  await page.locator(".event-modal__btn--danger", { hasText: "Ta bort" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(1);
  await page.locator(".confirm-dialog__btn", { hasText: "Bara den här" }).click();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  await expect(page.locator("dialog.event-modal[open]")).toHaveCount(0);

  await expect(
    page.locator(`.day-column[data-date='${monday}'] .event-block`, { hasText: title })
  ).toHaveCount(0);

  const stored = await readStoredEventsByTitle(page, title);
  expect(stored).toHaveLength(1);
  expect(stored[0].recurrence?.exceptionDates ?? []).toContain(monday);
});
