import { expect, test } from "./fixtures.js";

test("calendar groups can be set changed and cleared from the sidebar", async ({ page }) => {
  await page.goto("/");

  await page.locator(".calendar-list__add").click();
  await page.locator(".calendar-create-dialog__input:not(.calendar-create-dialog__group)").fill("Grouped");
  await page.locator(".calendar-create-dialog__group").fill("Projects");
  await page.locator(".calendar-create-dialog__btn--primary").click();

  const projectsGroup = page.locator(".calendar-list__group", {
    has: page.locator(".calendar-list__group-title", { hasText: "Projects" })
  });
  await expect(projectsGroup.locator(".calendar-list__name", { hasText: "Grouped" })).toBeVisible();

  await projectsGroup.locator(".calendar-list__edit").click();
  await expect(page.locator(".calendar-create-dialog")).toBeVisible();
  await expect(page.locator("datalist option[value='Projects']")).toHaveCount(1);
  await page.locator(".calendar-create-dialog__group").fill("Personal");
  await page.locator(".calendar-create-dialog__btn--primary").click();

  await expect(page.locator(".calendar-list__group-title", { hasText: "Projects" })).toHaveCount(0);
  const personalGroup = page.locator(".calendar-list__group", {
    has: page.locator(".calendar-list__group-title", { hasText: "Personal" })
  });
  await expect(personalGroup.locator(".calendar-list__name", { hasText: "Grouped" })).toBeVisible();

  await personalGroup.locator(".calendar-list__edit").click();
  await page.locator(".calendar-create-dialog__group").fill("");
  await page.locator(".calendar-create-dialog__btn--primary").click();

  await expect(page.locator(".calendar-list__group-title", { hasText: "Personal" })).toHaveCount(0);
  const ungrouped = page.locator(".calendar-list__group", {
    has: page.locator(".calendar-list__group-title", { hasText: "Mina kalendrar" })
  });
  await expect(ungrouped.locator(".calendar-list__name", { hasText: "Grouped" })).toBeVisible();
});
