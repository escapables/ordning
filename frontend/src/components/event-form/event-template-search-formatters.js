import { t } from "../../i18n/strings.js";
import { getState } from "../../state.js";

export const SEARCH_DEBOUNCE_MS = 300;
export const MIN_QUERY_LENGTH = 2;
export const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_EVENT_COLOR = "#007aff";

function parseDateKey(dateKey) {
  if (!dateKey || typeof dateKey !== "string") {
    return null;
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseTimeToMinutes(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const [hours, minutes] = raw.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return (hours * 60) + minutes;
}

export function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addDaysToDateKey(dateKey, dayCount) {
  const base = parseDateKey(dateKey) ?? new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + dayCount);
  return formatDateKey(next);
}

export function getCalendarColor(calendarId) {
  return (
    getState().calendars.find((calendar) => calendar.id === calendarId)?.color
    ?? DEFAULT_EVENT_COLOR
  );
}

function getCalendarName(calendarId) {
  return getState().calendars.find((calendar) => calendar.id === calendarId)?.name ?? "";
}

export function getTemplateTiming(result, templateEvent) {
  const startDateKey = result?.start_date ?? templateEvent?.startDate ?? templateEvent?.start_date;
  const endDateKey = result?.end_date ?? templateEvent?.endDate ?? templateEvent?.end_date ?? startDateKey;
  const startTime = result?.start_time ?? templateEvent?.startTime ?? templateEvent?.start_time ?? null;
  const endTime = result?.end_time ?? templateEvent?.endTime ?? templateEvent?.end_time ?? null;
  const explicitAllDay = result?.all_day ?? templateEvent?.allDay ?? templateEvent?.all_day;
  const allDay = Boolean(explicitAllDay ?? (!startTime || !endTime));

  if (allDay) {
    const startDate = parseDateKey(startDateKey);
    const endDate = parseDateKey(endDateKey) ?? startDate;
    const spanMs = startDate && endDate ? endDate.getTime() - startDate.getTime() : 0;
    const daySpan = Math.max(1, Math.round(spanMs / 86400000) + 1);
    return { allDay: true, daySpan };
  }

  const dayOffset = (() => {
    const startDate = parseDateKey(startDateKey);
    const endDate = parseDateKey(endDateKey);
    if (!startDate || !endDate) {
      return 0;
    }
    return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
  })();
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return { allDay: false, durationMinutes: 60 };
  }

  let durationMinutes = (dayOffset * MINUTES_PER_DAY) + (endMinutes - startMinutes);
  if (durationMinutes <= 0) {
    durationMinutes += MINUTES_PER_DAY;
  }

  return { allDay: false, durationMinutes: Math.max(1, durationMinutes) };
}

function formatTimeLabel(result) {
  const timing = getTemplateTiming(result);
  const startTime = result?.start_time;
  const endTime = result?.end_time;

  if (timing.allDay) {
    if (timing.daySpan <= 1) {
      return t("eventFormTemplateAllDay");
    }

    return t("eventFormTemplateDays").replace("{count}", String(timing.daySpan));
  }

  if (startTime && endTime) {
    return `${startTime}-${endTime}`;
  }

  return `${timing.durationMinutes}m`;
}

export function formatResultSubtitle(result) {
  const parts = [getCalendarName(result?.calendar_id), formatTimeLabel(result)];

  if (result?.location) {
    parts.push(result.location);
  }

  if (result?.description_public) {
    parts.push(result.description_public);
  }

  return parts.filter(Boolean).join(" • ");
}

function buildGroupKey(result) {
  return [
    result?.calendar_id ?? "",
    String(result?.title ?? "").trim().toLowerCase(),
    String(result?.description_public ?? "").trim().toLowerCase()
  ].join("\u241f");
}

export function collapseResults(results) {
  const grouped = new Map();

  (Array.isArray(results) ? results : []).forEach((result) => {
    const key = buildGroupKey(result);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...result });
      return;
    }

    if (!existing.location && result?.location) {
      existing.location = result.location;
    }
  });

  return Array.from(grouped.values());
}
