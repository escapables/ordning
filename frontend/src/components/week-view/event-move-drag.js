const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MIN_SELECTION_MINUTES = 15;
const DRAG_THRESHOLD_PX = 3;
const TIME_STEP_MINUTES = 15;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundNearest(value, step) {
  return Math.round(value / step) * step;
}

function parseTimeToMinutes(timeValue) {
  const [hours, minutes] = String(timeValue ?? "00:00").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return clamp((hours * MINUTES_PER_HOUR) + minutes, 0, MINUTES_PER_DAY);
}

function formatTimeFromMinutes(value) {
  const minutes = clamp(value, 0, MINUTES_PER_DAY - MIN_SELECTION_MINUTES);
  const hoursPart = Math.floor(minutes / MINUTES_PER_HOUR);
  const minutesPart = minutes % MINUTES_PER_HOUR;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
}

function pointerToMinutes(clientY, rect, pixelsPerHour) {
  const maxHeight = 24 * pixelsPerHour;
  const y = clamp(clientY - rect.top, 0, maxHeight);
  return clamp((y / pixelsPerHour) * MINUTES_PER_HOUR, 0, MINUTES_PER_DAY);
}

function eventDurationMinutes(event) {
  const start = parseTimeToMinutes(event.startTime);
  const end = parseTimeToMinutes(event.endTime);
  if (end > start) {
    return end - start;
  }
  return (MINUTES_PER_DAY - start) + end;
}

function clampStartForDuration(startMinutes, durationMinutes) {
  const safeDuration = clamp(durationMinutes, MIN_SELECTION_MINUTES, MINUTES_PER_DAY);
  return clamp(startMinutes, 0, MINUTES_PER_DAY - safeDuration);
}

function splitIntoOverlapGroups(items) {
  const groups = [];
  let group = [];
  let maxEnd = 0;

  items.forEach((item) => {
    if (group.length === 0) {
      group = [item];
      maxEnd = item.endMinutes;
      return;
    }

    if (item.startMinutes < maxEnd) {
      group.push(item);
      maxEnd = Math.max(maxEnd, item.endMinutes);
      return;
    }

    groups.push(group);
    group = [item];
    maxEnd = item.endMinutes;
  });

  if (group.length > 0) {
    groups.push(group);
  }

  return groups;
}

function assignColumns(group) {
  const active = [];
  let maxColumns = 1;

  group.forEach((item) => {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].endMinutes <= item.startMinutes) {
        active.splice(index, 1);
      }
    }

    const usedColumns = new Set(active.map((entry) => entry.column));
    let column = 0;
    while (usedColumns.has(column)) {
      column += 1;
    }

    item.column = column;
    active.push({ endMinutes: item.endMinutes, column });
    maxColumns = Math.max(maxColumns, column + 1);
  });

  group.forEach((item) => {
    item.totalColumns = maxColumns;
  });
}

function layoutItems(items) {
  const sorted = [...items].sort(
    (left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes
  );
  splitIntoOverlapGroups(sorted).forEach(assignColumns);
  return sorted;
}

function readEventBlockRange(block) {
  const startMinutes = Number.parseFloat(block.dataset.startMinutes ?? "");
  const endMinutes = Number.parseFloat(block.dataset.endMinutes ?? "");
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return null;
  }
  return {
    startMinutes,
    endMinutes
  };
}

function resolveColumnFromPoint(clientX, clientY) {
  const pointed = document.elementFromPoint(clientX, clientY);
  if (!(pointed instanceof Element)) {
    return null;
  }
  const column = pointed.closest(".day-column");
  return column instanceof HTMLElement ? column : null;
}

export function createEventMovePointerDownHandler(column, pixelsPerHour, handlers = {}) {
  const { onEventMove = async () => {}, onEventResize = async () => {} } = handlers;
  const dragState = {
    pointerId: null,
    dragging: false,
    mode: "move",
    startX: 0,
    startY: 0,
    eventId: null,
    eventColor: "#007aff",
    durationMinutes: MIN_SELECTION_MINUTES,
    sourceColumn: null,
    targetColumn: null,
    targetDate: null,
    targetStartMinutes: 0,
    targetEndMinutes: MIN_SELECTION_MINUTES,
    draggedElement: null,
    preview: null,
    originalStyles: new Map()
  };

  function isResizeTop(pointerEvent, element) {
    return pointerEvent.clientY - element.getBoundingClientRect().top <= 6;
  }

  function isResizeBottom(pointerEvent, element) {
    return element.getBoundingClientRect().bottom - pointerEvent.clientY <= 6;
  }

  function resolveDragMode(pointerEvent, element) {
    if (isResizeTop(pointerEvent, element)) {
      return "resize-top";
    }
    if (isResizeBottom(pointerEvent, element)) {
      return "resize-bottom";
    }
    return "move";
  }

  function previewRange() {
    if (dragState.mode === "move") {
      return {
        startMinutes: dragState.targetStartMinutes,
        endMinutes: Math.min(MINUTES_PER_DAY, dragState.targetStartMinutes + dragState.durationMinutes)
      };
    }
    return {
      startMinutes: dragState.targetStartMinutes,
      endMinutes: dragState.targetEndMinutes
    };
  }

  function rememberOriginalStyle(element) {
    if (dragState.originalStyles.has(element)) {
      return;
    }
    dragState.originalStyles.set(element, {
      width: element.style.width,
      left: element.style.left,
      visibility: element.style.visibility
    });
  }

  function restoreTemporaryStyles() {
    dragState.originalStyles.forEach((value, element) => {
      element.style.width = value.width;
      element.style.left = value.left;
      element.style.visibility = value.visibility;
    });
    dragState.originalStyles.clear();
  }

  function ensurePreview(parentColumn) {
    if (!(dragState.preview instanceof HTMLElement)) {
      const preview = document.createElement("div");
      preview.className = "day-column__move-preview";
      dragState.preview = preview;
    }
    dragState.preview.style.setProperty("--event-color", dragState.eventColor);
    if (dragState.preview.parentElement !== parentColumn) {
      parentColumn.appendChild(dragState.preview);
    }
    return dragState.preview;
  }

  function applyItemPosition(item) {
    const widthPercent = 100 / item.totalColumns;
    rememberOriginalStyle(item.element);
    item.element.style.width = `calc(${widthPercent}% - 4px)`;
    item.element.style.left = `calc(${item.column * widthPercent}% + 2px)`;
  }

  function layoutColumnItems(targetColumn, { includeGhost = false } = {}) {
    const blocks = Array.from(targetColumn.querySelectorAll(".event-block"));
    const items = [];

    blocks.forEach((block) => {
      if (!(block instanceof HTMLElement)) {
        return;
      }
      if (block.dataset.eventId === dragState.eventId) {
        return;
      }
      const range = readEventBlockRange(block);
      if (!range) {
        return;
      }
      items.push({
        element: block,
        startMinutes: range.startMinutes,
        endMinutes: range.endMinutes
      });
    });

    if (includeGhost && dragState.preview instanceof HTMLElement) {
      const ghost = previewRange();
      items.push({
        element: dragState.preview,
        startMinutes: ghost.startMinutes,
        endMinutes: ghost.endMinutes
      });
    }

    layoutItems(items).forEach(applyItemPosition);
  }

  function renderMovingLayout(clientX, clientY) {
    const targetColumn = resolveColumnFromPoint(clientX, clientY) ?? dragState.sourceColumn;
    if (!(targetColumn instanceof HTMLElement)) {
      return;
    }

    const targetDate = targetColumn.dataset.date;
    if (!targetDate) {
      return;
    }

    const rect = targetColumn.getBoundingClientRect();
    const rawStart = roundNearest(pointerToMinutes(clientY, rect, pixelsPerHour), TIME_STEP_MINUTES);
    const startMinutes = clampStartForDuration(rawStart, dragState.durationMinutes);

    dragState.targetColumn = targetColumn;
    dragState.targetDate = targetDate;
    dragState.targetStartMinutes = startMinutes;

    const preview = ensurePreview(targetColumn);
    preview.style.top = `${(startMinutes / MINUTES_PER_HOUR) * pixelsPerHour}px`;
    preview.style.height = `${Math.max((dragState.durationMinutes / MINUTES_PER_HOUR) * pixelsPerHour, 18)}px`;

    restoreTemporaryStyles();

    if (dragState.draggedElement instanceof HTMLElement) {
      rememberOriginalStyle(dragState.draggedElement);
      dragState.draggedElement.style.visibility = "hidden";
    }

    if (dragState.sourceColumn instanceof HTMLElement) {
      layoutColumnItems(dragState.sourceColumn, {
        includeGhost: dragState.sourceColumn === targetColumn
      });
    }

    if (targetColumn !== dragState.sourceColumn) {
      layoutColumnItems(targetColumn, { includeGhost: true });
    }
  }

  function renderResizingLayout(clientY) {
    const targetColumn = dragState.sourceColumn;
    if (!(targetColumn instanceof HTMLElement)) {
      return;
    }

    const targetDate = targetColumn.dataset.date;
    if (!targetDate) {
      return;
    }

    dragState.targetColumn = targetColumn;
    dragState.targetDate = targetDate;

    const rect = targetColumn.getBoundingClientRect();
    const rawMinutes = roundNearest(pointerToMinutes(clientY, rect, pixelsPerHour), TIME_STEP_MINUTES);
    if (dragState.mode === "resize-top") {
      dragState.targetStartMinutes = clamp(rawMinutes, 0, dragState.targetEndMinutes - MIN_SELECTION_MINUTES);
    } else {
      dragState.targetEndMinutes = clamp(rawMinutes, dragState.targetStartMinutes + MIN_SELECTION_MINUTES, MINUTES_PER_DAY);
    }

    const preview = ensurePreview(targetColumn);
    const range = previewRange();
    preview.style.top = `${(range.startMinutes / MINUTES_PER_HOUR) * pixelsPerHour}px`;
    preview.style.height = `${Math.max(((range.endMinutes - range.startMinutes) / MINUTES_PER_HOUR) * pixelsPerHour, 18)}px`;

    restoreTemporaryStyles();
    if (dragState.draggedElement instanceof HTMLElement) {
      rememberOriginalStyle(dragState.draggedElement);
      dragState.draggedElement.style.visibility = "hidden";
    }
    layoutColumnItems(targetColumn, { includeGhost: true });
  }

  function stopDrag() {
    window.removeEventListener("pointermove", handlePointerMove, true);
    window.removeEventListener("pointerup", handlePointerUp, true);
    window.removeEventListener("pointercancel", stopDrag, true);

    restoreTemporaryStyles();
    dragState.preview?.remove();

    dragState.pointerId = null;
    dragState.dragging = false;
    dragState.mode = "move";
    dragState.eventId = null;
    dragState.sourceColumn = null;
    dragState.targetColumn = null;
    dragState.targetDate = null;
    dragState.targetStartMinutes = 0;
    dragState.targetEndMinutes = MIN_SELECTION_MINUTES;
    dragState.durationMinutes = MIN_SELECTION_MINUTES;
    dragState.eventColor = "#007aff";
    dragState.draggedElement = null;
  }

  function handlePointerMove(pointerEvent) {
    if (pointerEvent.pointerId !== dragState.pointerId) {
      return;
    }

    if (!dragState.dragging) {
      const deltaX = Math.abs(pointerEvent.clientX - dragState.startX);
      const deltaY = Math.abs(pointerEvent.clientY - dragState.startY);
      if (Math.max(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
        return;
      }
      dragState.dragging = true;
    }

    if (dragState.mode === "move") {
      renderMovingLayout(pointerEvent.clientX, pointerEvent.clientY);
      return;
    }
    renderResizingLayout(pointerEvent.clientY);
  }

  async function handlePointerUp(pointerEvent) {
    if (pointerEvent.pointerId !== dragState.pointerId) {
      return;
    }

    const didDrag = dragState.dragging
      && Boolean(dragState.eventId)
      && Boolean(dragState.targetDate);

    if (didDrag && dragState.mode === "move") {
      const endMinutes = Math.min(MINUTES_PER_DAY, dragState.targetStartMinutes + dragState.durationMinutes);
      await onEventMove({
        eventId: dragState.eventId,
        date: dragState.targetDate,
        startTime: formatTimeFromMinutes(dragState.targetStartMinutes),
        endTime: endMinutes >= MINUTES_PER_DAY ? "23:59" : formatTimeFromMinutes(endMinutes)
      });
    }
    if (didDrag && dragState.mode !== "move") {
      await onEventResize({
        eventId: dragState.eventId,
        date: dragState.targetDate,
        startTime: formatTimeFromMinutes(dragState.targetStartMinutes),
        endTime: dragState.targetEndMinutes >= MINUTES_PER_DAY ? "23:59" : formatTimeFromMinutes(dragState.targetEndMinutes)
      });
    }

    stopDrag();
  }

  return (pointerEvent, event, element) => {
    if (pointerEvent.button !== 0 || !(element instanceof HTMLElement)) {
      return;
    }

    dragState.pointerId = pointerEvent.pointerId;
    dragState.mode = resolveDragMode(pointerEvent, element);
    dragState.startX = pointerEvent.clientX;
    dragState.startY = pointerEvent.clientY;
    dragState.eventId = event.id;
    dragState.eventColor = event.color ?? "#007aff";
    const range = readEventBlockRange(element);
    const startMinutes = range?.startMinutes ?? roundNearest(event.startMinutes ?? 0, TIME_STEP_MINUTES);
    const endMinutes = range?.endMinutes ?? Math.min(MINUTES_PER_DAY, startMinutes + eventDurationMinutes(event));
    dragState.durationMinutes = Math.max(MIN_SELECTION_MINUTES, endMinutes - startMinutes);
    dragState.sourceColumn = column;
    dragState.targetColumn = column;
    dragState.targetDate = column.dataset.date ?? null;
    dragState.targetStartMinutes = startMinutes;
    dragState.targetEndMinutes = endMinutes;
    dragState.draggedElement = element;

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", stopDrag, true);
  };
}
