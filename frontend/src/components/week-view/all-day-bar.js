import { formatDateKey } from "../../utils/date-utils.js";

function renderAllDayEvent(event) {
  const element = document.createElement("article");
  element.className = "all-day-event";
  element.style.backgroundColor = event.color;
  element.style.borderColor = event.color;
  element.textContent = event.title;
  return element;
}

function renderDayCell(date, events) {
  const dateKey = formatDateKey(date);
  const cell = document.createElement("div");
  cell.className = "all-day-bar__day";

  events
    .filter((event) => event.date === dateKey)
    .forEach((event) => {
      cell.appendChild(renderAllDayEvent(event));
    });

  return cell;
}

export function renderAllDayBar(dates, events = []) {
  const bar = document.createElement("div");
  bar.className = "all-day-bar";

  const label = document.createElement("div");
  label.className = "all-day-bar__label";
  label.textContent = "";
  bar.appendChild(label);

  dates.forEach((date) => {
    bar.appendChild(renderDayCell(date, events));
  });

  return bar;
}
