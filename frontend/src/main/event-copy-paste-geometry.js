import {
  eventDurationMinutes,
  MINUTES_PER_HOUR,
  TIME_STEP_MINUTES,
  formatTimeFromMinutes,
  pointerToMinutes,
  resolveColumnFromPoint,
  roundNearest
} from "../components/week-view/drag-time-utils.js";

const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;

export function resolvePixelsPerHour(column) {
  const root = column.closest(".week-view") ?? column;
  const rawValue = window.getComputedStyle(root).getPropertyValue("--hour-row-height");
  const parsedValue = Number.parseFloat(rawValue);
  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  const fallbackValue = column.getBoundingClientRect().height / HOURS_PER_DAY;
  return Number.isFinite(fallbackValue) && fallbackValue > 0 ? fallbackValue : 56;
}

export function resolveSlotFromPoint(weekContainer, clientX, clientY) {
  const column = resolveColumnFromPoint(clientX, clientY);
  if (!(column instanceof HTMLElement) || !weekContainer.contains(column)) {
    return null;
  }

  const date = column.dataset.date;
  if (!date) {
    return null;
  }

  const rect = column.getBoundingClientRect();
  const pixelsPerHour = resolvePixelsPerHour(column);
  const rawMinutes = pointerToMinutes(clientY, rect, pixelsPerHour);
  const startMinutes = Math.max(
    0,
    Math.min(roundNearest(rawMinutes, TIME_STEP_MINUTES), MINUTES_PER_DAY - TIME_STEP_MINUTES)
  );

  return {
    column,
    date,
    startMinutes,
    startTime: formatTimeFromMinutes(startMinutes)
  };
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return "";
  }

  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

export function resolveCopyAnchorOffset(sourceEvent, sourceElement = null) {
  if (sourceElement instanceof HTMLElement) {
    const startMinutes = Number.parseFloat(sourceElement.dataset.startMinutes ?? "");
    const endMinutes = Number.parseFloat(sourceElement.dataset.endMinutes ?? "");
    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
      return roundNearest((endMinutes - startMinutes) / 2, TIME_STEP_MINUTES);
    }
  }

  return roundNearest(eventDurationMinutes(sourceEvent) / 2, TIME_STEP_MINUTES);
}

export function applyAnchorOffset(slot, anchorOffsetMinutes) {
  if (!slot || !Number.isFinite(anchorOffsetMinutes) || anchorOffsetMinutes <= 0) {
    return slot;
  }

  let startMinutes = slot.startMinutes - anchorOffsetMinutes;
  let dayOffset = 0;

  while (startMinutes < 0) {
    startMinutes += MINUTES_PER_DAY;
    dayOffset -= 1;
  }

  while (startMinutes >= MINUTES_PER_DAY) {
    startMinutes -= MINUTES_PER_DAY;
    dayOffset += 1;
  }

  const date = dayOffset === 0 ? slot.date : addDaysToDateKey(slot.date, dayOffset);
  if (!date) {
    return slot;
  }

  return {
    ...slot,
    date,
    startMinutes,
    startTime: formatTimeFromMinutes(startMinutes)
  };
}
