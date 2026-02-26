export async function copyEventToClipboard(eventData, t) {
  const text = [eventData.title, eventData.time].filter(Boolean).join(" · ");
  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    window.alert(t("contextMenuCopyError"));
  }
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
