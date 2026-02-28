import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MIN_SELECTION_MINUTES,
  TIME_STEP_MINUTES,
  pointerToMinutes,
  resolveColumnFromPoint,
  roundNearest
} from "./drag-time-utils.js";
import { formatClockMinutes } from "./drag-payload-utils.js";

const DRAG_THRESHOLD_PX = 6;

function listDayColumns(anchorColumn) {
  return Array.from((anchorColumn.closest(".week-grid") ?? document).querySelectorAll(".day-column"))
    .filter((element) => element instanceof HTMLElement);
}

function getColumnIndex(columns, targetColumn) {
  return columns.findIndex((column) => column === targetColumn);
}

function createPreview(column, startMinutes, endMinutes, pixelsPerHour) {
  if (endMinutes <= startMinutes) {
    return null;
  }

  const preview = document.createElement("div");
  preview.className = "day-column__selection-preview";
  preview.style.top = `${(startMinutes / MINUTES_PER_HOUR) * pixelsPerHour}px`;
  preview.style.height = `${Math.max(((endMinutes - startMinutes) / MINUTES_PER_HOUR) * pixelsPerHour, 1)}px`;
  column.appendChild(preview);
  return preview;
}

function buildRange(selection, activeColumn) {
  const startIndex = getColumnIndex(selection.columns, selection.startColumn);
  const activeIndex = getColumnIndex(selection.columns, activeColumn);
  if (startIndex < 0 || activeIndex < 0) {
    return null;
  }

  const startRect = selection.startColumn.getBoundingClientRect();
  const activeRect = activeColumn.getBoundingClientRect();
  const absoluteStart = (startIndex * MINUTES_PER_DAY)
    + pointerToMinutes(selection.startY, startRect, selection.pixelsPerHour);
  const absoluteEnd = (activeIndex * MINUTES_PER_DAY)
    + pointerToMinutes(selection.currentY, activeRect, selection.pixelsPerHour);

  return {
    start: Math.min(absoluteStart, absoluteEnd),
    end: Math.max(absoluteStart, absoluteEnd)
  };
}

function renderPreview(selection, activeColumn) {
  const range = buildRange(selection, activeColumn);
  selection.previews.forEach((preview) => preview.remove());
  selection.previews = [];
  if (!range) {
    return;
  }

  const visualEnd = range.end > range.start ? range.end : range.start + 1;
  const startDayIndex = Math.floor(range.start / MINUTES_PER_DAY);
  const endDayIndex = Math.floor(visualEnd / MINUTES_PER_DAY);

  for (let dayIndex = startDayIndex; dayIndex <= endDayIndex; dayIndex += 1) {
    const column = selection.columns[dayIndex];
    if (!(column instanceof HTMLElement)) {
      continue;
    }
    const dayStart = dayIndex * MINUTES_PER_DAY;
    const segmentStart = dayIndex === startDayIndex ? range.start - dayStart : 0;
    const segmentEnd = dayIndex === endDayIndex ? visualEnd - dayStart : MINUTES_PER_DAY;
    const preview = createPreview(column, segmentStart, segmentEnd, selection.pixelsPerHour);
    if (preview) {
      selection.previews.push(preview);
    }
  }
}

function buildPrefill(selection, activeColumn) {
  const range = buildRange(selection, activeColumn);
  if (!range) {
    return null;
  }

  const maxAbsoluteStart = (selection.columns.length * MINUTES_PER_DAY) - MIN_SELECTION_MINUTES;
  const roundedStart = Math.min(
    Math.floor(range.start / TIME_STEP_MINUTES) * TIME_STEP_MINUTES,
    maxAbsoluteStart
  );
  const roundedEndBase = Math.ceil(range.end / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  const maxAbsoluteEnd = (selection.columns.length * MINUTES_PER_DAY) - 1;
  const roundedEnd = Math.min(
    Math.max(roundedEndBase, roundedStart + MIN_SELECTION_MINUTES),
    maxAbsoluteEnd
  );
  const startDayIndex = Math.floor(roundedStart / MINUTES_PER_DAY);
  const endDayIndex = Math.floor(roundedEnd / MINUTES_PER_DAY);
  const startColumn = selection.columns[startDayIndex];
  const endColumn = selection.columns[endDayIndex];
  if (!(startColumn instanceof HTMLElement) || !(endColumn instanceof HTMLElement)) {
    return null;
  }

  const startDate = startColumn.dataset.date;
  const endDate = endColumn.dataset.date;
  if (!startDate || !endDate) {
    return null;
  }

  const startMinutes = roundedStart % MINUTES_PER_DAY;
  const endMinutes = roundedEnd % MINUTES_PER_DAY;
  return {
    date: startDate,
    startDate,
    endDate,
    startTime: formatClockMinutes(startMinutes),
    endTime: endMinutes === 0 && endDayIndex > startDayIndex ? "00:00" : formatClockMinutes(endMinutes)
  };
}

export function installCreateInteractions(column, pixelsPerHour, onCreateSlot) {
  const selection = {
    pointerId: null,
    startColumn: null,
    activeColumn: null,
    columns: [],
    startX: 0,
    startY: 0,
    currentY: 0,
    dragging: false,
    previews: [],
    pixelsPerHour
  };

  function clearSelection() {
    window.removeEventListener("pointermove", handlePointerMove, true);
    window.removeEventListener("pointerup", finishSelection, true);
    window.removeEventListener("pointercancel", clearSelection, true);

    if (selection.pointerId !== null && selection.startColumn && typeof selection.startColumn.releasePointerCapture === "function") {
      try {
        selection.startColumn.releasePointerCapture(selection.pointerId);
      } catch (_error) {
        // Pointer capture can already be released on pointerup/pointercancel.
      }
    }

    selection.previews.forEach((preview) => preview.remove());
    selection.pointerId = null;
    selection.startColumn = null;
    selection.activeColumn = null;
    selection.columns = [];
    selection.startX = 0;
    selection.startY = 0;
    selection.currentY = 0;
    selection.dragging = false;
    selection.previews = [];
  }

  function handlePointerMove(pointerEvent) {
    if (selection.pointerId !== pointerEvent.pointerId) {
      return;
    }

    selection.currentY = pointerEvent.clientY;
    if (!selection.dragging) {
      const deltaX = Math.abs(pointerEvent.clientX - selection.startX);
      const deltaY = Math.abs(selection.currentY - selection.startY);
      if (Math.max(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
        return;
      }
      selection.dragging = true;
    }

    const pointedColumn = resolveColumnFromPoint(pointerEvent.clientX, pointerEvent.clientY);
    if (pointedColumn instanceof HTMLElement && selection.columns.includes(pointedColumn)) {
      selection.activeColumn = pointedColumn;
    }

    renderPreview(selection, selection.activeColumn ?? selection.startColumn);
  }

  function finishSelection(pointerEvent) {
    if (selection.pointerId !== pointerEvent.pointerId) {
      return;
    }

    selection.currentY = pointerEvent.clientY;
    if (selection.dragging) {
      const pointedColumn = resolveColumnFromPoint(pointerEvent.clientX, pointerEvent.clientY);
      if (pointedColumn instanceof HTMLElement && selection.columns.includes(pointedColumn)) {
        selection.activeColumn = pointedColumn;
      }
      const prefill = buildPrefill(selection, selection.activeColumn ?? selection.startColumn);
      if (prefill) {
        onCreateSlot(prefill);
      }
    }

    clearSelection();
  }

  column.addEventListener("pointerdown", (pointerEvent) => {
    if (pointerEvent.button !== 0) {
      return;
    }

    if (pointerEvent.target instanceof Element && pointerEvent.target.closest(".event-block")) {
      return;
    }

    selection.pointerId = pointerEvent.pointerId;
    selection.startColumn = column;
    selection.activeColumn = column;
    selection.columns = listDayColumns(column);
    selection.startX = pointerEvent.clientX;
    selection.startY = pointerEvent.clientY;
    selection.currentY = pointerEvent.clientY;
    selection.dragging = false;

    if (typeof column.setPointerCapture === "function") {
      column.setPointerCapture(pointerEvent.pointerId);
    }
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", finishSelection, true);
    window.addEventListener("pointercancel", clearSelection, true);
  });
}
