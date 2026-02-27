import { MINUTES_PER_DAY, MINUTES_PER_HOUR, eventDurationMinutes } from "./drag-time-utils.js";

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

export function formatClockMinutes(value) {
  const normalized = ((Math.floor(value) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hoursPart = Math.floor(normalized / MINUTES_PER_HOUR);
  const minutesPart = normalized % MINUTES_PER_HOUR;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
}

export function buildTimedPayload({ eventId, date, startMinutes, endMinutes }) {
  const overflowDays = Math.floor(endMinutes / MINUTES_PER_DAY);
  return {
    eventId,
    startDate: date,
    endDate: addDaysToDateKey(date, overflowDays),
    startTime: formatClockMinutes(startMinutes),
    endTime: formatClockMinutes(endMinutes)
  };
}

export function buildResizePayload({ eventId, date, startMinutes, endMinutes, anchorDate, clockStart, clockEnd, eventEndDate }) {
  if (anchorDate && date !== anchorDate) {
    const overflowDays = Math.floor(endMinutes / MINUTES_PER_DAY);
    return {
      eventId,
      startDate: anchorDate,
      endDate: addDaysToDateKey(date, overflowDays),
      startTime: clockStart ?? formatClockMinutes(startMinutes),
      endTime: formatClockMinutes(endMinutes)
    };
  }
  if (eventEndDate && eventEndDate !== date && endMinutes === MINUTES_PER_DAY) {
    return {
      eventId,
      startDate: date,
      endDate: eventEndDate,
      startTime: formatClockMinutes(startMinutes),
      endTime: clockEnd ?? formatClockMinutes(endMinutes)
    };
  }
  return buildTimedPayload({ eventId, date, startMinutes, endMinutes });
}

function isCrossMidnightClock(startClock, endClock) {
  const parsedStart = parseClockMinutes(startClock);
  const parsedEnd = parseClockMinutes(endClock);
  return parsedStart !== null && parsedEnd !== null && parsedEnd < parsedStart;
}

function parseClockMinutes(value) {
  const [hours, minutes] = String(value ?? "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return (hours * MINUTES_PER_HOUR) + minutes;
}

export function resolveAbsoluteEndMinutes(block, fallbackEndMinutes) {
  const parsedStart = parseClockMinutes(block.dataset.clockStart ?? "");
  const parsedEnd = parseClockMinutes(block.dataset.clockEnd ?? "");
  if (parsedStart === null || parsedEnd === null) {
    return fallbackEndMinutes;
  }

  if (parsedEnd < parsedStart && fallbackEndMinutes === MINUTES_PER_DAY) {
    return parsedEnd + MINUTES_PER_DAY;
  }

  return fallbackEndMinutes;
}

export function resolveDraggedEndMinutes(event, fallbackEndMinutes, startMinutes) {
  if (
    fallbackEndMinutes === MINUTES_PER_DAY
    && startMinutes > 0
    && isCrossMidnightClock(event.startTime, event.endTime)
  ) {
    return startMinutes + eventDurationMinutes(event);
  }
  return fallbackEndMinutes;
}
