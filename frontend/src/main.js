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
import { getStartOfWeek } from "./utils/date-utils.js";
import { setupKeyboardHandler } from "./utils/keyboard-handler.js";
import { printWeek } from "./utils/print-week.js";
import { addDays, getWeekBounds, mapAllDayEvents, mapBackendEvents, parseDateKey, scrollWeekBodyToEventStart } from "./utils/week-view-events.js";
import { copyEventToClipboard, getCopiedEventData, pasteCopiedEventAtSlot, purgePastEventsFlow } from "./utils/ui-actions.js";
import { getState, loadCalendars, loadWeekEvents, setCurrentWeekStart, subscribe } from "./state.js";
let unsubscribeState = null;
let keydownHandler = null;
let currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
let pendingWeekViewRenderOptions = null;
function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }
  return invokeFn(command, payload);
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
async function initializeSettings() {
  try {
    const settings = await invoke("get_settings");
    setLang(settings?.lang);
    currentTimezone = settings?.timezone ?? currentTimezone;
  } catch (error) {
    console.error("Failed to load settings", error);
  }
}
async function applySettings(nextSettings) {
  try {
    const persisted = await invoke("set_settings", { settings: nextSettings });
    setLang(persisted?.lang ?? nextSettings.lang);
    currentTimezone = persisted?.timezone ?? nextSettings.timezone ?? currentTimezone;
  } catch (error) {
    console.error("Failed to persist settings", error);
    return;
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
  let pendingHighlightEvent = null;
  let activeHighlight = null;
  const clearEventSelection = ({ blurFocusedEvent = false } = {}) => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      (activeElement.classList.contains("event-block") || activeElement.classList.contains("all-day-event")) &&
      (blurFocusedEvent || activeElement.classList.contains("event-block--selected"))
    ) {
      activeElement.blur();
    }
    weekContainer.querySelectorAll(".event-block--selected").forEach((block) => {
      block.classList.remove("event-block--selected");
    });
  };
  const highlightEventBlock = ({ eventId, skipScroll = false } = {}) => {
    if (!eventId) {
      return false;
    }
    const block = weekContainer.querySelector(
      `.event-block[data-event-id="${eventId}"], .all-day-event[data-event-id="${eventId}"]`
    );
    if (!(block instanceof HTMLElement)) {
      return false;
    }
    const stateSnapshot = getState();
    const targetEvent = stateSnapshot.events.find((event) => event.id === eventId)
      ?? stateSnapshot.allDayEvents.find((event) => event.id === eventId);
    if (!skipScroll) {
      scrollWeekBodyToEventStart(weekContainer, targetEvent);
    }
    block.classList.remove("event-block--highlighted");
    // Force class re-apply when selecting the same event repeatedly.
    void block.offsetWidth;
    block.classList.add("event-block--highlighted");
    window.setTimeout(() => {
      block.classList.remove("event-block--highlighted");
    }, 1800);
    block.focus({ preventScroll: true });
    if (!skipScroll) {
      block.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
    }
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
    getTimezone: () => currentTimezone,
    onChangeSettings: applySettings
  });
  app.appendChild(settingsDialog.element);
  settingsButton.addEventListener("click", () => {
    settingsDialog.open();
  });
  async function updateTimedEventPosition({ eventId, date, startDate, endDate, startTime, endTime, linkedNeighbor }, actionName) {
    try {
      const weekBody = weekContainer.querySelector(".week-grid__body");
      pendingWeekViewRenderOptions = {
        preserveScrollTop: weekBody instanceof HTMLElement ? weekBody.scrollTop : null,
        skipAutoScroll: true,
        remainingRenders: 2
      };
      const updates = [{ eventId, date, startDate, endDate, startTime, endTime }];
      if (linkedNeighbor?.eventId) {
        updates.push(linkedNeighbor);
      }
      for (const update of updates) {
        const existing = await invoke("get_event", { id: update.eventId });
        if (!existing?.calendarId) {
          pendingWeekViewRenderOptions = null;
          return;
        }
        await invoke("update_event", {
          id: update.eventId,
          event: {
            calendarId: existing.calendarId,
            title: existing.title ?? "",
            startDate: update.startDate ?? update.date,
            endDate: update.endDate ?? update.date,
            startTime: update.startTime,
            endTime: update.endTime,
            allDay: false,
            descriptionPrivate: existing.descriptionPrivate ?? "",
            descriptionPublic: existing.descriptionPublic ?? "",
            location: existing.location ?? ""
          }
        });
      }
      pendingHighlightEvent = { eventId, skipScroll: true };
      await refreshCurrentWeekEvents();
    } catch (error) {
      pendingWeekViewRenderOptions = null;
      window.alert(String(error));
      console.error(`Failed to ${actionName} event`, error);
    }
  }
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
    onEventMove: async ({ eventId, date, startDate, endDate, startTime, endTime }) => {
      await updateTimedEventPosition({ eventId, date, startDate, endDate, startTime, endTime }, "move");
    },
    onEventResize: async ({ eventId, date, startDate, endDate, startTime, endTime, linkedNeighbor = null }) => {
      await updateTimedEventPosition({ eventId, date, startDate, endDate, startTime, endTime, linkedNeighbor }, "resize");
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
    if (target.closest(".event-block") || target.closest(".all-day-event")) {
      return;
    }
    if (target.closest(".day-column") || target.closest(".all-day-bar__day")) {
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
      if (target.closest(".day-column") || target.closest(".all-day-event")) {
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
        onPrint: () => {
          printWeek({
            weekDates,
            events: mapBackendEvents(getState().events),
            allDayEvents: mapAllDayEvents(getState().allDayEvents)
          });
        },
        onSearch: async (query) => {
          return invoke("search_events", { query });
        },
        onSearchSelect: async (result) => {
          if (!result?.start_date || !result?.id) {
            return;
          }
          pendingHighlightEvent = { eventId: result.id, skipScroll: false };
          setCurrentWeekStart(getStartOfWeek(parseDateKey(result.start_date), 1));
          await refreshCurrentWeekEvents();
        }
      })
    );
    const weekViewRenderOptions = pendingWeekViewRenderOptions;
    if (pendingWeekViewRenderOptions?.remainingRenders > 1) {
      pendingWeekViewRenderOptions.remainingRenders -= 1;
    } else {
      pendingWeekViewRenderOptions = null;
    }
    renderWeekSection(weekContainer, weekDates, {
      ...weekViewHandlers,
      timezone: currentTimezone,
      preserveScrollTop: weekViewRenderOptions?.preserveScrollTop,
      skipAutoScroll: Boolean(weekViewRenderOptions?.skipAutoScroll)
    });
    if (pendingHighlightEvent && highlightEventBlock(pendingHighlightEvent)) {
      activeHighlight = {
        eventId: pendingHighlightEvent.eventId,
        skipScroll: pendingHighlightEvent.skipScroll,
        expiresAt: Date.now() + 1800
      };
      pendingHighlightEvent = null;
    }
    if (activeHighlight && Date.now() < activeHighlight.expiresAt) {
      highlightEventBlock(activeHighlight);
    } else {
      activeHighlight = null;
    }
  });
  renderWeekSection(weekContainer, getWeekBounds(initialWeekStart).weekDates, {
    ...weekViewHandlers,
    timezone: currentTimezone
  });
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
        focusedEvent instanceof HTMLElement
          && (focusedEvent.classList.contains("event-block") || focusedEvent.classList.contains("all-day-event"))
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
  await initializeSettings();
  await renderAppShell();
}
bootstrap();
