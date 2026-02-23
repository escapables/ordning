import { getLocale, t } from "./i18n/strings.js";
import { createEventModal } from "./components/event-form/event-modal.js";
import { renderCalendarList } from "./components/sidebar/calendar-list.js";
import { renderWeekGrid } from "./components/week-view/week-grid.js";
import { formatDateKey, getEndOfWeek, getStartOfWeek, getWeekDates } from "./utils/date-utils.js";
import { getState, loadCalendars, loadWeekEvents, subscribe } from "./state.js";

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

function renderWeekSection(mainContent, weekDates, options = {}) {
  const previous = mainContent.querySelector(".week-view");
  if (previous) {
    previous.remove();
  }

  const mappedEvents = mapBackendEvents(getState().events);
  mainContent.appendChild(renderWeekGrid(weekDates, mappedEvents, options));
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
        <button type="button" class="sidebar__new-event-btn">${t("newEventButton")}</button>
        <div class="sidebar__calendar-list"></div>
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
  const sidebarList = app.querySelector(".sidebar__calendar-list");
  if (!mainContent || !sidebarList) {
    return;
  }

  const startDate = formatDateKey(start);
  const endDate = formatDateKey(end);
  const refreshWeek = async () => {
    await Promise.all([loadCalendars(), loadWeekEvents(startDate, endDate)]);
  };

  const refreshAndRender = async () => {
    await refreshWeek();
  };

  const eventModal = createEventModal({
    onPersist: refreshAndRender
  });
  app.appendChild(eventModal.element);

  const newEventButton = app.querySelector(".sidebar__new-event-btn");
  if (newEventButton) {
    newEventButton.addEventListener("click", () => {
      eventModal.openCreate();
    });
  }

  subscribe(() => {
    const calendars = getState().calendars;
    sidebarList.innerHTML = "";

    if (calendars.length === 0) {
      sidebarList.textContent = t("sidebarPlaceholder");
    } else {
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

            await invoke("delete_calendar", { id: calendar.id });
            await refreshAndRender();
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
    }

    renderWeekSection(mainContent, weekDates, {
      onEventClick: (eventId) => {
        eventModal.openEdit(eventId);
      },
      onCreateSlot: (prefill) => {
        eventModal.openCreate(prefill);
      }
    });
  });

  renderWeekSection(mainContent, weekDates, {
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
