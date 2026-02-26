import { setLang, t } from "./i18n/strings.js";
import { createConfirmDialog } from "./components/dialogs/confirm-dialog.js";
import { createSettingsDialog } from "./components/dialogs/settings-dialog.js";
import { createEventModal } from "./components/event-form/event-modal.js";
import { createExportDialog } from "./components/export-dialog/export-dialog.js";
import { createImportDialog } from "./components/import-dialog/import-dialog.js";
import { renderCalendarList } from "./components/sidebar/calendar-list.js";
import { renderMiniMonth } from "./components/sidebar/mini-month.js";
import { renderToolbar } from "./components/toolbar/toolbar.js";
import { renderWeekGrid } from "./components/week-view/week-grid.js";
import { formatDateKey, getEndOfWeek, getStartOfWeek, getWeekDates } from "./utils/date-utils.js";
import { setupKeyboardHandler } from "./utils/keyboard-handler.js";
import { copyEventToClipboard, getCopiedEventData, pasteCopiedEventAtSlot, purgePastEventsFlow } from "./utils/ui-actions.js";
import { getState, loadCalendars, loadWeekEvents, setCurrentWeekStart, subscribe } from "./state.js";

let unsubscribeState = null;
let keydownHandler = null;

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

async function initializeLanguage() {
  try {
    const settings = await invoke("get_settings");
    setLang(settings?.lang);
  } catch (error) {
    console.error("Failed to load settings", error);
  }
}

async function applyLanguage(nextLang) {
  setLang(nextLang);
  try {
    await invoke("set_settings", {
      settings: { lang: nextLang }
    });
  } catch (error) {
    console.error("Failed to persist settings", error);
  }
  await renderAppShell();
}

async function renderAppShell() {
  if (unsubscribeState) {
    unsubscribeState();
    unsubscribeState = null;
  }
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }

  const app = document.querySelector("#app");
  if (!app) {
    return;
  }

  const now = new Date();
  const initialWeekStart = getState().currentWeekStart ?? getStartOfWeek(now, 1);
  setCurrentWeekStart(initialWeekStart);

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <button type="button" class="sidebar__new-event-btn">${t("newEventButton")}</button>
        <div class="sidebar__mini-month"></div>
        <div class="sidebar__calendar-list"></div>
        <button type="button" class="sidebar__settings-btn" aria-label="${t("settingsButtonAria")}">&#9881;</button>
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
  const settingsButton = app.querySelector(".sidebar__settings-btn");
  const toolbarContainer = app.querySelector(".main-toolbar-container");
  const weekContainer = app.querySelector(".week-view-container");
  if (!sidebarList || !sidebarMiniMonth || !settingsButton || !toolbarContainer || !weekContainer) {
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
  const clearEventSelection = ({ blurFocusedEvent = false } = {}) => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement.classList.contains("event-block") &&
      (blurFocusedEvent || activeElement.classList.contains("event-block--selected"))
    ) {
      activeElement.blur();
    }

    weekContainer.querySelectorAll(".event-block--selected").forEach((block) => {
      block.classList.remove("event-block--selected");
    });
  };

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

  const deleteEventById = async (eventId) => {
    const confirmed = await confirmDialog.confirm(t("eventFormDeleteConfirm"));
    if (!confirmed) {
      return false;
    }

    await invoke("delete_event", { id: eventId });
    await refreshAndRender();
    return true;
  };

  const eventModal = createEventModal({
    onPersist: refreshAndRender,
    onEnsureCalendars: loadCalendars,
    onDelete: deleteEventById,
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
  const settingsDialog = createSettingsDialog({
    onChangeLang: applyLanguage
  });
  app.appendChild(settingsDialog.element);
  settingsButton.addEventListener("click", () => {
    settingsDialog.open();
  });

  const weekViewHandlers = {
    onEventSelect: (_eventId, element) => {
      clearEventSelection();
      element.classList.add("event-block--selected");
    },
    onEventClick: (eventId) => {
      eventModal.openEdit(eventId);
    },
    onEventDelete: async (eventId) => {
      try {
        await deleteEventById(eventId);
      } catch (error) {
        window.alert(String(error));
        console.error("Failed to delete event via context menu", error);
      }
    },
    onEventCopy: async (eventData) => {
      await copyEventToClipboard(eventData, t);
    },
    onCreateSlot: (prefill) => {
      eventModal.openCreate(prefill);
    },
    onCreateFromContextMenu: (prefill) => {
      eventModal.openCreate(prefill);
    },
    onPasteFromContextMenu: async (prefill) => {
      try {
        await pasteCopiedEventAtSlot({
          invoke,
          refresh: refreshAndRender,
          date: prefill.date,
          startTime: prefill.startTime
        });
      } catch (error) {
        window.alert(String(error));
        console.error("Failed to paste event from context menu", error);
      }
    },
    canPasteFromContextMenu: () => {
      return Boolean(getCopiedEventData()?.id);
    }
  };

  weekContainer.addEventListener("click", (clickEvent) => {
    const target = clickEvent.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest(".event-block")) {
      return;
    }
    if (target.closest(".day-column")) {
      clearEventSelection();
    }
  });

  app.addEventListener(
    "contextmenu",
    (contextMenuEvent) => {
      const target = contextMenuEvent.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(".context-menu")) {
        return;
      }

      if (target.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      if (target.closest(".day-column")) {
        return;
      }

      contextMenuEvent.preventDefault();
    },
    true
  );

  const newEventButton = app.querySelector(".sidebar__new-event-btn");
  if (newEventButton) {
    newEventButton.tabIndex = 2;
    newEventButton.addEventListener("click", () => {
      eventModal.openCreate();
    });
  }

  unsubscribeState = subscribe(() => {
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
        },
        onExport: () => {
          exportDialog.open();
        },
        onImport: () => {
          importDialog.open();
        },
        onPurgePast: async () => {
          try {
            await purgePastEventsFlow({
              invoke,
              confirm: confirmDialog.confirm,
              refresh: refreshAndRender,
              t
            });
          } catch (error) {
            window.alert(t("purgePastError"));
            console.error("Failed to purge past events", error);
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

    renderWeekSection(weekContainer, weekDates, weekViewHandlers);

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

  renderWeekSection(weekContainer, getWeekBounds(initialWeekStart).weekDates, weekViewHandlers);

  keydownHandler = setupKeyboardHandler({
    closeOpenDialogs: () => {
      document.querySelectorAll("dialog[open]").forEach((dialogElement) => {
        dialogElement.close();
      });
    },
    clearEventSelection: () => {
      clearEventSelection({ blurFocusedEvent: true });
    },
    goToPreviousWeek,
    goToNextWeek,
    goToToday,
    openCreateEvent: () => {
      eventModal.openCreate();
    },
    hasOpenDialog: () => Boolean(document.querySelector("dialog[open]")),
    getDeleteEventId: () => {
      const focusedEvent = document.activeElement;
      const selectedEvent = weekContainer.querySelector(".event-block--selected");
      const targetEvent =
        focusedEvent instanceof HTMLElement && focusedEvent.classList.contains("event-block")
          ? focusedEvent
          : selectedEvent instanceof HTMLElement
            ? selectedEvent
            : null;
      return targetEvent?.dataset.eventId ?? null;
    },
    deleteEventById,
    onDeleteError: (error) => {
      window.alert(String(error));
      console.error("Failed to delete event via keyboard shortcut", error);
    }
  });
  document.addEventListener("keydown", keydownHandler);

  await refreshAndRender();
}

async function bootstrap() {
  await initializeLanguage();
  await renderAppShell();
}

bootstrap();
