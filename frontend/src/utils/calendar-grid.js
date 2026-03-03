import { getLocale } from "../i18n/strings.js";
import { getStartOfWeek } from "./date-utils.js";

export function monthLabel(date) {
  return new Intl.DateTimeFormat(getLocale(), {
    month: "long",
    year: "numeric"
  }).format(date);
}

export function getMonthDays(displayedMonth) {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const start = getStartOfWeek(firstOfMonth, 1);

  const cells = [];
  const cursor = new Date(start);
  while (cells.length < 42) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    cells,
    monthStart: firstOfMonth,
    monthEnd: lastOfMonth
  };
}

export function isSameDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}
