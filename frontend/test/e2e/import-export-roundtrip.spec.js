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

  await page.evaluate(async (calendarId) => {
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

  await page.evaluate(async () => {
    await window.__TAURI__.core.invoke("preview_import_json", {
      strategy: "merge"
    });
    await window.__TAURI__.core.invoke("import_json", {
      strategy: "merge"
    });
  });

  await page.locator(".main-toolbar__today-btn").click();
  await expect(page.locator(".event-block", { hasText: "Roundtrip Wrap" })).toHaveCount(2);
});

test("encrypted export dialog round-trip restores event with password", async ({ page }) => {
  await page.goto("/");

  const calendarId = await page.evaluate(async () => {
    const created = await window.__TAURI__.core.invoke("create_calendar", {
      name: "Encrypted Roundtrip",
      color: "#ff9500"
    });

    const { loadCalendars } = await import("/src/state.js");
    await loadCalendars();
    return created.id;
  });

  const firstDay = await page.locator(".day-column").first().getAttribute("data-date");
  expect(firstDay).toBeTruthy();
  const secondDay = nextDay(firstDay);

  const original = await page.evaluate(async ({ calendarId, firstDay, secondDay }) => {
    const result = await window.__TAURI__.core.invoke("create_event", {
      event: {
        calendarId,
        title: "Encrypted Wrap",
        startDate: firstDay,
        endDate: secondDay,
        startTime: "23:15",
        endTime: "01:45",
        allDay: false,
        descriptionPrivate: "keep secret",
        descriptionPublic: "share ok",
        location: ""
      }
    });
    return result.id;
  }, { calendarId, firstDay, secondDay });

  await page.locator(".main-toolbar__today-btn").click();
  await expect(page.locator(".event-block", { hasText: "Encrypted Wrap" })).toHaveCount(2);

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator(".calendar-list__io-btn", { hasText: /export/i }).click();
  await expect(page.locator(".export-dialog__passwords")).toBeHidden();
  await page.locator(".export-dialog__encrypt-checkbox").check();
  await page.locator(".export-dialog__password-input").fill("top secret");
  await page.locator(".export-dialog__password-confirm-input").fill("top secret");
  await page.locator(".export-dialog__btn--primary").click();

  await page.evaluate(async (eventId) => {
    await window.__TAURI__.core.invoke("delete_event", { id: eventId });
  }, original);

  await page.locator(".main-toolbar__today-btn").click();
  await expect(page.locator(".event-block", { hasText: "Encrypted Wrap" })).toHaveCount(0);

  await page.locator(".calendar-list__io-btn", { hasText: /import/i }).click();
  await expect(page.locator(".import-dialog__field")).toBeHidden();
  await page.locator(".import-dialog__btn--pick").click();
  await expect(page.locator(".import-dialog__status--locked")).toContainText("Krypterad fil");
  await expect(page.locator(".import-dialog__btn--primary")).toBeDisabled();

  await page.locator(".import-dialog__password-input").fill("top secret");
  await page.locator(".import-dialog__btn--unlock").click();
  await expect(page.locator(".import-dialog__status--unlocked")).toContainText("Upplåst");
  await expect(page.locator(".import-dialog__summary")).toBeVisible();

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator(".import-dialog__btn--primary").click();

  const importedCount = await page.evaluate(() => {
    return window.__ORDNING_TAURI_MOCK_STATE.events.filter((event) =>
      event.title === "Encrypted Wrap"
    ).length;
  });
  expect(importedCount).toBe(1);
});

test("importing encrypted backup enables encrypted startup on reopen", async ({ page }) => {
  await page.goto("/");

  const calendarId = await page.evaluate(async () => {
    const created = await window.__TAURI__.core.invoke("create_calendar", {
      name: "Encrypted Reopen",
      color: "#ff2d55"
    });
    return created.id;
  });

  await page.evaluate(async (selectedCalendarId) => {
    await window.__TAURI__.core.invoke("export_json", {
      mode: "full",
      calendarIds: [selectedCalendarId],
      password: "top secret"
    });
    await window.__TAURI__.core.invoke("preview_import_json", {
      strategy: "merge"
    });
    await window.__TAURI__.core.invoke("preview_import_json", {
      strategy: "merge",
      password: "top secret"
    });
    await window.__TAURI__.core.invoke("import_json", {
      strategy: "merge",
      password: "top secret"
    });
  }, calendarId);

  const encrypted = await page.evaluate(() => {
    return window.__ORDNING_TAURI_MOCK_STATE.settings.storageEncrypted;
  });
  expect(encrypted).toBe(true);

  await page.reload();
  await expect(page.locator(".unlock-screen")).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);

  await page.locator(".unlock-screen__input").fill("top secret");
  await page.locator(".unlock-screen__submit").click();
  await expect(page.locator(".unlock-screen")).toHaveCount(0);
  await expect(page.locator(".app-shell")).toBeVisible();
});
