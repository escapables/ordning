const DAYS_IN_WEEK = 7;

import { getLocale } from "../i18n/strings.js";

export function getStartOfWeek(date = new Date(), weekStartsOn = 1) {
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);

  const day = current.getDay();
  const diff = (day - weekStartsOn + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  current.setDate(current.getDate() - diff);

  return current;
}

export function getEndOfWeek(date = new Date(), weekStartsOn = 1) {
  const start = getStartOfWeek(date, weekStartsOn);
  const end = new Date(start);
  end.setDate(start.getDate() + (DAYS_IN_WEEK - 1));
  return end;
}

export function getWeekDates(date = new Date(), weekStartsOn = 1) {
  const start = getStartOfWeek(date, weekStartsOn);

  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function formatMonthDay(date) {
  return new Intl.DateTimeFormat(getLocale(), {
    month: "numeric",
    day: "numeric"
  }).format(date);
}
