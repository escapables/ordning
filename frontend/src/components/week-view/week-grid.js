import { renderDayColumn, renderDayHeader } from "./day-column.js";

const HOURS_PER_DAY = 24;

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
    body.appendChild(renderDayColumn(date));
  });

  root.appendChild(headers);
  root.appendChild(body);

  return root;
}
