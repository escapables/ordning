import { formatDateKey, getEndOfWeek, getStartOfWeek, getWeekDates } from "./date-utils.js";

const MINUTES_PER_HOUR = 60;

export function mapBackendEvents(events) {
  return events.map((event) => ({
    id: event.id,
    actionId: event.source_id ?? event.id,
    isVirtual: Boolean(event.is_virtual),
    date: event.date,
    startDate: event.start_date ?? event.date,
    endDate: event.end_date ?? event.date,
    startTime: event.start_time,
    endTime: event.end_time,
    title: event.title,
    color: event.color
  }));
}

export function mapAllDayEvents(events) {
  return events.map((event) => ({
    id: event.id,
    actionId: event.source_id ?? event.id,
    isVirtual: Boolean(event.is_virtual),
    date: event.date,
    title: event.title,
    color: event.color
  }));
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseTimeToMinutes(timeValue) {
  const [hours, minutes] = String(timeValue ?? "00:00").split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

function resolveHourRowHeight(sourceElement) {
  const rawHeight = sourceElement
    ? window.getComputedStyle(sourceElement).getPropertyValue("--hour-row-height")
    : "";
  const parsed = Number.parseFloat(rawHeight);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 56;
}

export function scrollWeekBodyToEventStart(weekContainer, event) {
  const body = weekContainer.querySelector(".week-grid__body");
  if (!(body instanceof HTMLElement)) {
    return;
  }

  const applyScroll = () => {
    const startTime = event?.start_time;
    if (!startTime) {
      body.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    const hourRowHeight = resolveHourRowHeight(body);
    const startTop = (parseTimeToMinutes(startTime) / MINUTES_PER_HOUR) * hourRowHeight;
    const targetTop = Math.max(0, startTop - hourRowHeight);
    const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
    body.scrollTo({ top: Math.min(targetTop, maxScrollTop), behavior: "auto" });
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(applyScroll);
  });
}

export function getWeekBounds(weekStart) {
  const start = getStartOfWeek(weekStart, 1);
  const end = getEndOfWeek(weekStart, 1);
  return {
    start,
    end,
    startDate: formatDateKey(start),
    endDate: formatDateKey(end),
    weekDates: getWeekDates(start, 1)
  };
}
