import { tDayShort } from "../../i18n/strings.js";
import { formatDateKey, formatMonthDay } from "../../utils/date-utils.js";
import { renderEventBlocks } from "./event-block.js";

const HOURS_PER_DAY = 24;

function isToday(date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function renderDayHeader(date) {
  const header = document.createElement("div");
  header.className = "day-header";
  if (isToday(date)) {
    header.classList.add("day-header--today");
  }

  const dayName = document.createElement("div");
  dayName.className = "day-header__name";
  dayName.textContent = tDayShort(date.getDay());

  const dayDate = document.createElement("div");
  dayDate.className = "day-header__date";
  dayDate.textContent = formatMonthDay(date);

  header.appendChild(dayName);
  header.appendChild(dayDate);

  return header;
}

export function renderDayColumn(date, events, pixelsPerHour) {
  const column = document.createElement("div");
  column.className = "day-column";
  column.dataset.date = formatDateKey(date);

  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    const cell = document.createElement("div");
    cell.className = "day-column__hour";
    column.appendChild(cell);
  }

  column.appendChild(renderEventBlocks(events, pixelsPerHour));

  return column;
}
