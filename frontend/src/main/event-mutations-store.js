import { buildEventInput } from "./event-mutations-recurrence.js";

export async function updateStoredEvent(invoke, eventId, payload) {
  await invoke("update_event", {
    id: eventId,
    event: payload
  });
}

export async function deleteStoredEvent(invoke, eventId) {
  await invoke("delete_event", { id: eventId });
}

export async function getStoredEvent(invoke, eventId) {
  return invoke("get_event", { id: eventId });
}

export async function createStoredEvent(invoke, payload) {
  return invoke("create_event", {
    event: payload
  });
}

export async function applyTimedUpdates(invoke, updates) {
  for (const update of updates) {
    const existing = await getStoredEvent(invoke, update.eventId);
    await updateStoredEvent(
      invoke,
      update.eventId,
      buildEventInput(existing, {
        startDate: update.startDate ?? update.date,
        endDate: update.endDate ?? update.date,
        startTime: update.startTime,
        endTime: update.endTime,
        allDay: false
      })
    );
  }
}
