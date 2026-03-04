import { DEFAULT_PIXELS_PER_HOUR, installPinchZoom, installZoomGuards } from "../components/week-view/week-zoom.js";
import { getStartOfWeek } from "../utils/date-utils.js";
import { addDays, getWeekBounds, parseDateKey } from "../utils/week-view-events.js";
import { getState, loadCalendars, loadWeekEvents, setCurrentWeekStart, subscribe } from "../state.js";

import { createEventHighlightHelpers } from "./event-highlight.js";
import { getCurrentTimezone } from "./settings.js";
import { renderWeekSection } from "./week-render.js";

function getCurrentWeekStartOrDefault() {
  return getState().currentWeekStart ?? getStartOfWeek(new Date(), 1);
}

export function createWeekViewController(options = {}) {
  const {
    weekContainer,
    appSession,
    copyPasteController,
    onOpenEvent = () => {},
    onOpenCreateEvent = () => {},
    onDeleteEvent = async () => {},
    onDeleteMultipleEvents = async () => {},
    onUpdateTimedEventPosition = async () => {},
    onRenderState = () => {},
    onAfterStateRender = () => {}
  } = options;

  let capturedWeekScrollTop = null;
  let pendingHighlightEvent = null;
  let activeHighlight = null;
  let currentPixelsPerHour = DEFAULT_PIXELS_PER_HOUR;

  const { clearEventSelection, highlightEventBlock } = createEventHighlightHelpers({
    weekContainer,
    getState
  });

  const getSelectedEventTargets = () => {
    const seen = new Set();
    const targets = [];

    weekContainer.querySelectorAll(".event-block--selected").forEach((block) => {
      if (!(block instanceof HTMLElement)) {
        return;
      }
      const id = block.dataset.eventActionId ?? block.dataset.eventId;
      if (!id || seen.has(id)) {
        return;
      }
      seen.add(id);
      targets.push({
        id,
        date: block.dataset.eventDate ?? null,
        isVirtual: block.dataset.eventIsVirtual === "true"
      });
    });

    return targets;
  };

  const getDeleteEventTarget = () => {
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
  };

  const refreshCurrentWeekEvents = async () => {
    const { startDate, endDate } = getWeekBounds(getCurrentWeekStartOrDefault());
    await loadWeekEvents(startDate, endDate);
  };

  const refreshAndRender = async () => {
    const body = weekContainer.querySelector(".week-grid__body");
    capturedWeekScrollTop = body instanceof HTMLElement ? body.scrollTop : null;
    await Promise.all([loadCalendars(), refreshCurrentWeekEvents()]);
    capturedWeekScrollTop = null;
  };

  const navigateWeek = async (start) => {
    setCurrentWeekStart(start);
    await refreshCurrentWeekEvents();
  };

  const goToPreviousWeek = () => navigateWeek(addDays(getCurrentWeekStartOrDefault(), -7));
  const goToNextWeek = () => navigateWeek(addDays(getCurrentWeekStartOrDefault(), 7));
  const goToToday = () => navigateWeek(getStartOfWeek(new Date(), 1));
  const goToDate = (date) => navigateWeek(getStartOfWeek(date, 1));

  let handleZoomChange = () => {};

  const weekViewHandlers = {
    onEventSelect: (eventId, element, { ctrlKey = false } = {}) => {
      if (ctrlKey) {
        const scope = element.closest(".week-grid") ?? weekContainer;
        const segments = scope.querySelectorAll(`[data-event-id="${eventId}"]`);
        const alreadySelected = [...segments].every((segment) => segment.classList.contains("event-block--selected"));
        segments.forEach((block) => {
          block.classList.toggle("event-block--selected", !alreadySelected);
        });
        return;
      }

      clearEventSelection();
      const scope = element.closest(".week-grid") ?? weekContainer;
      scope.querySelectorAll(`[data-event-id="${eventId}"]`).forEach((block) => {
        block.classList.add("event-block--selected");
      });
    },
    onEventClick: (eventId, context) => {
      onOpenEvent(eventId, context);
    },
    onEventDelete: onDeleteEvent,
    onEventCopy: async (eventData) => {
      await copyPasteController.copyEvent(eventData);
    },
    onEventMove: async ({ eventId, date, startDate, endDate, startTime, endTime, instanceDate = null, isVirtual = false }) => {
      await onUpdateTimedEventPosition(
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
      await onUpdateTimedEventPosition(
        { eventId, date, startDate, endDate, startTime, endTime, linkedNeighbor, instanceDate, isVirtual },
        "resize"
      );
    },
    onCreateSlot: (prefill) => {
      onOpenCreateEvent(prefill);
    },
    onCreateFromContextMenu: (prefill) => {
      onOpenCreateEvent(prefill);
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
    getSelectedEventTargets,
    onMultiDelete: onDeleteMultipleEvents,
    onZoomChange: (...args) => handleZoomChange(...args)
  };

  const renderCurrentWeek = (weekDates) => {
    const weekViewRenderOptions = appSession.consumePendingWeekViewRenderOptions();
    const hasExplicitOptions = weekViewRenderOptions != null;
    const weekChanged = weekContainer.dataset.renderedWeek !== String(weekDates[0]);
    const fallbackScrollTop = !hasExplicitOptions && !weekChanged
      ? capturedWeekScrollTop
      : null;

    weekContainer.dataset.renderedWeek = weekDates[0];
    const effectiveScrollTop = weekViewRenderOptions?.preserveScrollTop ?? fallbackScrollTop;

    renderWeekSection(weekContainer, weekDates, {
      ...weekViewHandlers,
      timezone: getCurrentTimezone(),
      pixelsPerHour: currentPixelsPerHour,
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
      return;
    }

    activeHighlight = null;
  };

  handleZoomChange = ({ pixelsPerHour, preserveScrollTop }) => {
    currentPixelsPerHour = pixelsPerHour;
    renderWeekSection(weekContainer, getWeekBounds(getCurrentWeekStartOrDefault()).weekDates, {
      ...weekViewHandlers,
      timezone: getCurrentTimezone(),
      pixelsPerHour: currentPixelsPerHour,
      preserveScrollTop,
      skipAutoScroll: true
    });
  };

  const start = () => {
    renderWeekSection(
      weekContainer,
      getWeekBounds(getCurrentWeekStartOrDefault()).weekDates,
      {
        ...weekViewHandlers,
        timezone: getCurrentTimezone(),
        pixelsPerHour: currentPixelsPerHour
      }
    );

    appSession.setUnsubscribeState(subscribe(() => {
      const calendars = getState().calendars;
      const weekStart = getCurrentWeekStartOrDefault();
      const { weekDates } = getWeekBounds(weekStart);

      onRenderState({ calendars, weekStart, weekDates, refreshCurrentWeekEvents });
      renderCurrentWeek(weekDates);
      void onAfterStateRender();
    }));

    appSession.setTeardown("zoomGuards", installZoomGuards());
    appSession.setTeardown("pinchZoom", installPinchZoom({
      getBody: () => weekContainer.querySelector(".week-grid__body"),
      getPixelsPerHour: () => currentPixelsPerHour,
      onZoomChange: handleZoomChange
    }));
  };

  const focusSearchResult = async (result) => {
    if (!result?.id || !result?.start_date) {
      return;
    }
    pendingHighlightEvent = { eventId: result.id, skipScroll: false };
    setCurrentWeekStart(getStartOfWeek(parseDateKey(result.start_date), 1));
    await refreshCurrentWeekEvents();
  };

  return {
    cancelPasteMode: () => copyPasteController.clear(),
    clearSelection: (options) => clearEventSelection(options),
    copySelectedEvent: () => copyPasteController.copySelectedEvent(),
    focusSearchResult,
    getCurrentWeekStart: () => getCurrentWeekStartOrDefault(),
    getDeleteEventTarget,
    getSelectedEventTargets,
    goToDate,
    goToNextWeek,
    goToPreviousWeek,
    goToToday,
    pasteAtCurrentPointer: () => copyPasteController.pasteAtCurrentPointer(),
    refreshAndRender,
    refreshCurrentWeekEvents,
    setPendingHighlightEvent: (value) => {
      pendingHighlightEvent = value;
    },
    start
  };
}
