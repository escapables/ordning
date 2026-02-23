import { tDayShort } from "../../i18n/strings.js";
import { formatMonthDay } from "../../utils/date-utils.js";

const HOURS_PER_DAY = 24;

export function renderDayHeader(date) {
  const header = document.createElement("div");
  header.className = "day-header";
  header.innerHTML = `
    <div class="day-header__name">${tDayShort(date.getDay())}</div>
    <div class="day-header__date">${formatMonthDay(date)}</div>
  `;
  return header;
}

export function renderDayColumn(date) {
  const column = document.createElement("div");
  column.className = "day-column";
  column.dataset.date = date.toISOString().slice(0, 10);

  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    const cell = document.createElement("div");
    cell.className = "day-column__hour";
    column.appendChild(cell);
  }

  return column;
}
