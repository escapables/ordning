(function () {
  "use strict";

  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) {
    return;
  }

  const baseInvoke = tauri.core.invoke.bind(tauri.core);
  const timedEventDatesById = new Map();

  function rememberTimedEvent(id, eventPayload) {
    if (!id || !eventPayload || eventPayload.allDay) {
      return;
    }

    timedEventDatesById.set(id, {
      start_date: eventPayload.startDate,
      end_date: eventPayload.endDate
    });
  }

  async function resolveTimedEventDates(event) {
    if (!event?.id) {
      return null;
    }

    if (event.start_date && event.end_date) {
      return {
        start_date: event.start_date,
        end_date: event.end_date
      };
    }

    const lookupId = event.source_id ?? event.id;
    const cached = timedEventDatesById.get(lookupId);
    if (cached?.start_date && cached?.end_date) {
      return cached;
    }

    const fullEvent = await baseInvoke("get_event", { id: lookupId });
    if (!fullEvent?.startDate || !fullEvent?.endDate || fullEvent?.allDay) {
      return null;
    }

    const resolved = {
      start_date: fullEvent.startDate,
      end_date: fullEvent.endDate
    };
    timedEventDatesById.set(lookupId, resolved);
    return resolved;
  }

  tauri.core.invoke = async function patchedInvoke(command, payload = {}) {
    if (command === "create_event") {
      const created = await baseInvoke(command, payload);
      rememberTimedEvent(created?.id, payload?.event);
      return created;
    }

    if (command === "update_event") {
      const updated = await baseInvoke(command, payload);
      rememberTimedEvent(payload?.id, payload?.event);
      return updated;
    }

    if (command === "delete_event") {
      timedEventDatesById.delete(payload?.id);
      return baseInvoke(command, payload);
    }

    if (command === "get_week_events") {
      const result = await baseInvoke(command, payload);
      const timed = await Promise.all(
        (result?.timed ?? []).map(async (event) => {
          const span = await resolveTimedEventDates(event);
          return {
            ...event,
            start_date: span?.start_date ?? event.date,
            end_date: span?.end_date ?? event.date
          };
        })
      );
      return {
        ...(result ?? {}),
        timed
      };
    }

    return baseInvoke(command, payload);
  };
})();
