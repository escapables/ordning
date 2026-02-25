import path from "node:path";

import { test as base, expect } from "@playwright/test";

const tauriMockPath = path.resolve(process.cwd(), "frontend/test/tauri-mock.js");

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript({ path: tauriMockPath });
    await use(page);
  }
});

export { expect };
