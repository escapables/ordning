export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
export const MIN_SELECTION_MINUTES = 15;
export const DRAG_THRESHOLD_PX = 3;
export const TIME_STEP_MINUTES = 15;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function roundNearest(value, step) {
  return Math.round(value / step) * step;
}

export function parseTimeToMinutes(timeValue) {
  const [hours, minutes] = String(timeValue ?? "00:00").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return clamp((hours * MINUTES_PER_HOUR) + minutes, 0, MINUTES_PER_DAY);
}

export function formatTimeFromMinutes(value) {
  const minutes = clamp(value, 0, MINUTES_PER_DAY - MIN_SELECTION_MINUTES);
  const hoursPart = Math.floor(minutes / MINUTES_PER_HOUR);
  const minutesPart = minutes % MINUTES_PER_HOUR;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
}

export function pointerToMinutes(clientY, rect, pixelsPerHour) {
  const maxHeight = 24 * pixelsPerHour;
  const y = clamp(clientY - rect.top, 0, maxHeight);
  return clamp((y / pixelsPerHour) * MINUTES_PER_HOUR, 0, MINUTES_PER_DAY);
}

export function eventDurationMinutes(event) {
  const start = parseTimeToMinutes(event.startTime);
  const end = parseTimeToMinutes(event.endTime);
  if (end > start) {
    return end - start;
  }
  return (MINUTES_PER_DAY - start) + end;
}

export function clampStartForDuration(startMinutes, durationMinutes) {
  const safeDuration = clamp(durationMinutes, MIN_SELECTION_MINUTES, MINUTES_PER_DAY);
  return clamp(startMinutes, 0, MINUTES_PER_DAY - safeDuration);
}

export function readEventBlockRange(block) {
  const startMinutes = Number.parseFloat(block.dataset.startMinutes ?? "");
  const endMinutes = Number.parseFloat(block.dataset.endMinutes ?? "");
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return null;
  }
  return {
    startMinutes,
    endMinutes
  };
}

export function resolveColumnFromPoint(clientX, clientY) {
  const pointed = document.elementFromPoint(clientX, clientY);
  if (!(pointed instanceof Element)) {
    return null;
  }
  const column = pointed.closest(".day-column");
  return column instanceof HTMLElement ? column : null;
}
