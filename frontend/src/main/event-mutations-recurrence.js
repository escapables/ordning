function parseDateKey(value) {
  const [year, month, day] = String(value ?? "").split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDaysToDateKey(value, days) {
  const parsed = parseDateKey(value);
  if (!(parsed instanceof Date)) {
    return String(value ?? "");
  }

  parsed.setDate(parsed.getDate() + days);
  return formatDateKey(parsed);
}

function dateKeyDayBefore(value) {
  return addDaysToDateKey(value, -1);
}

function weekdayKey(value) {
  const parsed = parseDateKey(value);
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  if (!(parsed instanceof Date)) {
    return "mon";
  }
  return keys[parsed.getDay()] ?? "mon";
}

function weekOfMonth(value) {
  const parsed = parseDateKey(value);
  if (!(parsed instanceof Date)) {
    return 1;
  }
  return Math.min(5, Math.floor((parsed.getDate() - 1) / 7) + 1);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function hasOwn(overrides, key) {
  return Object.prototype.hasOwnProperty.call(overrides, key);
}

export function toRecurrenceInput(rule) {
  if (!rule) {
    return null;
  }

  const endCondition = rule.end_condition ?? { type: "never" };
  const endConditionType = endCondition.type === "after_count"
    ? "after_count"
    : (endCondition.type === "until_date" ? "until_date" : "never");

  return {
    frequency: rule.frequency === "monthly" ? "monthly" : "weekly",
    interval: clampInteger(rule.interval, 1, 1, 52),
    daysOfWeek: Array.isArray(rule.days_of_week) ? [...rule.days_of_week] : [],
    endConditionType,
    endConditionCount: endConditionType === "after_count"
      ? clampInteger(endCondition.count, 1, 1, 999)
      : null,
    endConditionUntilDate: endConditionType === "until_date"
      ? endCondition.until_date ?? null
      : null,
    exceptionDates: Array.isArray(rule.exception_dates)
      ? Array.from(new Set(rule.exception_dates))
      : [],
    weekOfMonth: rule.week_of_month ?? null,
    dayOfWeek: rule.day_of_week ?? null
  };
}

export function buildEventInput(existing, overrides = {}) {
  return {
    calendarId: hasOwn(overrides, "calendarId") ? overrides.calendarId : existing.calendarId,
    title: hasOwn(overrides, "title") ? overrides.title : (existing.title ?? ""),
    startDate: hasOwn(overrides, "startDate") ? overrides.startDate : existing.startDate,
    endDate: hasOwn(overrides, "endDate") ? overrides.endDate : (existing.endDate ?? existing.startDate),
    startTime: hasOwn(overrides, "startTime") ? overrides.startTime : (existing.startTime ?? null),
    endTime: hasOwn(overrides, "endTime") ? overrides.endTime : (existing.endTime ?? null),
    allDay: hasOwn(overrides, "allDay") ? Boolean(overrides.allDay) : Boolean(existing.allDay),
    descriptionPrivate: hasOwn(overrides, "descriptionPrivate")
      ? overrides.descriptionPrivate
      : (existing.descriptionPrivate ?? ""),
    descriptionPublic: hasOwn(overrides, "descriptionPublic")
      ? overrides.descriptionPublic
      : (existing.descriptionPublic ?? ""),
    location: hasOwn(overrides, "location") ? overrides.location : (existing.location ?? ""),
    recurrence: hasOwn(overrides, "recurrence")
      ? overrides.recurrence
      : toRecurrenceInput(existing.recurrence),
    recurrenceParentId: hasOwn(overrides, "recurrenceParentId")
      ? overrides.recurrenceParentId
      : (existing.recurrenceParentId ?? null)
  };
}

export function appendExceptionDate(recurrence, dateKey) {
  if (!recurrence) {
    return null;
  }

  const nextDates = Array.from(new Set([...(recurrence.exceptionDates ?? []), dateKey]));
  return {
    ...recurrence,
    exceptionDates: nextDates
  };
}

export function truncateRecurringSeries(recurrence, dateKey) {
  if (!recurrence) {
    return null;
  }

  return {
    ...recurrence,
    endConditionType: "until_date",
    endConditionCount: null,
    endConditionUntilDate: dateKeyDayBefore(dateKey)
  };
}

export function adjustRecurringRuleForDate(recurrence, fromDateKey, toDateKey) {
  if (!recurrence || !fromDateKey || !toDateKey || fromDateKey === toDateKey) {
    return recurrence;
  }

  if (recurrence.frequency === "monthly") {
    return {
      ...recurrence,
      weekOfMonth: weekOfMonth(toDateKey),
      dayOfWeek: weekdayKey(toDateKey)
    };
  }

  const previousDay = weekdayKey(fromDateKey);
  const nextDay = weekdayKey(toDateKey);
  const existingDays = Array.isArray(recurrence.daysOfWeek) && recurrence.daysOfWeek.length > 0
    ? [...recurrence.daysOfWeek]
    : [previousDay];
  let replaced = false;
  const shiftedDays = existingDays.map((day) => {
    if (!replaced && day === previousDay) {
      replaced = true;
      return nextDay;
    }
    return day;
  });

  if (!replaced) {
    shiftedDays.push(nextDay);
  }

  return {
    ...recurrence,
    daysOfWeek: Array.from(new Set(shiftedDays))
  };
}
