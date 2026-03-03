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
import { createEventMutationHandlers } from "./main/event-mutations.js";
import { invoke } from "./main/invoke.js";
import { createManualSaveController } from "./main/manual-save.js";
import { createEventCopyPasteController } from "./main/event-copy-paste.js";
import { applySettings, getCurrentTimezone, initializeSettings } from "./main/settings.js";
import { renderWeekSection } from "./main/week-render.js";
import { getStartOfWeek } from "./utils/date-utils.js";
import { setupKeyboardHandler } from "./utils/keyboard-handler.js";
import { printWeek } from "./utils/print-week.js";
import { addDays, getWeekBounds, mapAllDayEvents, mapBackendEvents, parseDateKey } from "./utils/week-view-events.js";
import { purgePastEventsFlow } from "./utils/ui-actions.js";
import { getState, loadCalendars, loadWeekEvents, setCurrentWeekStart, subscribe } from "./state.js";
let unsubscribeState = null;
let keydownHandler = null;
let teardownZoomGuards = null; let teardownPinchZoom = null; let teardownCloseGuard = null; let teardownManualSave = null; let teardownCopyPaste = null;
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
  if (teardownCopyPaste) { teardownCopyPaste(); teardownCopyPaste = null; }
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
  let capturedWeekScrollTop = null;
  const refreshAndRender = async () => {
    const body = weekContainer.querySelector(".week-grid__body");
    capturedWeekScrollTop = body instanceof HTMLElement ? body.scrollTop : null;
    await Promise.all([loadCalendars(), refreshCurrentWeekEvents()]);
    capturedWeekScrollTop = null;
  };
  let pendingHighlightEvent = null;
  let activeHighlight = null;
  let currentPixelsPerHour = DEFAULT_PIXELS_PER_HOUR;
  const { clearEventSelection, highlightEventBlock } = createEventHighlightHelpers({ weekContainer, getState });
  const copyPasteController = createEventCopyPasteController({ weekContainer, invoke, refresh: refreshAndRender, t, clearEventSelection });
  teardownCopyPaste = copyPasteController.dispose;
  const currentWeekStartOrDefault = () => getState().currentWeekStart ?? getStartOfWeek(new Date(), 1);
  const navigateWeek = async (start) => { setCurrentWeekStart(start); await refreshCurrentWeekEvents(); };
  const goToPreviousWeek = () => navigateWeek(addDays(currentWeekStartOrDefault(), -7));
  const goToNextWeek = () => navigateWeek(addDays(currentWeekStartOrDefault(), 7));
  const goToToday = () => navigateWeek(getStartOfWeek(new Date(), 1));
  let saveController = null;
  const confirmDialog = createConfirmDialog();
  app.appendChild(confirmDialog.element);
  const { deleteEventById, updateTimedEventPosition } = createEventMutationHandlers({
    invoke,
    confirmDialog,
    t,
    weekContainer,
    refreshAndRender,
    refreshCurrentWeekEvents,
    setPendingHighlightEvent: (value) => {
      pendingHighlightEvent = value;
    },
    setPendingWeekViewRenderOptions: (value) => {
      pendingWeekViewRenderOptions = value;
    }
  });
  const eventModal = createEventModal({
    confirmDialog,
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
  const weekViewHandlers = {
    onEventSelect: (eventId, element) => {
      clearEventSelection();
      const scope = element.closest(".week-grid") ?? weekContainer;
      scope.querySelectorAll(`[data-event-id="${eventId}"]`).forEach((block) => {
        block.classList.add("event-block--selected");
      });
    },
    onEventClick: (eventId) => {
      eventModal.openEdit(eventId);
    },
    onEventDelete: deleteEventById,
    onEventCopy: async (eventData) => {
      await copyPasteController.copyEvent(eventData);
    },
    onEventMove: async ({ eventId, date, startDate, endDate, startTime, endTime, instanceDate = null, isVirtual = false }) => {
      await updateTimedEventPosition(
        { eventId, date, startDate, endDate, startTime, endTime, instanceDate, isVirtual },
        "move"
      );
    },
    onEventResize: async ({
      eventId,
      date,
      startDate,
      endDate,
      startTime,
      endTime,
      linkedNeighbor = null,
      instanceDate = null,
      isVirtual = false
    }) => {
      await updateTimedEventPosition(
        { eventId, date, startDate, endDate, startTime, endTime, linkedNeighbor, instanceDate, isVirtual },
        "resize"
      );
    },
    onCreateSlot: (prefill) => {
      eventModal.openCreate(prefill);
    },
    onCreateFromContextMenu: (prefill) => {
      eventModal.openCreate(prefill);
    },
    onPasteFromContextMenu: async (prefill) => {
      try {
        await copyPasteController.pasteAtPrefill(prefill);
      } catch (error) {
        window.alert(String(error));
        console.error("Failed to paste event from context menu", error);
      }
    },
    canPasteFromContextMenu: () => copyPasteController.canPaste(),
    onZoomChange: handleZoomChange
  };
  function handleZoomChange({ pixelsPerHour, preserveScrollTop }) {
    currentPixelsPerHour = pixelsPerHour;
    renderWeekSection(weekContainer, getWeekBounds(currentWeekStartOrDefault()).weekDates, { ...weekViewHandlers,
      timezone: getCurrentTimezone(), pixelsPerHour: currentPixelsPerHour, preserveScrollTop, skipAutoScroll: true });
  }
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
  let lastRenderedCalendarsJson = null;
  unsubscribeState = subscribe(() => {
    const calendars = getState().calendars;
    const weekStart = getState().currentWeekStart ?? getStartOfWeek(new Date(), 1);
    const { weekDates } = getWeekBounds(weekStart);
    const calendarsJson = JSON.stringify(calendars);
    if (calendarsJson !== lastRenderedCalendarsJson) {
      const previousCalendarGroups = sidebarList.querySelector(".calendar-list__groups");
      const previousCalendarScrollTop = previousCalendarGroups instanceof HTMLElement
        ? previousCalendarGroups.scrollTop
        : null;
      lastRenderedCalendarsJson = calendarsJson;
      sidebarList.replaceChildren(
        renderCalendarList(calendars, {
          onCreate: async ({ id, name, color, group }) => {
            if (!name) {
              return;
            }
            await invoke(id ? "update_calendar" : "create_calendar", {
              ...(id ? { id } : {}),
              name,
              color,
              group
            });
            await refreshAndRender();
          },
          onConfirmDelete: () => confirmDialog.confirm(t("calendarDeleteConfirm")),
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
    const hasExplicitOptions = weekViewRenderOptions != null;
    const weekChanged = weekContainer.dataset.renderedWeek !== String(weekDates[0]);
    const fallbackScrollTop = !hasExplicitOptions && !weekChanged
      ? capturedWeekScrollTop
      : null;
    weekContainer.dataset.renderedWeek = weekDates[0];
    const effectiveScrollTop = weekViewRenderOptions?.preserveScrollTop ?? fallbackScrollTop;
    renderWeekSection(weekContainer, weekDates, {
      ...weekViewHandlers,
      timezone: getCurrentTimezone(), pixelsPerHour: currentPixelsPerHour,
      preserveScrollTop: effectiveScrollTop,
      skipAutoScroll: Boolean(weekViewRenderOptions?.skipAutoScroll)
    });
    if (Number.isFinite(effectiveScrollTop)) {
      const newBody = weekContainer.querySelector(".week-grid__body");
      if (newBody) {
        void newBody.scrollHeight;
        newBody.scrollTop = effectiveScrollTop;
      }
    }
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
    cancelPasteMode: () => {
      copyPasteController.clear();
    },
    copySelectedEvent: () => copyPasteController.copySelectedEvent(),
    pasteCopiedEvent: () => copyPasteController.pasteAtCurrentPointer(),
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
      if (!(targetEvent instanceof HTMLElement)) {
        return null;
      }
      return {
        id: targetEvent.dataset.eventActionId ?? targetEvent.dataset.eventId ?? null,
        date: targetEvent.dataset.eventDate ?? null,
        isVirtual: targetEvent.dataset.eventIsVirtual === "true"
      };
    },
    deleteEventById,
    onDeleteError: () => {}
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
