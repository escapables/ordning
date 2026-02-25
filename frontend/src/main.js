import { t } from "./i18n/strings.js";
import { createEventModal } from "./components/event-form/event-modal.js";
import { createExportDialog } from "./components/export-dialog/export-dialog.js";
import { createImportDialog } from "./components/import-dialog/import-dialog.js";
import { renderCalendarList } from "./components/sidebar/calendar-list.js";
import { renderMiniMonth } from "./components/sidebar/mini-month.js";
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

function mapAllDayEvents(events) {
  return events.map((event) => ({
    id: event.id,
    date: event.date,
    title: event.title,
    color: event.color
  }));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function renderWeekSection(container, weekDates, options = {}) {
  const previous = container.querySelector(".week-view");
  if (previous) {
    previous.remove();
  }

  const mappedEvents = mapBackendEvents(getState().events);
  const mappedAllDayEvents = mapAllDayEvents(getState().allDayEvents);
  container.appendChild(
    renderWeekGrid(weekDates, mappedEvents, mappedAllDayEvents, {
      calendarsCount: getState().calendars.length,
      ...options
    })
  );
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

function createConfirmDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "confirm-dialog";

  const form = document.createElement("form");
  form.className = "confirm-dialog__form";
  form.method = "dialog";

  const message = document.createElement("p");
  message.className = "confirm-dialog__message";

  const actions = document.createElement("div");
  actions.className = "confirm-dialog__actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "confirm-dialog__btn";
  cancelButton.textContent = t("eventFormCancel");

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "confirm-dialog__btn confirm-dialog__btn--danger";
  confirmButton.textContent = t("eventFormDelete");

  actions.append(cancelButton, confirmButton);
  form.append(message, actions);
  dialog.appendChild(form);

  let resolver = null;

  const closeWith = (value) => {
    if (resolver) {
      resolver(value);
      resolver = null;
    }
    dialog.close();
  };

  cancelButton.addEventListener("click", () => {
    closeWith(false);
  });

  confirmButton.addEventListener("click", () => {
    closeWith(true);
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeWith(false);
  });

  dialog.addEventListener("close", () => {
    if (resolver) {
      resolver(false);
      resolver = null;
    }
  });

  const confirm = (text) =>
    new Promise((resolve) => {
      resolver = resolve;
      message.textContent = text;
      dialog.showModal();
    });

  return {
    element: dialog,
    confirm
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
        <div class="sidebar__mini-month"></div>
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
  const sidebarMiniMonth = app.querySelector(".sidebar__mini-month");
  const toolbarContainer = app.querySelector(".main-toolbar-container");
  const weekContainer = app.querySelector(".week-view-container");
  if (!sidebarList || !sidebarMiniMonth || !toolbarContainer || !weekContainer) {
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

  let pendingHighlightEventId = null;
  let activeHighlight = null;
  let isDeletingFromKeyboard = false;

  const highlightEventBlock = (eventId) => {
    const block = weekContainer.querySelector(`.event-block[data-event-id="${eventId}"]`);
    if (!(block instanceof HTMLElement)) {
      return false;
    }

    block.classList.remove("event-block--highlighted");
    // Force class re-apply when selecting the same event repeatedly.
    void block.offsetWidth;
    block.classList.add("event-block--highlighted");
    window.setTimeout(() => {
      block.classList.remove("event-block--highlighted");
    }, 1800);
    block.focus({ preventScroll: true });
    block.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
    return true;
  };

  const goToPreviousWeek = async () => {
    const weekStart = getState().currentWeekStart ?? getStartOfWeek(new Date(), 1);
    setCurrentWeekStart(addDays(weekStart, -7));
    await refreshCurrentWeekEvents();
  };

  const goToNextWeek = async () => {
    const weekStart = getState().currentWeekStart ?? getStartOfWeek(new Date(), 1);
    setCurrentWeekStart(addDays(weekStart, 7));
    await refreshCurrentWeekEvents();
  };

  const goToToday = async () => {
    setCurrentWeekStart(getStartOfWeek(new Date(), 1));
    await refreshCurrentWeekEvents();
  };

  const eventModal = createEventModal({
    onPersist: refreshAndRender,
    onEnsureCalendars: loadCalendars,
    onFocusCalendarCreate: () => {
      const openCreateDialogButton = app.querySelector(".calendar-list__add");
      if (openCreateDialogButton instanceof HTMLElement) {
        openCreateDialogButton.click();
      }
    }
  });
  app.appendChild(eventModal.element);

  const exportDialog = createExportDialog();
  app.appendChild(exportDialog.element);
  const importDialog = createImportDialog({
    onImported: refreshAndRender
  });
  app.appendChild(importDialog.element);
  const confirmDialog = createConfirmDialog();
  app.appendChild(confirmDialog.element);

  const newEventButton = app.querySelector(".sidebar__new-event-btn");
  if (newEventButton) {
    newEventButton.tabIndex = 2;
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

    sidebarMiniMonth.innerHTML = "";
    sidebarMiniMonth.appendChild(
      renderMiniMonth({
        currentWeekStart: weekStart,
        onSelectDay: async (date) => {
          setCurrentWeekStart(getStartOfWeek(date, 1));
          await refreshCurrentWeekEvents();
        }
      })
    );

    toolbarContainer.innerHTML = "";
    toolbarContainer.appendChild(
      renderToolbar({
        weekStart,
        onPreviousWeek: goToPreviousWeek,
        onNextWeek: goToNextWeek,
        onToday: goToToday,
        onExport: () => {
          exportDialog.open();
        },
        onImport: () => {
          importDialog.open();
        },
        onSearch: async (query) => {
          return invoke("search_events", { query });
        },
        onSearchSelect: async (result) => {
          if (!result?.start_date || !result?.id) {
            return;
          }

          pendingHighlightEventId = result.id;
          setCurrentWeekStart(getStartOfWeek(parseDateKey(result.start_date), 1));
          await refreshCurrentWeekEvents();
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

    if (pendingHighlightEventId && highlightEventBlock(pendingHighlightEventId)) {
      activeHighlight = {
        eventId: pendingHighlightEventId,
        expiresAt: Date.now() + 1800
      };
      pendingHighlightEventId = null;
    }

    if (activeHighlight && Date.now() < activeHighlight.expiresAt) {
      highlightEventBlock(activeHighlight.eventId);
    } else {
      activeHighlight = null;
    }
  });

  renderWeekSection(weekContainer, getWeekBounds(initialWeekStart).weekDates, {
    onEventClick: (eventId) => {
      eventModal.openEdit(eventId);
    },
    onCreateSlot: (prefill) => {
      eventModal.openCreate(prefill);
    }
  });

  document.addEventListener("keydown", async (keyboardEvent) => {
    if (keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
      return;
    }

    const targetTagName = keyboardEvent.target?.tagName?.toUpperCase();
    if (targetTagName === "INPUT" || targetTagName === "TEXTAREA" || targetTagName === "SELECT") {
      return;
    }

    const closeOpenDialogs = () => {
      const openDialogs = document.querySelectorAll("dialog[open]");
      openDialogs.forEach((dialogElement) => {
        dialogElement.close();
      });
    };

    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      closeOpenDialogs();
      return;
    }

    if (keyboardEvent.key === "ArrowLeft") {
      keyboardEvent.preventDefault();
      void goToPreviousWeek();
      return;
    }

    if (keyboardEvent.key === "ArrowRight") {
      keyboardEvent.preventDefault();
      void goToNextWeek();
      return;
    }

    if (keyboardEvent.key.toLowerCase() === "t") {
      keyboardEvent.preventDefault();
      void goToToday();
      return;
    }

    if (keyboardEvent.key.toLowerCase() === "n") {
      keyboardEvent.preventDefault();
      eventModal.openCreate();
      return;
    }

    if (keyboardEvent.key !== "Delete") {
      return;
    }

    if (keyboardEvent.repeat || isDeletingFromKeyboard) {
      return;
    }

    if (document.querySelector("dialog[open]")) {
      return;
    }

    const focusedEvent = document.activeElement;
    if (!(focusedEvent instanceof HTMLElement) || !focusedEvent.classList.contains("event-block")) {
      return;
    }

    const eventId = focusedEvent.dataset.eventId;
    if (!eventId) {
      return;
    }

    keyboardEvent.preventDefault();
    const confirmed = await confirmDialog.confirm(t("eventFormDeleteConfirm"));
    if (!confirmed) {
      return;
    }

    isDeletingFromKeyboard = true;
    try {
      await invoke("delete_event", { id: eventId });
      await refreshAndRender();
    } catch (error) {
      window.alert(String(error));
      console.error("Failed to delete event via keyboard shortcut", error);
    } finally {
      isDeletingFromKeyboard = false;
    }
  });

  await refreshAndRender();
}

renderAppShell();
