import { tDayShort } from "../../i18n/strings.js";
import { formatDateKey, formatMonthDay } from "../../utils/date-utils.js";
import { openEventContextMenu } from "./context-menu.js";
import { renderEventBlocks } from "./event-block.js";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const MIN_SELECTION_MINUTES = 15;
const DRAG_THRESHOLD_PX = 6;
const TIME_STEP_MINUTES = 15;

function clampMinutes(value) {
  return Math.max(0, Math.min(MINUTES_PER_DAY, value));
}

function roundDown(value, step) {
  return Math.floor(value / step) * step;
}

function roundUp(value, step) {
  return Math.ceil(value / step) * step;
}

function formatTimeFromMinutes(value) {
  const minutes = Math.max(0, Math.min(MINUTES_PER_DAY - MIN_SELECTION_MINUTES, value));
  const hoursPart = Math.floor(minutes / MINUTES_PER_HOUR);
  const minutesPart = minutes % MINUTES_PER_HOUR;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
}

function pointerToMinutes(clientY, rect, pixelsPerHour) {
  const maxHeight = HOURS_PER_DAY * pixelsPerHour;
  const y = Math.max(0, Math.min(clientY - rect.top, maxHeight));
  return clampMinutes((y / pixelsPerHour) * MINUTES_PER_HOUR);
}

function toPrefillFromRange(startMinutes, endMinutes) {
  const roundedStart = roundDown(startMinutes, TIME_STEP_MINUTES);
  const roundedEnd = roundUp(endMinutes, TIME_STEP_MINUTES);
  const safeEnd = Math.min(
    MINUTES_PER_DAY,
    Math.max(roundedEnd, roundedStart + MIN_SELECTION_MINUTES)
  );

  return {
    startTime: formatTimeFromMinutes(roundedStart),
    endTime: safeEnd >= MINUTES_PER_DAY
      ? "23:59"
      : formatTimeFromMinutes(safeEnd)
  };
}

function toPrefillFromClick(minutes) {
  const hourStart = Math.floor(minutes / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
  const hourEnd = Math.min(MINUTES_PER_DAY, hourStart + MINUTES_PER_HOUR);
  return toPrefillFromRange(hourStart, hourEnd);
}

function isToday(date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function renderDayHeader(date) {
  const header = document.createElement("div");
  header.className = "day-header";
  if (isToday(date)) {
    header.classList.add("day-header--today");
  }

  const dayName = document.createElement("div");
  dayName.className = "day-header__name";
  dayName.textContent = tDayShort(date.getDay());

  const dayDate = document.createElement("div");
  dayDate.className = "day-header__date";
  dayDate.textContent = formatMonthDay(date);

  header.appendChild(dayName);
  header.appendChild(dayDate);

  return header;
}

export function renderDayColumn(date, events, pixelsPerHour, options = {}) {
  const {
    onEventClick = () => {},
    onEventDelete = () => {},
    onEventCopy = () => {},
    onCreateSlot = () => {}
  } = options;
  const column = document.createElement("div");
  column.className = "day-column";
  if (isToday(date)) {
    column.classList.add("day-column--today");
  }
  column.dataset.date = formatDateKey(date);

  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    const cell = document.createElement("div");
    cell.className = "day-column__hour";
    column.appendChild(cell);
  }

  column.appendChild(renderEventBlocks(events, pixelsPerHour, onEventClick));
  wireEventContextMenu(column, {
    onEventClick,
    onEventDelete,
    onEventCopy
  });
  wireCreateInteractions(column, pixelsPerHour, onCreateSlot);

  return column;
}

function wireEventContextMenu(column, handlers) {
  const {
    onEventClick = () => {},
    onEventDelete = () => {},
    onEventCopy = () => {}
  } = handlers;

  column.addEventListener("contextmenu", (contextMenuEvent) => {
    const target = contextMenuEvent.target;
    if (!(target instanceof Element)) {
      return;
    }

    const eventBlock = target.closest(".event-block");
    if (!(eventBlock instanceof HTMLElement)) {
      return;
    }

    const eventId = eventBlock.dataset.eventId;
    if (!eventId) {
      return;
    }

    const title = eventBlock.querySelector(".event-block__title")?.textContent ?? "";
    const time = eventBlock.querySelector(".event-block__time")?.textContent ?? "";

    openEventContextMenu(
      contextMenuEvent,
      {
        id: eventId,
        title,
        time
      },
      {
        onOpen: onEventClick,
        onDelete: onEventDelete,
        onCopy: onEventCopy
      }
    );
  });
}

function wireCreateInteractions(column, pixelsPerHour, onCreateSlot) {
  const selection = {
    pointerId: null,
    startY: 0,
    currentY: 0,
    preview: null,
    dragging: false
  };

  function clearSelection() {
    if (selection.pointerId !== null && typeof column.releasePointerCapture === "function") {
      try {
        column.releasePointerCapture(selection.pointerId);
      } catch (_error) {
        // Capture can already be released on pointerup/pointercancel.
      }
    }

    if (selection.preview) {
      selection.preview.remove();
    }

    selection.pointerId = null;
    selection.preview = null;
    selection.dragging = false;
    selection.startY = 0;
    selection.currentY = 0;
  }

  function ensurePreview() {
    if (selection.preview) {
      return selection.preview;
    }

    const preview = document.createElement("div");
    preview.className = "day-column__selection-preview";
    column.appendChild(preview);
    selection.preview = preview;
    return preview;
  }

  function updatePreview() {
    const preview = ensurePreview();
    const rect = column.getBoundingClientRect();
    const maxY = HOURS_PER_DAY * pixelsPerHour;
    const start = Math.max(0, Math.min(selection.startY - rect.top, maxY));
    const end = Math.max(0, Math.min(selection.currentY - rect.top, maxY));
    const top = Math.min(start, end);
    const height = Math.max(Math.abs(end - start), 1);

    preview.style.top = `${top}px`;
    preview.style.height = `${height}px`;
  }

  column.addEventListener("pointerdown", (pointerEvent) => {
    if (pointerEvent.button !== 0) {
      return;
    }

    if (pointerEvent.target instanceof Element && pointerEvent.target.closest(".event-block")) {
      return;
    }

    selection.pointerId = pointerEvent.pointerId;
    selection.startY = pointerEvent.clientY;
    selection.currentY = pointerEvent.clientY;
    selection.dragging = false;

    if (typeof column.setPointerCapture === "function") {
      column.setPointerCapture(pointerEvent.pointerId);
    }
  });

  column.addEventListener("pointermove", (pointerEvent) => {
    if (selection.pointerId !== pointerEvent.pointerId) {
      return;
    }

    selection.currentY = pointerEvent.clientY;
    if (!selection.dragging && Math.abs(selection.currentY - selection.startY) >= DRAG_THRESHOLD_PX) {
      selection.dragging = true;
    }

    if (selection.dragging) {
      updatePreview();
    }
  });

  function finishSelection(pointerEvent) {
    if (selection.pointerId !== pointerEvent.pointerId) {
      return;
    }

    selection.currentY = pointerEvent.clientY;

    const date = column.dataset.date;
    if (!date) {
      clearSelection();
      return;
    }

    const rect = column.getBoundingClientRect();
    const startMinutes = pointerToMinutes(selection.startY, rect, pixelsPerHour);
    const endMinutes = pointerToMinutes(selection.currentY, rect, pixelsPerHour);

    if (selection.dragging) {
      const prefill = toPrefillFromRange(
        Math.min(startMinutes, endMinutes),
        Math.max(startMinutes, endMinutes)
      );
      onCreateSlot({ date, ...prefill });
    } else {
      const prefill = toPrefillFromClick(startMinutes);
      onCreateSlot({ date, ...prefill });
    }

    clearSelection();
  }

  column.addEventListener("pointerup", finishSelection);
  column.addEventListener("pointercancel", clearSelection);
  column.addEventListener("pointerleave", (pointerEvent) => {
    if (selection.dragging && selection.pointerId === pointerEvent.pointerId) {
      selection.currentY = pointerEvent.clientY;
      updatePreview();
    }
  });
}
