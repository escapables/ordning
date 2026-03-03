import {
  eventDurationMinutes,
  MINUTES_PER_HOUR,
  TIME_STEP_MINUTES,
  formatTimeFromMinutes,
  pointerToMinutes,
  resolveColumnFromPoint,
  roundNearest
} from "../components/week-view/drag-time-utils.js";
import {
  copyEventToClipboard,
  getCopiedEventData,
  getCopiedEventSource,
  pasteCopiedEventAtSlot,
  resolvePastePlacement
} from "../utils/ui-actions.js";

const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const MIN_PREVIEW_HEIGHT = 18;

function resolvePixelsPerHour(column) {
  const root = column.closest(".week-view") ?? column;
  const rawValue = window.getComputedStyle(root).getPropertyValue("--hour-row-height");
  const parsedValue = Number.parseFloat(rawValue);
  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  const fallbackValue = column.getBoundingClientRect().height / HOURS_PER_DAY;
  return Number.isFinite(fallbackValue) && fallbackValue > 0 ? fallbackValue : 56;
}

function readEventData(element) {
  return {
    id: element.dataset.eventActionId ?? element.dataset.eventId ?? "",
    title: element.querySelector(".event-block__title")?.textContent ?? "",
    time: element.querySelector(".event-block__time")?.textContent ?? ""
  };
}

function findTimedEventElement(weekContainer, eventId) {
  return Array.from(weekContainer.querySelectorAll(".event-block")).find(
    (element) =>
      element instanceof HTMLElement
      && (element.dataset.eventId === eventId || element.dataset.eventActionId === eventId)
  ) ?? null;
}

function resolveEventColor(weekContainer, eventId, sourceElement = null) {
  const targetElement = sourceElement instanceof HTMLElement
    ? sourceElement
    : findTimedEventElement(weekContainer, eventId);
  const color = targetElement instanceof HTMLElement
    ? targetElement.style.getPropertyValue("--event-color")
    : "";
  return color || "#007aff";
}

function resolveSlotFromPoint(weekContainer, clientX, clientY) {
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
    Math.min(roundNearest(rawMinutes, TIME_STEP_MINUTES), (24 * MINUTES_PER_HOUR) - TIME_STEP_MINUTES)
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

function resolveCopyAnchorOffset(sourceEvent, sourceElement = null) {
  if (sourceElement instanceof HTMLElement) {
    const startMinutes = Number.parseFloat(sourceElement.dataset.startMinutes ?? "");
    const endMinutes = Number.parseFloat(sourceElement.dataset.endMinutes ?? "");
    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
      return roundNearest((endMinutes - startMinutes) / 2, TIME_STEP_MINUTES);
    }
  }

  return roundNearest(eventDurationMinutes(sourceEvent) / 2, TIME_STEP_MINUTES);
}

function applyAnchorOffset(slot, anchorOffsetMinutes) {
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

function createPreviewElement({ color, segment, column }) {
  const pixelsPerHour = resolvePixelsPerHour(column);
  const preview = document.createElement("div");
  preview.className = "day-column__move-preview";
  preview.style.setProperty("--event-color", color);
  preview.style.top = `${(segment.startMinutes / MINUTES_PER_HOUR) * pixelsPerHour}px`;
  preview.style.height = `${Math.max(((segment.endMinutes - segment.startMinutes) / MINUTES_PER_HOUR) * pixelsPerHour, MIN_PREVIEW_HEIGHT)}px`;
  column.appendChild(preview);
  return preview;
}

export function createEventCopyPasteController(options = {}) {
  const {
    weekContainer,
    invoke,
    refresh = async () => {},
    t,
    clearEventSelection = () => {}
  } = options;

  const state = {
    active: false,
    sourceEvent: null,
    anchorOffsetMinutes: 0,
    eventColor: "#007aff",
    previews: [],
    lastPointer: null,
    lastSlot: null,
    lastResolvedSlot: null,
    pasteInFlight: false
  };

  function clearPreview() {
    state.previews.forEach((preview) => {
      preview.remove();
    });
    state.previews = [];
  }

  function clear() {
    clearPreview();
    state.active = false;
    state.sourceEvent = null;
    state.anchorOffsetMinutes = 0;
    state.lastSlot = null;
    state.lastResolvedSlot = null;
  }

  function renderPreview(slot) {
    clearPreview();
    state.lastSlot = slot;
    state.lastResolvedSlot = applyAnchorOffset(slot, state.anchorOffsetMinutes);

    if (!state.active || !state.sourceEvent || !state.lastResolvedSlot) {
      return false;
    }

    const placement = resolvePastePlacement(state.sourceEvent, {
      date: state.lastResolvedSlot.date,
      startTime: state.lastResolvedSlot.startTime
    });
    if (!placement) {
      return false;
    }

    placement.segments.forEach((segment) => {
      const targetColumn = weekContainer.querySelector(`.day-column[data-date="${segment.date}"]`)
        ?? (segment.date === state.lastResolvedSlot.date ? state.lastResolvedSlot.column : null);
      if (!(targetColumn instanceof HTMLElement)) {
        return;
      }
      state.previews.push(createPreviewElement({
        color: state.eventColor,
        segment,
        column: targetColumn
      }));
    });

    return state.previews.length > 0;
  }

  function updatePreview(clientX, clientY) {
    state.lastPointer = { clientX, clientY };
    if (!state.active) {
      return false;
    }
    return renderPreview(resolveSlotFromPoint(weekContainer, clientX, clientY));
  }

  async function copyEvent(eventData, sourceElement = null) {
    await copyEventToClipboard(eventData, t);
    if (!eventData?.id) {
      return false;
    }

    try {
      const sourceEvent = await getCopiedEventSource(invoke);
      if (!sourceEvent?.startTime || !sourceEvent?.endTime || sourceEvent.allDay) {
        clear();
        return false;
      }

      state.active = true;
      state.sourceEvent = sourceEvent;
      state.anchorOffsetMinutes = resolveCopyAnchorOffset(sourceEvent, sourceElement);
      state.eventColor = resolveEventColor(weekContainer, eventData.id, sourceElement);
      if (state.lastPointer) {
        updatePreview(state.lastPointer.clientX, state.lastPointer.clientY);
      } else {
        clearPreview();
      }
      return true;
    } catch (error) {
      clear();
      window.alert(String(error));
      console.error("Failed to copy event for paste mode", error);
      return false;
    }
  }

  async function pasteAtSlot(slot) {
    const resolvedSlot = applyAnchorOffset(slot, state.anchorOffsetMinutes);
    if (!state.active || !resolvedSlot || state.pasteInFlight) {
      return false;
    }

    state.pasteInFlight = true;
    const sourceEvent = state.sourceEvent;
    clear();

    try {
      const pasted = await pasteCopiedEventAtSlot({
        invoke,
        refresh,
        date: resolvedSlot.date,
        startTime: resolvedSlot.startTime
      });
      if (!pasted && sourceEvent) {
        state.active = true;
        state.sourceEvent = sourceEvent;
        state.anchorOffsetMinutes = resolveCopyAnchorOffset(sourceEvent);
        renderPreview(slot);
      }
      return pasted;
    } catch (error) {
      if (sourceEvent) {
        state.active = true;
        state.sourceEvent = sourceEvent;
        state.anchorOffsetMinutes = resolveCopyAnchorOffset(sourceEvent);
        renderPreview(slot);
      }
      window.alert(String(error));
      console.error("Failed to paste copied event", error);
      return false;
    } finally {
      state.pasteInFlight = false;
    }
  }

  function getSelectedTimedEvent() {
    const focusedEvent = document.activeElement;
    if (focusedEvent instanceof HTMLElement && focusedEvent.classList.contains("event-block")) {
      return focusedEvent;
    }

    const selectedEvent = weekContainer.querySelector(".event-block--selected");
    return selectedEvent instanceof HTMLElement && selectedEvent.classList.contains("event-block")
      ? selectedEvent
      : null;
  }

  async function copySelectedEvent() {
    const eventElement = getSelectedTimedEvent();
    if (!(eventElement instanceof HTMLElement)) {
      return false;
    }
    return copyEvent(readEventData(eventElement), eventElement);
  }

  async function pasteAtCurrentPointer() {
    if (!state.lastSlot) {
      return false;
    }
    return pasteAtSlot(state.lastSlot);
  }

  async function pasteAtPrefill(prefill = {}) {
    if (!prefill?.date || !prefill?.startTime) {
      return false;
    }
    clear();
    return pasteCopiedEventAtSlot({
      invoke,
      refresh,
      date: prefill.date,
      startTime: prefill.startTime
    });
  }

  function handlePointerMove(pointerEvent) {
    if (state.pasteInFlight) {
      return;
    }
    state.lastPointer = {
      clientX: pointerEvent.clientX,
      clientY: pointerEvent.clientY
    };
    if (state.active) {
      renderPreview(resolveSlotFromPoint(weekContainer, pointerEvent.clientX, pointerEvent.clientY));
    }
  }

  function handlePointerLeave() {
    state.lastPointer = null;
    state.lastSlot = null;
    state.lastResolvedSlot = null;
    if (state.active) {
      clearPreview();
    }
  }

  function handleClick(clickEvent) {
    const target = clickEvent.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (state.active && !target.closest(".event-block") && !target.closest(".all-day-event")) {
      const slot = resolveSlotFromPoint(weekContainer, clickEvent.clientX, clickEvent.clientY);
      if (slot) {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        void pasteAtSlot(slot);
        return;
      }
    }

    if (target.closest(".event-block") || target.closest(".all-day-event")) {
      return;
    }

    if (target.closest(".day-column") || target.closest(".all-day-bar__day")) {
      clearEventSelection();
    }
  }

  weekContainer.addEventListener("pointermove", handlePointerMove);
  weekContainer.addEventListener("pointerleave", handlePointerLeave);
  weekContainer.addEventListener("click", handleClick, true);

  return {
    canPaste: () => Boolean(getCopiedEventData()?.id),
    clear,
    copyEvent,
    copySelectedEvent,
    pasteAtCurrentPointer,
    pasteAtPrefill,
    dispose() {
      clear();
      weekContainer.removeEventListener("pointermove", handlePointerMove);
      weekContainer.removeEventListener("pointerleave", handlePointerLeave);
      weekContainer.removeEventListener("click", handleClick, true);
    }
  };
}
