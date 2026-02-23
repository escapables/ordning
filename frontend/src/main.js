import { getLocale, t } from "./i18n/strings.js";
import { renderWeekGrid } from "./components/week-view/week-grid.js";
import { getEndOfWeek, getStartOfWeek, getWeekDates } from "./utils/date-utils.js";

function renderAppShell() {
  const app = document.querySelector("#app");
  if (!app) {
    return;
  }

  const weekDates = getWeekDates(new Date(), 1);
  const start = getStartOfWeek(new Date(), 1);
  const end = getEndOfWeek(new Date(), 1);

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__title">${t("sidebarTitle")}</div>
        <div class="sidebar__placeholder">${t("sidebarPlaceholder")}</div>
      </aside>
      <main class="main-content">
        <div class="main-content__title">
          ${t("weekOfPrefix")} ${start.toLocaleDateString(getLocale())} - ${end.toLocaleDateString(getLocale())}
        </div>
      </main>
    </div>
  `;

  document.title = t("appName");

  const mainContent = app.querySelector(".main-content");
  if (!mainContent) {
    return;
  }

  mainContent.appendChild(renderWeekGrid(weekDates));
}

renderAppShell();
