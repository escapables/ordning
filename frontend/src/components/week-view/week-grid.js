import { renderAllDayBar } from "./all-day-bar.js";
import { renderDayColumn, renderDayHeader } from "./day-column.js";
import { mountTimeIndicator } from "./time-indicator.js";
import { t } from "../../i18n/strings.js";
import { formatDateKey } from "../../utils/date-utils.js";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const PIXELS_PER_HOUR = 56;

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

export function renderWeekGrid(dates, events = [], allDayEvents = [], options = {}) {
  const {
    calendarsCount = 0,
    onEventClick = () => {},
    onCreateSlot = () => {}
  } = options;
  const root = document.createElement("section");
  root.className = "week-view";

  const eventsByDate = new Map(
    dates.map((date) => {
      const dateKey = formatDateKey(date);
      const dayEvents = events.filter((event) => event.date === dateKey);
      return [dateKey, dayEvents];
    })
  );

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
  body.appendChild(renderTimeLabels());

  dates.forEach((date) => {
    const dateKey = formatDateKey(date);
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    body.appendChild(
      renderDayColumn(date, dayEvents, PIXELS_PER_HOUR, {
        onEventClick,
        onCreateSlot
      })
    );
  });

  mountTimeIndicator(body, dates, PIXELS_PER_HOUR);

  root.appendChild(headers);
  root.appendChild(renderAllDayBar(dates, allDayEvents));
  root.appendChild(body);
  deferAutoScroll(body, dates, PIXELS_PER_HOUR);

  return root;
}
