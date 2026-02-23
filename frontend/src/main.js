import { getLocale, t } from "./i18n/strings.js";
import { renderWeekGrid } from "./components/week-view/week-grid.js";
import { formatDateKey, getEndOfWeek, getStartOfWeek, getWeekDates } from "./utils/date-utils.js";
import { getState, loadCalendars, loadWeekEvents, subscribe } from "./state.js";

function mapBackendEvents(events) {
  return events.map((event) => ({
    id: event.id,
    date: event.date,
    startTime: event.start_time,
    endTime: event.end_time,
    title: event.title,
    color: event.color
  }));
}

function renderWeekSection(mainContent, weekDates) {
  const previous = mainContent.querySelector(".week-view");
  if (previous) {
    previous.remove();
  }

  const mappedEvents = mapBackendEvents(getState().events);
  mainContent.appendChild(renderWeekGrid(weekDates, mappedEvents));
}

async function renderAppShell() {
  const app = document.querySelector("#app");
  if (!app) {
    return;
  }

  const now = new Date();
  const weekDates = getWeekDates(now, 1);
  const start = getStartOfWeek(now, 1);
  const end = getEndOfWeek(now, 1);

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

  subscribe(() => {
    renderWeekSection(mainContent, weekDates);
  });

  renderWeekSection(mainContent, weekDates);

  const startDate = formatDateKey(start);
  const endDate = formatDateKey(end);
  await Promise.all([loadCalendars(), loadWeekEvents(startDate, endDate)]);
}

renderAppShell();
