import { renderAllDayBar } from "./all-day-bar.js";
import { renderDayColumn, renderDayHeader } from "./day-column.js";
import { mountTimeIndicator } from "./time-indicator.js";
import { mountOffscreenIndicators } from "./offscreen-indicators.js";
import { attachWeekZoom, clampPixelsPerHour, DEFAULT_PIXELS_PER_HOUR } from "./week-zoom.js";
import { t } from "../../i18n/strings.js";
import { formatDateKey } from "../../utils/date-utils.js";
import { buildDayTimedSegments } from "../../utils/event-segments.js";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

function renderTimeLabel(hour) {
  const label = document.createElement("div");
  label.className = "time-label";
  label.textContent = `${String(hour).padStart(2, "0")}:00`;
  return label;
}

function renderTimeLabels() {
  const labels = document.createElement("div");
  labels.className = "time-labels";

  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    labels.appendChild(renderTimeLabel(hour));
  }

  return labels;
}

function isToday(date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function autoScrollToCurrentTime(body, dates, pixelsPerHour) {
  const hasToday = dates.some((date) => isToday(date));
  if (!hasToday) {
    body.scrollTop = 0;
    return;
  }

  const now = new Date();
  const minutesSinceMidnight = now.getHours() * MINUTES_PER_HOUR + now.getMinutes();
  const indicatorTop = (minutesSinceMidnight / MINUTES_PER_HOUR) * pixelsPerHour;
  const viewportOffset = body.clientHeight * 0.35;
  const requestedScrollTop = Math.max(0, indicatorTop - viewportOffset);
  const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
  body.scrollTop = Math.min(requestedScrollTop, maxScrollTop);
}

function restoreScrollTop(body, scrollTop) {
  const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
  const nextScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
  body.scrollTop = nextScrollTop;
  body.dataset.requestedScrollTop = String(nextScrollTop);
}

function deferAutoScroll(body, dates, pixelsPerHour) {
  let attempts = 0;

  function tryScroll() {
    if (body.isConnected) {
      autoScrollToCurrentTime(body, dates, pixelsPerHour);
      return;
    }

    if (attempts >= 5) {
      return;
    }

    attempts += 1;
    requestAnimationFrame(tryScroll);
  }

  requestAnimationFrame(tryScroll);
}

function deferRestoreScrollTop(body, scrollTop) {
  let attempts = 0;
  let previousMaxScrollTop = -1;

  function tryRestore() {
    if (body.isConnected) {
      const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
      restoreScrollTop(body, scrollTop);
      const wasClamped = scrollTop > maxScrollTop + 1;
      const maxScrollTopGrowing = maxScrollTop > previousMaxScrollTop + 1;
      previousMaxScrollTop = maxScrollTop;
      if (wasClamped && maxScrollTopGrowing && attempts < 5) {
        attempts += 1;
        requestAnimationFrame(tryRestore);
      }
      return;
    }

    if (attempts >= 5) {
      return;
    }

    attempts += 1;
    requestAnimationFrame(tryRestore);
  }

  requestAnimationFrame(tryRestore);
}

export function renderWeekGrid(dates, events = [], allDayEvents = [], options = {}) {
  const {
    calendarsCount = 0,
    onEventSelect = () => {},
    onEventClick = () => {},
    onEventDelete = () => {},
    onEventCopy = () => {},
    onEventMove = async () => {},
    onEventResize = async () => {},
    onCreateSlot = () => {},
    onCreateFromContextMenu = () => {},
    onPasteFromContextMenu = () => {},
    canPasteFromContextMenu = () => false,
    getSelectedEventTargets = () => [],
    onMultiDelete = async () => {},
    timezone = "UTC",
    preserveScrollTop = null,
    skipAutoScroll = false,
    pixelsPerHour: requestedPixelsPerHour = DEFAULT_PIXELS_PER_HOUR,
    onZoomChange = () => {}
  } = options;
  const pixelsPerHour = clampPixelsPerHour(requestedPixelsPerHour);
  const root = document.createElement("section");
  root.className = "week-view";
  root.style.setProperty("--hour-row-height", `${pixelsPerHour}px`);

  const eventsByDate = buildDayTimedSegments(dates, events);

  const headers = document.createElement("div");
  headers.className = "week-grid__headers";

  const corner = document.createElement("div");
  corner.className = "week-grid__header-corner";
  headers.appendChild(corner);

  dates.forEach((date) => {
    headers.appendChild(renderDayHeader(date));
  });

  const showZeroCalendarState = calendarsCount === 0 && events.length === 0 && allDayEvents.length === 0;
  if (showZeroCalendarState) {
    const emptyState = document.createElement("div");
    emptyState.className = "week-grid__empty";

    const title = document.createElement("p");
    title.className = "week-grid__empty-title";
    title.textContent = t("weekGridNoCalendarsTitle");

    const hint = document.createElement("p");
    hint.className = "week-grid__empty-hint";
    hint.textContent = t("weekGridNoCalendarsHint");

    emptyState.append(title, hint);
    root.appendChild(headers);
    root.appendChild(emptyState);
    return root;
  }

  const body = document.createElement("div");
  body.className = "week-grid__body";
  if (Number.isFinite(preserveScrollTop)) {
    body.dataset.requestedScrollTop = String(preserveScrollTop);
  }
  body.appendChild(renderTimeLabels());

  dates.forEach((date) => {
    const dateKey = formatDateKey(date);
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    body.appendChild(
      renderDayColumn(date, dayEvents, pixelsPerHour, {
        onEventSelect,
        onEventClick,
        onEventDelete,
        onEventCopy,
        onEventMove,
        onEventResize,
        onCreateSlot,
        onCreateFromContextMenu,
        onPasteFromContextMenu,
        canPasteFromContextMenu,
        getSelectedEventTargets,
        onMultiDelete
      })
    );
  });

  mountTimeIndicator(body, dates, pixelsPerHour, timezone);

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "week-grid__body-wrap";
  bodyWrap.appendChild(body);

  root.appendChild(headers);
  if (allDayEvents.length > 0) {
    root.appendChild(
      renderAllDayBar(dates, allDayEvents, {
        onEventSelect,
        onEventClick,
        onEventDelete,
        onEventCopy,
        getSelectedEventTargets,
        onMultiDelete
      })
    );
  }
  root.appendChild(bodyWrap);
  mountOffscreenIndicators(bodyWrap, body);

  attachWeekZoom(body, pixelsPerHour, onZoomChange);

  if (Number.isFinite(preserveScrollTop)) {
    deferRestoreScrollTop(body, preserveScrollTop);
  } else if (!skipAutoScroll) {
    deferAutoScroll(body, dates, pixelsPerHour);
  }

  return root;
}
