import { t } from "./i18n/strings.js";
import { createConfirmDialog } from "./components/dialogs/confirm-dialog.js";
import { createSettingsDialog } from "./components/dialogs/settings-dialog.js";
import { createEventModal } from "./components/event-form/event-modal.js";
import { createExportDialog } from "./components/export-dialog/export-dialog.js";
import { createImportDialog } from "./components/import-dialog/import-dialog.js";
import { renderCalendarList } from "./components/sidebar/calendar-list.js";
import { renderMiniMonth } from "./components/sidebar/mini-month.js";
import { renderToolbar } from "./components/toolbar/toolbar.js";
import { DEFAULT_PIXELS_PER_HOUR, installPinchZoom, installZoomGuards } from "./components/week-view/week-zoom.js";
import { installCloseGuard } from "./main/close-guard.js";
import { createEventHighlightHelpers } from "./main/event-highlight.js";
import { invoke } from "./main/invoke.js";
import { createManualSaveController } from "./main/manual-save.js";
import { applySettings, getCurrentTimezone, initializeSettings } from "./main/settings.js";
import { renderWeekSection } from "./main/week-render.js";
import { getStartOfWeek } from "./utils/date-utils.js";
import { setupKeyboardHandler } from "./utils/keyboard-handler.js";
import { printWeek } from "./utils/print-week.js";
import { addDays, getWeekBounds, mapAllDayEvents, mapBackendEvents, parseDateKey } from "./utils/week-view-events.js";
import { copyEventToClipboard, getCopiedEventData, pasteCopiedEventAtSlot, purgePastEventsFlow } from "./utils/ui-actions.js";
import { getState, loadCalendars, loadWeekEvents, setCurrentWeekStart, subscribe } from "./state.js";
let unsubscribeState = null;
let keydownHandler = null;
let teardownZoomGuards = null;
let teardownPinchZoom = null;
let teardownCloseGuard = null;
let teardownManualSave = null;
let pendingWeekViewRenderOptions = null;
async function renderAppShell() {
  if (unsubscribeState) {
    unsubscribeState();
    unsubscribeState = null;
  }
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }
  if (teardownPinchZoom) {
    teardownPinchZoom();
    teardownPinchZoom = null;
  }
  if (teardownZoomGuards) {
    teardownZoomGuards();
    teardownZoomGuards = null;
  }
  if (teardownCloseGuard) {
    teardownCloseGuard();
    teardownCloseGuard = null;
  }
  if (teardownManualSave) {
    teardownManualSave();
    teardownManualSave = null;
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
        <div class="sidebar__header">
          <button type="button" class="sidebar__new-event-btn">${t("newEventButton")}</button>
          <button type="button" class="sidebar__settings-btn" aria-label="${t("settingsButtonAria")}">&#9881;</button>
        </div>
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
  const settingsButton = app.querySelector(".sidebar__settings-btn");
  const toolbarContainer = app.querySelector(".main-toolbar-container");
  const weekContainer = app.querySelector(".week-view-container");
  if (!sidebarList || !sidebarMiniMonth || !settingsButton || !toolbarContainer || !weekContainer) {
    return;
  }
  const refreshCurrentWeekEvents = async () => {
    const { startDate, endDate } = getWeekBounds(getState().currentWeekStart ?? getStartOfWeek(new Date(), 1));
    await loadWeekEvents(startDate, endDate);
  };
  const refreshAndRender = async () => { await Promise.all([loadCalendars(), refreshCurrentWeekEvents()]); };
  let pendingHighlightEvent = null;
  let activeHighlight = null;
  let currentPixelsPerHour = DEFAULT_PIXELS_PER_HOUR;
  const { clearEventSelection, highlightEventBlock } = createEventHighlightHelpers({ weekContainer, getState });
  const currentWeekStartOrDefault = () => getState().currentWeekStart ?? getStartOfWeek(new Date(), 1);
  const navigateWeek = async (start) => { setCurrentWeekStart(start); await refreshCurrentWeekEvents(); };
  const goToPreviousWeek = () => navigateWeek(addDays(currentWeekStartOrDefault(), -7));
  const goToNextWeek = () => navigateWeek(addDays(currentWeekStartOrDefault(), 7));
  const goToToday = () => navigateWeek(getStartOfWeek(new Date(), 1));
  let saveController = null;
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
  const exportDialog = createExportDialog({
    onPrint: () => {
      const { weekDates } = getWeekBounds(currentWeekStartOrDefault());
      printWeek({
        weekDates,
        events: mapBackendEvents(getState().events),
        allDayEvents: mapAllDayEvents(getState().allDayEvents)
      });
    }
  });
  app.appendChild(exportDialog.element);
  const importDialog = createImportDialog({
    onImported: refreshAndRender
  });
  app.appendChild(importDialog.element);
  const confirmDialog = createConfirmDialog();
  app.appendChild(confirmDialog.element);
  teardownCloseGuard = await installCloseGuard({
    invoke,
    t,
    choose: confirmDialog.choose,
    onDiscard: refreshAndRender
  });
  const settingsDialog = createSettingsDialog({
    getTimezone: getCurrentTimezone,
    onChangeSettings: async (nextSettings) => {
      await applySettings({ invoke, nextSettings, onApplied: renderAppShell });
    }
  });
  app.appendChild(settingsDialog.element);
  settingsButton.addEventListener("click", () => {
    settingsDialog.open();
  });
  const renderToolbarSection = (weekStart) => {
    toolbarContainer.innerHTML = "";
    toolbarContainer.appendChild(
      renderToolbar({
        weekStart,
        onPreviousWeek: goToPreviousWeek,
        onNextWeek: goToNextWeek,
        onToday: goToToday,
        ...saveController?.getToolbarProps(),
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
  };
  saveController = createManualSaveController({
    invoke,
    onChange: () => {
      renderToolbarSection(currentWeekStartOrDefault());
    }
  });
  teardownManualSave = saveController.dispose;
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
        await pasteCopiedEventAtSlot({ invoke, refresh: refreshAndRender, date: prefill.date, startTime: prefill.startTime });
      } catch (error) {
        window.alert(String(error));
        console.error("Failed to paste event from context menu", error);
      }
    },
    canPasteFromContextMenu: () => Boolean(getCopiedEventData()?.id),
    onZoomChange: handleZoomChange
  };
  function handleZoomChange({ pixelsPerHour, preserveScrollTop }) {
    currentPixelsPerHour = pixelsPerHour;
    renderWeekSection(weekContainer, getWeekBounds(currentWeekStartOrDefault()).weekDates, { ...weekViewHandlers,
      timezone: getCurrentTimezone(), pixelsPerHour: currentPixelsPerHour, preserveScrollTop, skipAutoScroll: true });
  }
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
    const previousCalendarGroups = sidebarList.querySelector(".calendar-list__groups");
    const previousCalendarScrollTop = previousCalendarGroups instanceof HTMLElement
      ? previousCalendarGroups.scrollTop
      : null;
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
    const nextCalendarGroups = sidebarList.querySelector(".calendar-list__groups");
    if (nextCalendarGroups instanceof HTMLElement && previousCalendarScrollTop !== null) {
      nextCalendarGroups.scrollTop = previousCalendarScrollTop;
    }
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
    renderToolbarSection(weekStart);
    const weekViewRenderOptions = pendingWeekViewRenderOptions;
    if (pendingWeekViewRenderOptions?.remainingRenders > 1) {
      pendingWeekViewRenderOptions.remainingRenders -= 1;
    } else {
      pendingWeekViewRenderOptions = null;
    }
    renderWeekSection(weekContainer, weekDates, {
      ...weekViewHandlers,
      timezone: getCurrentTimezone(), pixelsPerHour: currentPixelsPerHour,
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
    void saveController.sync();
  });
  renderWeekSection(
    weekContainer,
    getWeekBounds(initialWeekStart).weekDates,
    { ...weekViewHandlers, timezone: getCurrentTimezone(), pixelsPerHour: currentPixelsPerHour }
  );
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
  teardownZoomGuards = installZoomGuards();
  teardownPinchZoom = installPinchZoom({
    getBody: () => weekContainer.querySelector(".week-grid__body"),
    getPixelsPerHour: () => currentPixelsPerHour,
    onZoomChange: handleZoomChange
  });
  await refreshAndRender();
  await saveController.sync();
}
async function bootstrap() {
  await initializeSettings({ invoke });
  await renderAppShell();
}
bootstrap();
