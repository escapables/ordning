let copiedEventData = null;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MIN_SELECTION_MINUTES = 15;

export function getCopiedEventData() {
  return copiedEventData ? { ...copiedEventData } : null;
}

export async function copyEventToClipboard(eventData, t) {
  const text = [eventData.title, eventData.time].filter(Boolean).join(" · ");
  copiedEventData = {
    id: eventData.id,
    title: eventData.title ?? "",
    time: eventData.time ?? ""
  };
  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    window.alert(t("contextMenuCopyError"));
  }
}

function parseTimeToMinutes(timeValue) {
  const [hours, minutes] = String(timeValue ?? "").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return Math.max(0, Math.min((hours * MINUTES_PER_HOUR) + minutes, MINUTES_PER_DAY));
}

function formatClockTime(minutes) {
  const safeMinutes = Math.max(0, Math.min(MINUTES_PER_DAY - 1, minutes));
  const hoursPart = Math.floor(safeMinutes / MINUTES_PER_HOUR);
  const minutesPart = safeMinutes % MINUTES_PER_HOUR;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
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

function resolveDurationMinutes(event) {
  const start = parseTimeToMinutes(event?.startTime);
  const end = parseTimeToMinutes(event?.endTime);
  const startDate = String(event?.startDate ?? event?.date ?? "");
  const endDate = String(event?.endDate ?? event?.date ?? "");
  const startDateValue = Date.parse(`${startDate}T00:00:00`);
  const endDateValue = Date.parse(`${endDate}T00:00:00`);
  if (Number.isFinite(startDateValue) && Number.isFinite(endDateValue)) {
    const daySpan = Math.round((endDateValue - startDateValue) / (24 * 60 * 60 * 1000));
    if (daySpan > 0) {
      return (daySpan * MINUTES_PER_DAY) + Math.max(0, end - start);
    }
  }
  if (end > start) {
    return end - start;
  }
  return (MINUTES_PER_DAY - start) + end;
}

function buildPreviewSegments(date, startMinutes, durationMinutes) {
  const segments = [];
  let remaining = Math.max(MIN_SELECTION_MINUTES, durationMinutes || 0);
  let currentDate = date;
  let currentStart = startMinutes;

  while (remaining > 0 && currentDate) {
    const availableMinutes = MINUTES_PER_DAY - currentStart;
    const segmentLength = Math.max(MIN_SELECTION_MINUTES, Math.min(remaining, availableMinutes));
    const segmentEnd = Math.min(MINUTES_PER_DAY, currentStart + segmentLength);
    segments.push({
      date: currentDate,
      startMinutes: currentStart,
      endMinutes: segmentEnd
    });
    remaining -= segmentEnd - currentStart;
    currentDate = addDaysToDateKey(currentDate, 1);
    currentStart = 0;
  }

  return segments;
}

export async function getCopiedEventSource(invoke) {
  const copied = getCopiedEventData();
  if (!copied?.id) {
    return null;
  }
  return invoke("get_event", { id: copied.id });
}

export function resolvePastePlacement(sourceEvent, { date, startTime }) {
  if (!date || !sourceEvent?.startTime || !sourceEvent?.endTime || sourceEvent.allDay) {
    return null;
  }

  const startMinutes = Math.min(parseTimeToMinutes(startTime), MINUTES_PER_DAY - MIN_SELECTION_MINUTES);
  const durationMinutes = Math.max(MIN_SELECTION_MINUTES, resolveDurationMinutes(sourceEvent));
  const absoluteEndMinutes = startMinutes + durationMinutes;
  const dayOffset = Math.floor(absoluteEndMinutes / MINUTES_PER_DAY);
  const endMinutes = absoluteEndMinutes % MINUTES_PER_DAY;
  const endDate = addDaysToDateKey(date, dayOffset);

  if (!endDate) {
    return null;
  }

  return {
    startDate: date,
    endDate,
    startTime: formatClockTime(startMinutes),
    endTime: endMinutes === 0 && dayOffset > 0 ? "00:00" : formatClockTime(endMinutes),
    durationMinutes,
    segments: buildPreviewSegments(date, startMinutes, durationMinutes)
  };
}

export async function pasteCopiedEventAtSlot({ invoke, refresh, date, startTime }) {
  const sourceEvent = await getCopiedEventSource(invoke);
  const placement = resolvePastePlacement(sourceEvent, { date, startTime });
  if (!sourceEvent || !placement) {
    return false;
  }

  await invoke("create_event", {
    event: {
      calendarId: sourceEvent.calendarId,
      title: sourceEvent.title,
      startDate: placement.startDate,
      endDate: placement.endDate,
      startTime: placement.startTime,
      endTime: placement.endTime,
      allDay: false,
      location: sourceEvent.location ?? "",
      descriptionPrivate: sourceEvent.descriptionPrivate ?? "",
      descriptionPublic: sourceEvent.descriptionPublic ?? ""
    }
  });
  await refresh();
  return true;
}

function todayDateKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export async function purgePastEventsFlow({ invoke, confirm, refresh, t }) {
  const beforeDate = todayDateKey();
  const count = await invoke("get_past_events_count", { beforeDate });
  if (count <= 0) {
    window.alert(t("purgePastNone"));
    return;
  }

  const stepOneConfirmed = await confirm(t("purgePastPreview"));
  if (!stepOneConfirmed) {
    return;
  }

  const stepTwoConfirmed = await confirm(t("purgePastFinalConfirm"), {
    cancelLabel: t("purgePastFinalCancel"),
    confirmLabel: t("purgePastFinalProceed")
  });
  if (!stepTwoConfirmed) {
    return;
  }

  await invoke("purge_past_events", { beforeDate });
  await refresh();
}
