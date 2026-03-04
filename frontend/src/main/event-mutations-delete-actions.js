import {
  appendExceptionDate,
  buildEventInput,
  toRecurrenceInput,
  truncateRecurringSeries
} from "./event-mutations-recurrence.js";
import {
  deleteStoredEvent,
  getStoredEvent,
  updateStoredEvent
} from "./event-mutations-store.js";

function normalizeDeleteTarget(target) {
  if (typeof target === "string") {
    return {
      eventId: target,
      instanceDate: null,
      isVirtual: false
    };
  }

  return {
    eventId: target?.id ?? null,
    instanceDate: target?.date ?? null,
    isVirtual: Boolean(target?.isVirtual)
  };
}

export function createDeleteEventByIdAction({
  invoke,
  confirmDialog,
  t,
  refreshAndRender,
  setPendingHighlightEvent,
  chooseRecurringScope
}) {
  return async function deleteEventById(target) {
    const { eventId, instanceDate, isVirtual } = normalizeDeleteTarget(target);
    if (!eventId) {
      return false;
    }

    try {
      if (!isVirtual || !instanceDate) {
        const confirmed = await confirmDialog.confirm(t("eventFormDeleteConfirm"));
        if (!confirmed) {
          return false;
        }

        await deleteStoredEvent(invoke, eventId);
        await refreshAndRender();
        return true;
      }

      const choice = await chooseRecurringScope("danger");
      if (!choice) {
        return false;
      }

      const existing = await getStoredEvent(invoke, eventId);
      const recurrence = toRecurrenceInput(existing.recurrence);
      const nextRecurrence = choice === "alternate"
        ? appendExceptionDate(recurrence, instanceDate)
        : truncateRecurringSeries(recurrence, instanceDate);

      await updateStoredEvent(
        invoke,
        eventId,
        buildEventInput(existing, { recurrence: nextRecurrence })
      );
      setPendingHighlightEvent(null);
      await refreshAndRender();
      return true;
    } catch (error) {
      window.alert(String(error));
      console.error("Failed to delete event", error);
      return false;
    }
  };
}

export function createDeleteMultipleEventsAction({
  invoke,
  confirmDialog,
  t,
  refreshAndRender,
  deleteEventById
}) {
  return async function deleteMultipleEvents(targets) {
    if (!Array.isArray(targets) || targets.length === 0) {
      return false;
    }

    if (targets.length === 1) {
      return deleteEventById(targets[0]);
    }

    try {
      const hasVirtual = targets.some((target) => target.isVirtual);
      let message = t("multiDeleteConfirm").replace("{count}", String(targets.length));
      if (hasVirtual) {
        message += "\n" + t("multiDeleteRecurringNote");
      }
      const confirmed = await confirmDialog.confirm(message);
      if (!confirmed) {
        return false;
      }

      const nonVirtual = targets.filter((target) => !target.isVirtual);
      const virtual = targets.filter((target) => target.isVirtual && target.date);

      if (nonVirtual.length > 0) {
        await invoke("delete_events", { ids: nonVirtual.map((target) => target.id) });
      }

      for (const target of virtual) {
        const existing = await getStoredEvent(invoke, target.id);
        const recurrence = toRecurrenceInput(existing.recurrence);
        await updateStoredEvent(
          invoke,
          target.id,
          buildEventInput(existing, { recurrence: appendExceptionDate(recurrence, target.date) })
        );
      }

      await refreshAndRender();
      return true;
    } catch (error) {
      window.alert(String(error));
      console.error("Failed to delete multiple events", error);
      return false;
    }
  };
}
