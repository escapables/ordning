import {
  DRAG_THRESHOLD_PX,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MIN_SELECTION_MINUTES,
  TIME_STEP_MINUTES,
  clamp,
  eventDurationMinutes,
  pointerToMinutes,
  readEventBlockRange,
  resolveColumnFromPoint,
  roundNearest
} from "./drag-time-utils.js";
import { layoutOverlapItems } from "./drag-overlap-layout.js";
import {
  addDaysToDateKey,
  applyItemPosition,
  ensurePreview,
  findColumnByDate,
  rememberOriginalStyle,
  restoreTemporaryStyles
} from "./drag-dom-helpers.js";
import {
  buildResizePayload,
  buildTimedPayload,
  resolveAbsoluteEndMinutes,
  resolveDraggedEndMinutes
} from "./drag-payload-utils.js";
export function createEventMovePointerDownHandler(column, pixelsPerHour, handlers = {}) {
  const { onEventMove = async () => {}, onEventResize = async () => {} } = handlers;
  const dragState = {
    pointerId: null,
    dragging: false,
    mode: "move",
    startX: 0,
    startY: 0,
    eventId: null,
    eventDate: null,
    eventClockStart: "00:00",
    eventClockEnd: "00:00",
    eventEndDate: null,
    eventColor: "#007aff",
    durationMinutes: MIN_SELECTION_MINUTES,
    draggedElements: [],
    sourceColumn: null,
    targetColumn: null,
    targetDate: null,
    targetStartMinutes: 0,
    targetEndMinutes: MIN_SELECTION_MINUTES,
    initialStartMinutes: 0,
    initialEndMinutes: MIN_SELECTION_MINUTES,
    draggedElement: null,
    preview: null,
    neighborEventId: null,
    neighborEventDate: null,
    neighborClockStart: "00:00",
    neighborClockEnd: "00:00",
    neighborStartMinutes: 0,
    neighborEndMinutes: 0,
    neighborTargetStartMinutes: 0,
    neighborTargetEndMinutes: 0,
    neighborElement: null,
    neighborPreview: null,
    originalStyles: new Map(),
    clickOffsetMinutes: 0
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
  function neighborPreviewRange() {
    return {
      startMinutes: dragState.neighborTargetStartMinutes,
      endMinutes: dragState.neighborTargetEndMinutes
    };
  }
  function findLinkedNeighbor() {
    if (!(dragState.sourceColumn instanceof HTMLElement)) {
      return null;
    }
    const candidates = Array.from(dragState.sourceColumn.querySelectorAll(".event-block"))
      .filter((block) => block instanceof HTMLElement)
      .map((block) => {
        const range = readEventBlockRange(block);
        if (!range || !block.dataset.eventId || block.dataset.eventId === dragState.eventId) {
          return null;
        }
        return {
          id: block.dataset.eventId,
          date: block.dataset.eventDate ?? null,
          clockStart: block.dataset.clockStart ?? "00:00",
          clockEnd: block.dataset.clockEnd ?? "00:00",
          startMinutes: range.startMinutes,
          endMinutes: resolveAbsoluteEndMinutes(block, range.endMinutes),
          element: block
        };
      })
      .filter((item) => item);
    if (dragState.mode === "resize-bottom") {
      const neighbor = candidates
        .filter((item) => item.startMinutes === dragState.initialEndMinutes)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
      return neighbor ?? null;
    }
    if (dragState.mode === "resize-top") {
      const neighbor = candidates
        .filter((item) => item.endMinutes === dragState.initialStartMinutes)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
      return neighbor ?? null;
    }
    return null;
  }
  function layoutColumnItems(targetColumn, { includeGhost = false } = {}) {
    const blocks = Array.from(targetColumn.querySelectorAll(".event-block"));
    const items = [];
    blocks.forEach((block) => {
      if (!(block instanceof HTMLElement)) {
        return;
      }
      if (block.dataset.eventId === dragState.eventId || block.dataset.eventId === dragState.neighborEventId) {
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
    if (
      includeGhost
      && dragState.preview instanceof HTMLElement
      && dragState.preview.parentElement === targetColumn
    ) {
      const ghost = previewRange();
      items.push({
        element: dragState.preview,
        startMinutes: ghost.startMinutes,
        endMinutes: ghost.endMinutes
      });
    }
    if (
      includeGhost
      && dragState.neighborPreview instanceof HTMLElement
      && dragState.neighborPreview.parentElement === targetColumn
    ) {
      const ghost = neighborPreviewRange();
      items.push({
        element: dragState.neighborPreview,
        startMinutes: ghost.startMinutes,
        endMinutes: ghost.endMinutes
      });
    }
    layoutOverlapItems(items).forEach((item) => {
      applyItemPosition(dragState, item);
    });
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
    const rawStart = roundNearest(pointerToMinutes(clientY, rect, pixelsPerHour) - dragState.clickOffsetMinutes, TIME_STEP_MINUTES);
    const startMinutes = clamp(rawStart, 0, MINUTES_PER_DAY - TIME_STEP_MINUTES);
    const absoluteEndMinutes = startMinutes + dragState.durationMinutes;
    const overflowEndMinutes = Math.min(MINUTES_PER_DAY, Math.max(absoluteEndMinutes - MINUTES_PER_DAY, 0));
    const overflowDate = addDaysToDateKey(targetDate, 1);
    const overflowColumn = overflowEndMinutes > 0 ? findColumnByDate(column, overflowDate) : null;
    dragState.targetColumn = targetColumn;
    dragState.targetDate = targetDate;
    dragState.targetStartMinutes = startMinutes;
    const preview = ensurePreview(dragState, "preview", targetColumn);
    preview.style.top = `${(startMinutes / MINUTES_PER_HOUR) * pixelsPerHour}px`;
    preview.style.height = `${Math.max(((Math.min(absoluteEndMinutes, MINUTES_PER_DAY) - startMinutes) / MINUTES_PER_HOUR) * pixelsPerHour, 18)}px`;
    if (overflowColumn instanceof HTMLElement) {
      dragState.neighborTargetStartMinutes = 0;
      dragState.neighborTargetEndMinutes = overflowEndMinutes;
      const overflowPreview = ensurePreview(dragState, "neighborPreview", overflowColumn);
      overflowPreview.style.top = "0px";
      overflowPreview.style.height = `${Math.max((overflowEndMinutes / MINUTES_PER_HOUR) * pixelsPerHour, 18)}px`;
    } else {
      dragState.neighborTargetStartMinutes = 0;
      dragState.neighborTargetEndMinutes = 0;
      dragState.neighborPreview?.remove();
    }
    restoreTemporaryStyles(dragState);
    dragState.draggedElements.forEach((eventElement) => {
      if (!(eventElement instanceof HTMLElement)) {
        return;
      }
      rememberOriginalStyle(dragState, eventElement);
      eventElement.style.visibility = "hidden";
    });
    const columnsToLayout = new Set(
      dragState.draggedElements
        .map((eventElement) => eventElement.closest(".day-column"))
        .filter((candidate) => candidate instanceof HTMLElement)
    );
    columnsToLayout.add(targetColumn);
    if (overflowColumn instanceof HTMLElement) {
      columnsToLayout.add(overflowColumn);
    }
    columnsToLayout.forEach((candidateColumn) => {
      layoutColumnItems(candidateColumn, { includeGhost: true });
    });
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
      const minStart = dragState.neighborEventId
        ? dragState.neighborStartMinutes + MIN_SELECTION_MINUTES
        : 0;
      const maxStart = Math.min(
        dragState.targetEndMinutes - MIN_SELECTION_MINUTES,
        MINUTES_PER_DAY - MIN_SELECTION_MINUTES
      );
      dragState.targetStartMinutes = clamp(rawMinutes, minStart, maxStart);
    } else {
      const maxEnd = dragState.neighborEventId
        ? dragState.neighborEndMinutes - MIN_SELECTION_MINUTES
        : MINUTES_PER_DAY;
      dragState.targetEndMinutes = clamp(rawMinutes, dragState.targetStartMinutes + MIN_SELECTION_MINUTES, maxEnd);
    }
    if (dragState.neighborEventId) {
      if (dragState.mode === "resize-top") {
        dragState.neighborTargetStartMinutes = dragState.neighborStartMinutes;
        dragState.neighborTargetEndMinutes = dragState.targetStartMinutes;
      } else {
        dragState.neighborTargetStartMinutes = dragState.targetEndMinutes;
        dragState.neighborTargetEndMinutes = dragState.neighborEndMinutes;
      }
    }
    const preview = ensurePreview(dragState, "preview", targetColumn);
    const range = previewRange();
    preview.style.top = `${(range.startMinutes / MINUTES_PER_HOUR) * pixelsPerHour}px`;
    preview.style.height = `${Math.max(((range.endMinutes - range.startMinutes) / MINUTES_PER_HOUR) * pixelsPerHour, 18)}px`;
    restoreTemporaryStyles(dragState);
    if (dragState.draggedElement instanceof HTMLElement) {
      rememberOriginalStyle(dragState, dragState.draggedElement);
      dragState.draggedElement.style.visibility = "hidden";
    }
    if (dragState.neighborElement instanceof HTMLElement) {
      rememberOriginalStyle(dragState, dragState.neighborElement);
      dragState.neighborElement.style.visibility = "hidden";
      const neighborPreview = ensurePreview(dragState, "neighborPreview", targetColumn);
      const neighborRange = neighborPreviewRange();
      neighborPreview.style.top = `${(neighborRange.startMinutes / MINUTES_PER_HOUR) * pixelsPerHour}px`;
      neighborPreview.style.height = `${Math.max(((neighborRange.endMinutes - neighborRange.startMinutes) / MINUTES_PER_HOUR) * pixelsPerHour, 18)}px`;
    } else {
      dragState.neighborPreview?.remove();
    }
    layoutColumnItems(targetColumn, { includeGhost: true });
  }
  function stopDrag() {
    window.removeEventListener("pointermove", handlePointerMove, true);
    window.removeEventListener("pointerup", handlePointerUp, true);
    window.removeEventListener("pointercancel", stopDrag, true);
    if (dragState.pointerId !== null && typeof column.releasePointerCapture === "function") {
      try { column.releasePointerCapture(dragState.pointerId); } catch (_error) {}
    }
    restoreTemporaryStyles(dragState);
    dragState.preview?.remove();
    dragState.neighborPreview?.remove();
    dragState.pointerId = null;
    dragState.dragging = false;
    dragState.mode = "move";
    dragState.eventId = null;
    dragState.eventDate = null;
    dragState.eventClockStart = "00:00";
    dragState.eventClockEnd = "00:00";
    dragState.eventEndDate = null;
    dragState.sourceColumn = null;
    dragState.targetColumn = null;
    dragState.targetDate = null;
    dragState.targetStartMinutes = 0;
    dragState.targetEndMinutes = MIN_SELECTION_MINUTES;
    dragState.initialStartMinutes = 0;
    dragState.initialEndMinutes = MIN_SELECTION_MINUTES;
    dragState.durationMinutes = MIN_SELECTION_MINUTES;
    dragState.eventColor = "#007aff";
    dragState.draggedElement = null;
    dragState.draggedElements = [];
    dragState.neighborEventId = null;
    dragState.neighborEventDate = null;
    dragState.neighborClockStart = "00:00";
    dragState.neighborClockEnd = "00:00";
    dragState.neighborStartMinutes = 0;
    dragState.neighborEndMinutes = 0;
    dragState.neighborTargetStartMinutes = 0;
    dragState.neighborTargetEndMinutes = 0;
    dragState.neighborElement = null;
    dragState.clickOffsetMinutes = 0;
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
      if (typeof column.setPointerCapture === "function") {
        try { column.setPointerCapture(pointerEvent.pointerId); } catch (_error) {}
      }
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
      const endMinutes = dragState.targetStartMinutes + dragState.durationMinutes;
      await onEventMove(buildTimedPayload({
        eventId: dragState.eventId,
        date: dragState.targetDate,
        startMinutes: dragState.targetStartMinutes,
        endMinutes
      }));
    }
    if (didDrag && dragState.mode !== "move") {
      const payload = buildResizePayload({
        eventId: dragState.eventId,
        date: dragState.targetDate,
        startMinutes: dragState.targetStartMinutes,
        endMinutes: dragState.targetEndMinutes,
        anchorDate: dragState.eventDate,
        clockStart: dragState.eventClockStart,
        clockEnd: dragState.eventClockEnd,
        eventEndDate: dragState.eventEndDate
      });
      payload.linkedNeighbor = dragState.neighborEventId
        ? buildResizePayload({
          eventId: dragState.neighborEventId,
          date: dragState.targetDate,
          startMinutes: dragState.neighborTargetStartMinutes,
          endMinutes: dragState.neighborTargetEndMinutes,
          anchorDate: dragState.neighborEventDate,
          clockStart: dragState.neighborClockStart,
          clockEnd: dragState.neighborClockEnd
        })
        : null;
      await onEventResize(payload);
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
    dragState.eventDate = event.date ?? null;
    dragState.eventClockStart = event.startTime ?? "00:00";
    dragState.eventClockEnd = event.endTime ?? "00:00";
    dragState.eventEndDate = event.endDate ?? null;
    dragState.eventColor = event.color ?? "#007aff";
    const range = readEventBlockRange(element);
    const startMinutes = range?.startMinutes ?? roundNearest(event.startMinutes ?? 0, TIME_STEP_MINUTES);
    const rawEndMinutes = range?.endMinutes ?? Math.min(MINUTES_PER_DAY, startMinutes + eventDurationMinutes(event));
    const absoluteEndMinutes = resolveAbsoluteEndMinutes(element, rawEndMinutes);
    const endMinutes = dragState.mode === "move"
      ? resolveDraggedEndMinutes(event, absoluteEndMinutes, startMinutes)
      : absoluteEndMinutes;
    const fullDurationMinutes = eventDurationMinutes(event);
    dragState.durationMinutes = Math.max(
      MIN_SELECTION_MINUTES,
      dragState.mode === "move" ? fullDurationMinutes : endMinutes - startMinutes
    );
    if (dragState.mode === "move") {
      const columnRect = column.getBoundingClientRect();
      dragState.clickOffsetMinutes = pointerToMinutes(pointerEvent.clientY, columnRect, pixelsPerHour) - startMinutes;
    }
    dragState.sourceColumn = column;
    dragState.targetColumn = column;
    dragState.targetDate = column.dataset.date ?? null;
    dragState.targetStartMinutes = startMinutes;
    dragState.targetEndMinutes = endMinutes;
    dragState.initialStartMinutes = startMinutes;
    dragState.initialEndMinutes = endMinutes;
    dragState.draggedElement = element;
    const scope = element.closest(".week-grid") ?? document;
    dragState.draggedElements = Array.from(
      scope.querySelectorAll(`.event-block[data-event-id="${event.id}"]`)
    ).filter((eventElement) => eventElement instanceof HTMLElement);
    const neighbor = findLinkedNeighbor();
    if (neighbor) {
      dragState.neighborEventId = neighbor.id;
      dragState.neighborEventDate = neighbor.date;
      dragState.neighborClockStart = neighbor.clockStart;
      dragState.neighborClockEnd = neighbor.clockEnd;
      dragState.neighborStartMinutes = neighbor.startMinutes;
      dragState.neighborEndMinutes = neighbor.endMinutes;
      dragState.neighborTargetStartMinutes = neighbor.startMinutes;
      dragState.neighborTargetEndMinutes = neighbor.endMinutes;
      dragState.neighborElement = neighbor.element;
    } else {
      dragState.neighborEventId = null;
      dragState.neighborEventDate = null;
      dragState.neighborClockStart = "00:00";
      dragState.neighborClockEnd = "00:00";
      dragState.neighborStartMinutes = 0;
      dragState.neighborEndMinutes = 0;
      dragState.neighborTargetStartMinutes = 0;
      dragState.neighborTargetEndMinutes = 0;
      dragState.neighborElement = null;
    }
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", stopDrag, true);
  };
}
