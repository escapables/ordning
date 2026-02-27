import { expect, test } from "./fixtures.js";

function nextDay(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDate = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDate}`;
}

test("cross-midnight event survives export/import round-trip", async ({ page }) => {
  await page.goto("/");

  const calendarId = await page.evaluate(async () => {
    const created = await window.__TAURI__.core.invoke("create_calendar", {
      name: "Roundtrip",
      color: "#34c759"
    });
    return created.id;
  });

  const firstDay = await page.locator(".day-column").first().getAttribute("data-date");
  expect(firstDay).toBeTruthy();
  const secondDay = nextDay(firstDay);

  const original = await page.evaluate(async ({ calendarId, firstDay, secondDay }) => {
    const result = await window.__TAURI__.core.invoke("create_event", {
      event: {
        calendarId,
        title: "Roundtrip Wrap",
        startDate: firstDay,
        endDate: secondDay,
        startTime: "23:00",
        endTime: "01:30",
        allDay: false,
        descriptionPrivate: "",
        descriptionPublic: "",
        location: ""
      }
    });
    return result.id;
  }, { calendarId, firstDay, secondDay });

  await page.locator(".main-toolbar__today-btn").click();

  const eventBlocks = page.locator(".event-block", { hasText: "Roundtrip Wrap" });
  await expect(eventBlocks).toHaveCount(2);

  const exportResult = await page.evaluate(async (calendarId) => {
    return window.__TAURI__.core.invoke("export_json", {
      mode: "full",
      calendarIds: [calendarId]
    });
  }, calendarId);

  await page.evaluate(async (eventId) => {
    await window.__TAURI__.core.invoke("delete_event", { id: eventId });
  }, original);

  await page.locator(".main-toolbar__today-btn").click();
  await expect(page.locator(".event-block", { hasText: "Roundtrip Wrap" })).toHaveCount(0);

  await page.evaluate(async (path) => {
    await window.__TAURI__.core.invoke("import_json", {
      path,
      strategy: "merge"
    });
  }, exportResult.path);

  await page.locator(".main-toolbar__today-btn").click();
  await expect(page.locator(".event-block", { hasText: "Roundtrip Wrap" })).toHaveCount(2);
});
