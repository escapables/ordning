import path from "node:path";

import { test as base, expect } from "@playwright/test";

const tauriMockPath = path.resolve(process.cwd(), "frontend/test/tauri-mock.js");
const tauriCalendarGroupMockPath = path.resolve(process.cwd(), "frontend/test/tauri-calendar-group-mock.js");
const tauriPersistenceMockPath = path.resolve(process.cwd(), "frontend/test/tauri-persistence-mock.js");
const tauriImportExportMockPath = path.resolve(process.cwd(), "frontend/test/tauri-import-export-mock.js");
const tauriWeekSpanMockPath = path.resolve(process.cwd(), "frontend/test/tauri-week-span-mock.js");

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript({ path: tauriMockPath });
    await page.addInitScript({ path: tauriCalendarGroupMockPath });
    await page.addInitScript({ path: tauriPersistenceMockPath });
    await page.addInitScript({ path: tauriImportExportMockPath });
    await page.addInitScript({ path: tauriWeekSpanMockPath });
    await use(page);
  }
});

export { expect };
