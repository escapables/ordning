import { t } from "./i18n/strings.js";
import { createEventModal } from "./components/event-form/event-modal.js";
import { createExportDialog } from "./components/export-dialog/export-dialog.js";
import { createImportDialog } from "./components/import-dialog/import-dialog.js";
import { renderCalendarList } from "./components/sidebar/calendar-list.js";
import { renderToolbar } from "./components/toolbar/toolbar.js";
import { renderWeekGrid } from "./components/week-view/week-grid.js";
import { formatDateKey, getEndOfWeek, getStartOfWeek, getWeekDates } from "./utils/date-utils.js";
import {
  getState,
  loadCalendars,
  loadWeekEvents,
  setCurrentWeekStart,
  subscribe
} from "./state.js";

function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }
  return invokeFn(command, payload);
}

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

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function renderWeekSection(container, weekDates, options = {}) {
  const previous = container.querySelector(".week-view");
  if (previous) {
    previous.remove();
  }

  const mappedEvents = mapBackendEvents(getState().events);
  container.appendChild(renderWeekGrid(weekDates, mappedEvents, options));
}

function getWeekBounds(weekStart) {
  const start = getStartOfWeek(weekStart, 1);
  const end = getEndOfWeek(weekStart, 1);
  return {
    start,
    end,
    startDate: formatDateKey(start),
    endDate: formatDateKey(end),
    weekDates: getWeekDates(start, 1)
  };
}

async function renderAppShell() {
  const app = document.querySelector("#app");
  if (!app) {
    return;
  }

  const now = new Date();
  const initialWeekStart = getStartOfWeek(now, 1);
  setCurrentWeekStart(initialWeekStart);

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__title">${t("sidebarTitle")}</div>
        <button type="button" class="sidebar__new-event-btn">${t("newEventButton")}</button>
        <div class="sidebar__calendar-list"></div>
      </aside>
      <main class="main-content">
        <div class="main-toolbar-container"></div>
        <div class="week-view-container"></div>
      </main>
    </div>
  `;

  document.title = t("appName");

  const sidebarList = app.querySelector(".sidebar__calendar-list");
  const toolbarContainer = app.querySelector(".main-toolbar-container");
  const weekContainer = app.querySelector(".week-view-container");
  if (!sidebarList || !toolbarContainer || !weekContainer) {
    return;
  }

  const refreshCurrentWeekEvents = async () => {
    const weekStart = getState().currentWeekStart ?? getStartOfWeek(new Date(), 1);
    const { startDate, endDate } = getWeekBounds(weekStart);
    await loadWeekEvents(startDate, endDate);
  };

  const refreshAndRender = async () => {
    await Promise.all([loadCalendars(), refreshCurrentWeekEvents()]);
  };

  const eventModal = createEventModal({
    onPersist: refreshAndRender,
    onEnsureCalendars: loadCalendars
  });
  app.appendChild(eventModal.element);

  const exportDialog = createExportDialog();
  app.appendChild(exportDialog.element);
  const importDialog = createImportDialog({
    onImported: refreshAndRender
  });
  app.appendChild(importDialog.element);

  const newEventButton = app.querySelector(".sidebar__new-event-btn");
  if (newEventButton) {
    newEventButton.addEventListener("click", () => {
      eventModal.openCreate();
    });
  }

  subscribe(() => {
    const calendars = getState().calendars;
    const weekStart = getState().currentWeekStart ?? getStartOfWeek(new Date(), 1);
    const { weekDates } = getWeekBounds(weekStart);

    sidebarList.innerHTML = "";
    sidebarList.appendChild(
      renderCalendarList(calendars, {
        onCreate: async ({ name, color }) => {
          if (!name) {
            return;
          }

          await invoke("create_calendar", {
            name,
            color
          });
          await refreshAndRender();
        },
        onDelete: async (calendar) => {
          const confirmed = window.confirm(t("calendarDeleteConfirm"));
          if (!confirmed) {
            return;
          }
          try {
            await invoke("delete_calendar", { id: calendar.id });
            await refreshAndRender();
          } catch (error) {
            window.alert(t("calendarDeleteError"));
            console.error("Failed to delete calendar", error);
          }
        },
        onToggleVisibility: async (calendarId) => {
          try {
            await invoke("toggle_visibility", { id: calendarId });
            await refreshAndRender();
          } catch (error) {
            window.alert(t("calendarVisibilityError"));
            console.error("Failed to toggle calendar visibility", error);
          }
        }
      })
    );

    toolbarContainer.innerHTML = "";
    toolbarContainer.appendChild(
      renderToolbar({
        weekStart,
        onPreviousWeek: async () => {
          setCurrentWeekStart(addDays(weekStart, -7));
          await refreshCurrentWeekEvents();
        },
        onNextWeek: async () => {
          setCurrentWeekStart(addDays(weekStart, 7));
          await refreshCurrentWeekEvents();
        },
        onToday: async () => {
          setCurrentWeekStart(getStartOfWeek(new Date(), 1));
          await refreshCurrentWeekEvents();
        },
        onExport: () => {
          exportDialog.open();
        },
        onImport: () => {
          importDialog.open();
        }
      })
    );

    renderWeekSection(weekContainer, weekDates, {
      onEventClick: (eventId) => {
        eventModal.openEdit(eventId);
      },
      onCreateSlot: (prefill) => {
        eventModal.openCreate(prefill);
      }
    });
  });

  renderWeekSection(weekContainer, getWeekBounds(initialWeekStart).weekDates, {
    onEventClick: (eventId) => {
      eventModal.openEdit(eventId);
    },
    onCreateSlot: (prefill) => {
      eventModal.openCreate(prefill);
    }
  });
  await refreshAndRender();
}

renderAppShell();
