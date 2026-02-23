import { renderDayColumn, renderDayHeader } from "./day-column.js";
import { mountTimeIndicator } from "./time-indicator.js";
import { formatDateKey } from "../../utils/date-utils.js";

const HOURS_PER_DAY = 24;
const PIXELS_PER_HOUR = 56;

const FAKE_EVENTS = [
  { id: "evt-1", dayOffset: 0, startTime: "09:00", endTime: "10:30", title: "Standup", color: "#007aff" },
  { id: "evt-2", dayOffset: 1, startTime: "10:00", endTime: "11:30", title: "Design Review", color: "#34c759" },
  { id: "evt-3", dayOffset: 1, startTime: "10:30", endTime: "12:00", title: "Client Call", color: "#ff9500" },
  { id: "evt-4", dayOffset: 3, startTime: "14:00", endTime: "16:00", title: "Planning", color: "#5856d6" }
];

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

export function renderWeekGrid(dates) {
  const root = document.createElement("section");
  root.className = "week-view";

  const eventsByDate = new Map(
    dates.map((date, index) => {
      const dateKey = formatDateKey(date);
      const dayEvents = FAKE_EVENTS
        .filter((event) => event.dayOffset === index)
        .map((event) => ({ ...event, date: dateKey }));
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
    body.appendChild(renderDayColumn(date, dayEvents, PIXELS_PER_HOUR));
  });

  mountTimeIndicator(body, dates, PIXELS_PER_HOUR);

  root.appendChild(headers);
  root.appendChild(body);

  return root;
}
