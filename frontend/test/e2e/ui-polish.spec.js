import { expect, test } from "./fixtures.js";

test("toolbar week title keeps same-month month on second date only", async ({ page }) => {
  await page.goto("/");

  const titles = await page.evaluate(async () => {
    const { setLang } = await import("/src/i18n/strings.js");
    const { renderToolbar } = await import("/src/components/toolbar/toolbar.js");
    setLang("sv");
    const sameMonth = renderToolbar({ weekStart: new Date(2026, 2, 2) })
      .querySelector(".main-toolbar__title")?.textContent ?? "";
    const crossMonth = renderToolbar({ weekStart: new Date(2026, 1, 23) })
      .querySelector(".main-toolbar__title")?.textContent ?? "";
    return { sameMonth, crossMonth };
  });

  expect(titles.sameMonth).toContain("2 - 8 mars");
  expect(titles.sameMonth).not.toContain("2 mars - 8");
  expect(titles.crossMonth).toContain("23 feb");
  expect(titles.crossMonth).toContain("1 mars");
  expect(titles.crossMonth).not.toContain("23 - 1 mars");
});

test("sidebar footer stays pinned while the window resizes", async ({ page }) => {
  await page.goto("/");

  const readLayout = async () => page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar");
    const groups = document.querySelector(".calendar-list__groups");
    const ioRow = document.querySelector(".calendar-list__io");
    const purge = document.querySelector(".calendar-list__purge");
    if (!(sidebar instanceof HTMLElement) || !(groups instanceof HTMLElement)
      || !(ioRow instanceof HTMLElement) || !(purge instanceof HTMLElement)) {
      return null;
    }
    const sidebarRect = sidebar.getBoundingClientRect();
    const groupsRect = groups.getBoundingClientRect();
    const ioRowRect = ioRow.getBoundingClientRect();
    const purgeRect = purge.getBoundingClientRect();
    return {
      footerGap: sidebarRect.bottom - purgeRect.bottom,
      stackGap: ioRowRect.top - groupsRect.bottom,
      sidebarOverflowY: window.getComputedStyle(sidebar).overflowY,
      groupsOverflowY: window.getComputedStyle(groups).overflowY
    };
  });

  const initial = await readLayout();
  expect(initial).not.toBeNull();
  expect(initial.sidebarOverflowY).toBe("hidden");
  expect(initial.groupsOverflowY).toBe("auto");
  expect(initial.footerGap).toBeLessThanOrEqual(24);
  expect(initial.stackGap).toBeGreaterThanOrEqual(0);

  await page.setViewportSize({ width: 1100, height: 560 });

  const resized = await readLayout();
  expect(resized).not.toBeNull();
  expect(resized.footerGap).toBeLessThanOrEqual(24);
  expect(resized.stackGap).toBeGreaterThanOrEqual(0);
});
