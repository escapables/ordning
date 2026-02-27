import { expect, test } from "./fixtures.js";

test("selecting a multi-day timed event highlights all segments", async ({ page }) => {
  await page.goto("/");

  const firstColumn = page.locator(".day-column").first();
  const secondColumn = page.locator(".day-column").nth(1);
  const firstDate = await firstColumn.getAttribute("data-date");
  const secondDate = await secondColumn.getAttribute("data-date");
  expect(firstDate).toBeTruthy();
  expect(secondDate).toBeTruthy();

  // Create a cross-midnight event spanning two day columns
  await page.evaluate(async ({ day1, day2 }) => {
    await window.__TAURI__.core.invoke("create_event", {
      event: {
        calendarId: "cal-work",
        title: "Overnight",
        startDate: day1,
        endDate: day2,
        startTime: "22:00",
        endTime: "02:00",
        allDay: false,
        descriptionPrivate: "",
        descriptionPublic: "",
        location: ""
      }
    });
  }, { day1: firstDate, day2: secondDate });
  await page.locator(".main-toolbar__today-btn", { hasText: "Idag" }).click();

  // Verify both segments exist
  const seg1 = firstColumn.locator(".event-block", { hasText: "Overnight" });
  const seg2 = secondColumn.locator(".event-block", { hasText: "Overnight" });
  await expect(seg1).toHaveCount(1);
  await expect(seg2).toHaveCount(1);

  // Click on the first segment
  await seg1.scrollIntoViewIfNeeded();
  await seg1.click();

  // Both segments should have the selected class
  await expect(seg1).toHaveClass(/event-block--selected/);
  await expect(seg2).toHaveClass(/event-block--selected/);

  // Click elsewhere to deselect
  await firstColumn.click({ position: { x: 10, y: 10 } });

  // Both segments should lose the selected class
  await expect(seg1).not.toHaveClass(/event-block--selected/);
  await expect(seg2).not.toHaveClass(/event-block--selected/);

  // Click on the second segment
  await seg2.scrollIntoViewIfNeeded();
  await seg2.click();

  // Both segments should be selected
  await expect(seg1).toHaveClass(/event-block--selected/);
  await expect(seg2).toHaveClass(/event-block--selected/);
});
