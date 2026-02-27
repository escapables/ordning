import { expect, test } from "./fixtures.js";

test("dragging bottom edge resizes event end time with preview", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);
  await targetEvent.scrollIntoViewIfNeeded();
  const box = await targetEvent.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + (box.width / 2), box.y + box.height - 2);
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2), box.y + box.height + 42, { steps: 8 });
  await expect(page.locator(".day-column__move-preview")).toHaveCount(1);
  await page.mouse.up();

  await expect(targetEvent.locator(".event-block__time")).toContainText("09:00 - 11:30");
});

test("dragging bottom edge enforces 15-minute minimum duration", async ({ page }) => {
  await page.goto("/");

  const targetEvent = page.locator(".day-column").nth(0).locator(".event-block", { hasText: "Sprint Planning" });
  await expect(targetEvent).toHaveCount(1);
  await targetEvent.scrollIntoViewIfNeeded();
  const box = await targetEvent.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + (box.width / 2), box.y + box.height - 2);
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2), box.y - 42, { steps: 12 });
  await page.mouse.up();

  await expect(targetEvent.locator(".event-block__time")).toContainText("09:00 - 09:15");
});

test("overlap columns remain stable for untouched events after resize re-render", async ({ page }) => {
  await page.goto("/");

  const column = page.locator(".day-column").nth(0);
  const parallel = column.locator(".event-block", { hasText: "Parallel Sync" });
  const ops = column.locator(".event-block", { hasText: "Ops Check-in" });
  const sprint = column.locator(".event-block", { hasText: "Sprint Planning" });
  await expect(parallel).toHaveCount(1);
  await expect(ops).toHaveCount(1);
  await expect(sprint).toHaveCount(1);

  const parallelBefore = await parallel.boundingBox();
  const opsBefore = await ops.boundingBox();
  const sprintBox = await sprint.boundingBox();
  expect(parallelBefore).not.toBeNull();
  expect(opsBefore).not.toBeNull();
  expect(sprintBox).not.toBeNull();

  await page.mouse.move(sprintBox.x + (sprintBox.width / 2), sprintBox.y + sprintBox.height - 2);
  await page.mouse.down();
  await page.mouse.move(sprintBox.x + (sprintBox.width / 2), sprintBox.y + sprintBox.height + 42, { steps: 8 });
  await page.mouse.up();

  const parallelAfter = await parallel.boundingBox();
  const opsAfter = await ops.boundingBox();
  expect(parallelAfter).not.toBeNull();
  expect(opsAfter).not.toBeNull();
  expect(Math.abs(parallelAfter.x - parallelBefore.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(opsAfter.x - opsBefore.x)).toBeLessThanOrEqual(1);
});

test("resizing shared boundary updates adjacent event and shows dual ghost preview", async ({ page }) => {
  await page.goto("/");

  const date = await page.locator(".day-column").first().getAttribute("data-date");
  expect(date).toBeTruthy();
  await page.evaluate(async ({ day }) => {
    await window.__TAURI__.core.invoke("create_event", {
      event: {
        calendarId: "cal-work",
        title: "Adjacent Pair",
        startDate: day,
        endDate: day,
        startTime: "10:30",
        endTime: "11:30",
        allDay: false,
        descriptionPrivate: "",
        descriptionPublic: "",
        location: ""
      }
    });
  }, { day: date });
  await page.locator(".main-toolbar__today-btn", { hasText: "Idag" }).click();

  const column = page.locator(".day-column").nth(0);
  const sprint = column.locator(".event-block", { hasText: "Sprint Planning" });
  const adjacent = column.locator(".event-block", { hasText: "10:30 - 11:30" });
  await expect(sprint).toHaveCount(1);
  await expect(adjacent).toHaveCount(1);

  const sprintBox = await sprint.boundingBox();
  expect(sprintBox).not.toBeNull();
  await page.mouse.move(sprintBox.x + (sprintBox.width / 2), sprintBox.y + sprintBox.height - 2);
  await page.mouse.down();
  await page.mouse.move(sprintBox.x + (sprintBox.width / 2), sprintBox.y + sprintBox.height + 11, { steps: 6 });
  await expect(page.locator(".day-column__move-preview")).toHaveCount(2);
  await page.mouse.up();

  await expect(sprint.locator(".event-block__time")).toContainText("09:00 - 10:45");
  await expect(column.locator(".event-block", { hasText: "10:45 - 11:30" })).toHaveCount(1);
});

test("linked resize decreasing wrapped event keeps next-day span", async ({ page }) => {
  await page.goto("/");

  const date = await page.locator(".day-column").first().getAttribute("data-date");
  expect(date).toBeTruthy();
  await page.evaluate(async ({ day }) => {
    await window.__TAURI__.core.invoke("create_event", {
      event: {
        calendarId: "cal-work",
        title: "Late Block",
        startDate: day,
        endDate: day,
        startTime: "22:00",
        endTime: "23:30",
        allDay: false,
        descriptionPrivate: "",
        descriptionPublic: "",
        location: ""
      }
    });
    await window.__TAURI__.core.invoke("create_event", {
      event: {
        calendarId: "cal-work",
        title: "Wrap Block",
        startDate: day,
        endDate: day,
        startTime: "23:30",
        endTime: "01:30",
        allDay: false,
        descriptionPrivate: "",
        descriptionPublic: "",
        location: ""
      }
    });
  }, { day: date });
  await page.locator(".main-toolbar__today-btn", { hasText: "Idag" }).click();

  const column = page.locator(".day-column").first();
  const wrap = column.locator(".event-block", { hasText: "Wrap Block" });
  await expect(wrap).toHaveCount(1);

  const wrapBox = await wrap.boundingBox();
  expect(wrapBox).not.toBeNull();
  await page.mouse.move(wrapBox.x + (wrapBox.width / 2), wrapBox.y + 2);
  await page.mouse.down();
  await page.mouse.move(wrapBox.x + (wrapBox.width / 2), wrapBox.y + 10, { steps: 6 });
  await page.mouse.up();

  await expect(column.locator(".event-block", { hasText: "Late Block" })).toContainText("22:00 - 23:45");
  await expect(column.locator(".event-block", { hasText: "Wrap Block" })).toContainText("23:45 - 01:30");
  await expect(column.locator(".event-block", { hasText: "23:45 - 00:00" })).toHaveCount(0);
});

test("wrapped continuation payload keeps original start anchor date", async ({ page }) => {
  await page.goto("/");

  const payload = await page.evaluate(async () => {
    const mod = await import("/src/components/week-view/drag-payload-utils.js");
    return mod.buildResizePayload({
      eventId: "evt-wrap",
      date: "2026-02-24",
      startMinutes: 0,
      endMinutes: 75,
      anchorDate: "2026-02-23",
      clockStart: "23:30",
      clockEnd: "01:30"
    });
  });

  expect(payload).toEqual({
    eventId: "evt-wrap",
    startDate: "2026-02-23",
    endDate: "2026-02-24",
    startTime: "23:30",
    endTime: "01:15"
  });
});

test("multi-day continuation resize payload keeps original start anchor date", async ({ page }) => {
  await page.goto("/");

  const payload = await page.evaluate(async () => {
    const mod = await import("/src/components/week-view/drag-payload-utils.js");
    return mod.buildResizePayload({
      eventId: "evt-span",
      date: "2026-02-25",
      startMinutes: 0,
      endMinutes: 180,
      anchorDate: "2026-02-23",
      clockStart: "10:00",
      clockEnd: "12:00"
    });
  });

  expect(payload).toEqual({
    eventId: "evt-span",
    startDate: "2026-02-23",
    endDate: "2026-02-25",
    startTime: "10:00",
    endTime: "03:00"
  });
});

test("moving >24h timed event keeps full span in payload math", async ({ page }) => {
  await page.goto("/");

  const payload = await page.evaluate(async () => {
    const dragTime = await import("/src/components/week-view/drag-time-utils.js");
    const dragPayload = await import("/src/components/week-view/drag-payload-utils.js");
    const durationMinutes = dragTime.eventDurationMinutes({
      startDate: "2026-02-24",
      endDate: "2026-02-26",
      startTime: "10:00",
      endTime: "12:00"
    });
    return dragPayload.buildTimedPayload({
      eventId: "evt-long",
      date: "2026-02-23",
      startMinutes: 10 * 60,
      endMinutes: (10 * 60) + durationMinutes
    });
  });

  expect(payload).toEqual({
    eventId: "evt-long",
    startDate: "2026-02-23",
    endDate: "2026-02-25",
    startTime: "10:00",
    endTime: "12:00"
  });
});
