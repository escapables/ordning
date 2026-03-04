import {
  copyEventToClipboard,
  getCopiedEventData,
  getCopiedEventSource,
  pasteCopiedEventAtSlot
} from "../utils/ui-actions.js";

import { resolveCopyAnchorOffset } from "./event-copy-paste-geometry.js";
import { resolveEventColor } from "./event-copy-paste-preview.js";

export function canPasteCopiedEvent() {
  return Boolean(getCopiedEventData()?.id);
}

export function readEventData(element) {
  return {
    id: element.dataset.eventActionId ?? element.dataset.eventId ?? "",
    title: element.querySelector(".event-block__title")?.textContent ?? "",
    time: element.querySelector(".event-block__time")?.textContent ?? ""
  };
}

export function getSelectedTimedEvent(weekContainer) {
  const focusedEvent = document.activeElement;
  if (focusedEvent instanceof HTMLElement && focusedEvent.classList.contains("event-block")) {
    return focusedEvent;
  }

  const selectedEvent = weekContainer.querySelector(".event-block--selected");
  return selectedEvent instanceof HTMLElement && selectedEvent.classList.contains("event-block")
    ? selectedEvent
    : null;
}

export async function prepareCopiedTimedEvent({
  eventData,
  sourceElement = null,
  invoke,
  t,
  weekContainer
}) {
  await copyEventToClipboard(eventData, t);
  if (!eventData?.id) {
    return null;
  }

  const sourceEvent = await getCopiedEventSource(invoke);
  if (!sourceEvent?.startTime || !sourceEvent?.endTime || sourceEvent.allDay) {
    return null;
  }

  return {
    sourceEvent,
    anchorOffsetMinutes: resolveCopyAnchorOffset(sourceEvent, sourceElement),
    eventColor: resolveEventColor(weekContainer, eventData.id, sourceElement)
  };
}

export function pasteCopiedEventAtResolvedSlot({ invoke, refresh, resolvedSlot }) {
  if (!resolvedSlot?.date || !resolvedSlot?.startTime) {
    return false;
  }

  return pasteCopiedEventAtSlot({
    invoke,
    refresh,
    date: resolvedSlot.date,
    startTime: resolvedSlot.startTime
  });
}

export function pasteCopiedEventAtPrefill({ invoke, refresh, prefill = {} }) {
  if (!prefill?.date || !prefill?.startTime) {
    return false;
  }

  return pasteCopiedEventAtSlot({
    invoke,
    refresh,
    date: prefill.date,
    startTime: prefill.startTime
  });
}
