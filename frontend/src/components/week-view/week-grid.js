import { renderDayColumn, renderDayHeader } from "./day-column.js";
import { mountTimeIndicator } from "./time-indicator.js";
import { formatDateKey } from "../../utils/date-utils.js";

const HOURS_PER_DAY = 24;
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

export function renderWeekGrid(dates, events = [], options = {}) {
  const { onEventClick = () => {} } = options;
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

  const body = document.createElement("div");
  body.className = "week-grid__body";
  body.appendChild(renderTimeLabels());

  dates.forEach((date) => {
    const dateKey = formatDateKey(date);
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    body.appendChild(renderDayColumn(date, dayEvents, PIXELS_PER_HOUR, { onEventClick }));
  });

  mountTimeIndicator(body, dates, PIXELS_PER_HOUR);

  root.appendChild(headers);
  root.appendChild(body);

  return root;
}
