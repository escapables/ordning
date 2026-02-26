let copiedEventData = null;

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
  return hours * 60 + minutes;
}

function formatTimeFromMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hoursPart = Math.floor(safeMinutes / 60);
  const minutesPart = safeMinutes % 60;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
}

export async function pasteCopiedEventAtSlot({ invoke, refresh, date, startTime }) {
  const copied = getCopiedEventData();
  if (!copied?.id) {
    return false;
  }

  const sourceEvent = await invoke("get_event", { id: copied.id });
  const startMinutes = parseTimeToMinutes(startTime);
  const sourceStart = parseTimeToMinutes(sourceEvent.startTime);
  const sourceEnd = parseTimeToMinutes(sourceEvent.endTime);
  const sourceDuration = Math.max(15, sourceEnd - sourceStart || 60);
  const endMinutes = Math.min(23 * 60 + 59, startMinutes + sourceDuration);

  await invoke("create_event", {
    event: {
      calendarId: sourceEvent.calendarId,
      title: sourceEvent.title,
      startDate: date,
      endDate: date,
      startTime: formatTimeFromMinutes(startMinutes),
      endTime: formatTimeFromMinutes(endMinutes),
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
