import {
  DRAG_THRESHOLD_PX,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MIN_SELECTION_MINUTES,
  TIME_STEP_MINUTES,
  clamp,
  eventDurationMinutes,
  parseTimeToMinutes,
  pointerToMinutes,
  readEventBlockRange,
  resolveColumnFromPoint,
  roundNearest
} from "./drag-time-utils.js";
import { layoutOverlapItems } from "./drag-overlap-layout.js";
import {
  addDaysToDateKey,
  applyItemPosition,
  computeEventSpans,
  ensurePreview,
  ensureSpanGhost,
  findColumnByDate,
  rememberOriginalStyle,
  restoreTemporaryStyles,
  trimSpanGhosts
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
    eventStartDate: null,
    eventColor: "#007aff",
    durationMinutes: MIN_SELECTION_MINUTES,
    draggedElements: [],
    spanPreviews: [],
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
  function resolveDayOffset(fromDate, toDate) {
    const fromValue = Date.parse(`${fromDate ?? ""}T00:00:00`); const toValue = Date.parse(`${toDate ?? ""}T00:00:00`);
    return Number.isFinite(fromValue) && Number.isFinite(toValue) ? Math.round((toValue - fromValue) / 86400000) : 0;
  }
  function resolveDragMode(pointerEvent, element) {
    const rect = element.getBoundingClientRect();
    return pointerEvent.clientY - rect.top <= 6 ? "resize-top" : rect.bottom - pointerEvent.clientY <= 6 ? "resize-bottom" : "move";
  }
  function previewRange() {
    if (dragState.mode === "move") return { startMinutes: Math.max(0, dragState.targetStartMinutes), endMinutes: Math.min(MINUTES_PER_DAY, dragState.targetStartMinutes + dragState.durationMinutes) };
    const s = dragState.targetStartMinutes, e = dragState.targetEndMinutes;
    if (s < 0) return { startMinutes: s + MINUTES_PER_DAY, endMinutes: MINUTES_PER_DAY };
    if (e > MINUTES_PER_DAY) return { startMinutes: s, endMinutes: MINUTES_PER_DAY };
    return { startMinutes: s, endMinutes: e };
  }
  function neighborPreviewRange() { return { startMinutes: dragState.neighborTargetStartMinutes, endMinutes: dragState.neighborTargetEndMinutes }; }
  function positionGhost(ghost, startMin, endMin) {
    ghost.style.top = `${(startMin / MINUTES_PER_HOUR) * pixelsPerHour}px`;
    ghost.style.height = `${Math.max(((endMin - startMin) / MINUTES_PER_HOUR) * pixelsPerHour, 18)}px`;
    ghost.dataset.startMinutes = String(startMin);
    ghost.dataset.endMinutes = String(endMin);
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
  function addGhostItem(items, ghost, rangeFn, col) {
    if (ghost instanceof HTMLElement && ghost.parentElement === col) {
      const r = rangeFn ? rangeFn() : readEventBlockRange(ghost);
      if (r) items.push({ element: ghost, startMinutes: r.startMinutes, endMinutes: r.endMinutes });
    }
  }
  function layoutColumnItems(targetColumn, { includeGhost = false } = {}) {
    const items = [];
    Array.from(targetColumn.querySelectorAll(".event-block")).forEach((block) => {
      if (!(block instanceof HTMLElement)) return;
      if (block.dataset.eventId === dragState.eventId || block.dataset.eventId === dragState.neighborEventId) return;
      const range = readEventBlockRange(block);
      if (range) items.push({ element: block, startMinutes: range.startMinutes, endMinutes: range.endMinutes });
    });
    if (includeGhost) {
      addGhostItem(items, dragState.preview, previewRange, targetColumn);
      addGhostItem(items, dragState.neighborPreview, neighborPreviewRange, targetColumn);
      dragState.spanPreviews.forEach((g) => addGhostItem(items, g, null, targetColumn));
    }
    layoutOverlapItems(items).forEach((item) => applyItemPosition(dragState, item));
  }
  function renderSpanGhosts(spans) {
    const ghostCols = new Set();
    spans.forEach((span, i) => {
      const col = findColumnByDate(column, span.dateKey);
      if (!(col instanceof HTMLElement)) return;
      ghostCols.add(col);
      const ghost = i < 2
        ? ensurePreview(dragState, i === 0 ? "preview" : "neighborPreview", col)
        : ensureSpanGhost(dragState, i - 2, col);
      positionGhost(ghost, span.startMinutes, span.endMinutes);
    });
    if (spans.length < 2) dragState.neighborPreview?.remove();
    trimSpanGhosts(dragState, Math.max(0, spans.length - 2));
    if (spans.length > 1) {
      dragState.neighborTargetStartMinutes = spans[1].startMinutes;
      dragState.neighborTargetEndMinutes = spans[1].endMinutes;
    } else {
      dragState.neighborTargetStartMinutes = 0;
      dragState.neighborTargetEndMinutes = 0;
    }
    return ghostCols;
  }
  function renderMovingLayout(clientX, clientY) {
    const targetColumn = resolveColumnFromPoint(clientX, clientY) ?? dragState.sourceColumn;
    if (!(targetColumn instanceof HTMLElement)) return;
    const targetDate = targetColumn.dataset.date;
    if (!targetDate) return;
    const rect = targetColumn.getBoundingClientRect();
    const rawStart = roundNearest(pointerToMinutes(clientY, rect, pixelsPerHour) - dragState.clickOffsetMinutes, TIME_STEP_MINUTES);
    const minStart = -(dragState.durationMinutes - TIME_STEP_MINUTES);
    const startMinutes = clamp(rawStart, minStart, MINUTES_PER_DAY - TIME_STEP_MINUTES);
    dragState.targetColumn = targetColumn;
    dragState.targetDate = targetDate;
    dragState.targetStartMinutes = startMinutes;
    const ghostColumns = renderSpanGhosts(computeEventSpans(targetDate, startMinutes, dragState.durationMinutes));
    restoreTemporaryStyles(dragState);
    dragState.draggedElements.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      rememberOriginalStyle(dragState, el);
      el.style.visibility = "hidden";
    });
    const columnsToLayout = new Set(
      dragState.draggedElements.map((el) => el.closest(".day-column")).filter((c) => c instanceof HTMLElement)
    );
    ghostColumns.forEach((c) => columnsToLayout.add(c));
    columnsToLayout.forEach((c) => layoutColumnItems(c, { includeGhost: true }));
  }
  function renderResizingLayout(clientX, clientY) {
    const sourceColumn = dragState.sourceColumn;
    const sourceDate = sourceColumn?.dataset.date;
    if (!(sourceColumn instanceof HTMLElement) || !sourceDate) return;
    const pointedColumn = resolveColumnFromPoint(clientX, clientY);
    const pointedDate = pointedColumn?.dataset.date ?? sourceDate;
    const rawDayOffset = resolveDayOffset(sourceDate, pointedDate);
    const isMultiDay = dragState.eventStartDate && dragState.eventEndDate
      && dragState.eventStartDate !== dragState.eventEndDate;
    const startDayBound = dragState.eventStartDate ? resolveDayOffset(sourceDate, dragState.eventStartDate) : 0;
    const endDayBound = dragState.eventEndDate ? resolveDayOffset(sourceDate, dragState.eventEndDate) : 0;
    const dayOffset = dragState.mode === "resize-top"
      ? clamp(rawDayOffset, -6, Math.max(0, endDayBound))
      : clamp(rawDayOffset, Math.min(0, startDayBound), 6);
    const targetDate = dayOffset ? addDaysToDateKey(sourceDate, dayOffset) : sourceDate;
    const targetColumn = dayOffset ? findColumnByDate(column, targetDate) ?? sourceColumn : sourceColumn;
    dragState.targetColumn = targetColumn;
    dragState.targetDate = targetDate;
    const rect = targetColumn.getBoundingClientRect();
    const rawMinutes = roundNearest(pointerToMinutes(clientY, rect, pixelsPerHour), TIME_STEP_MINUTES) + (dayOffset * MINUTES_PER_DAY);
    const keepLinkedNeighbor = Boolean(dragState.neighborEventId) && dayOffset === 0;
    const sourceDayFromStart = isMultiDay ? resolveDayOffset(dragState.eventStartDate, sourceDate) : 0;
    if (dragState.mode === "resize-top") {
      const minStart = keepLinkedNeighbor
        ? dragState.neighborStartMinutes + MIN_SELECTION_MINUTES
        : dayOffset < 0 ? dayOffset * MINUTES_PER_DAY : 0;
      const maxStart = isMultiDay && !keepLinkedNeighbor
        ? endDayBound * MINUTES_PER_DAY + parseTimeToMinutes(dragState.eventClockEnd) - MIN_SELECTION_MINUTES
        : dragState.targetEndMinutes - MIN_SELECTION_MINUTES;
      dragState.targetStartMinutes = clamp(rawMinutes, minStart, maxStart);
    } else {
      const minEnd = isMultiDay && !keepLinkedNeighbor
        ? -sourceDayFromStart * MINUTES_PER_DAY + parseTimeToMinutes(dragState.eventClockStart) + MIN_SELECTION_MINUTES
        : dragState.targetStartMinutes + MIN_SELECTION_MINUTES;
      const maxEnd = keepLinkedNeighbor
        ? dragState.neighborEndMinutes - MIN_SELECTION_MINUTES
        : dayOffset > 0 ? (1 + dayOffset) * MINUTES_PER_DAY : MINUTES_PER_DAY;
      dragState.targetEndMinutes = clamp(rawMinutes, minEnd, maxEnd);
    }
    if ((isMultiDay || Math.abs(dayOffset) > 0) && !keepLinkedNeighbor) {
      const startClock = parseTimeToMinutes(dragState.eventClockStart);
      const endAbs = resolveDayOffset(dragState.eventStartDate, dragState.eventEndDate) * MINUTES_PER_DAY
        + parseTimeToMinutes(dragState.eventClockEnd);
      const spanClock = dragState.mode === "resize-top"
        ? sourceDayFromStart * MINUTES_PER_DAY + dragState.targetStartMinutes : startClock;
      const spanEnd = dragState.mode === "resize-top"
        ? endAbs : sourceDayFromStart * MINUTES_PER_DAY + dragState.targetEndMinutes;
      renderSpanGhosts(computeEventSpans(dragState.eventStartDate, spanClock, Math.max(MIN_SELECTION_MINUTES, spanEnd - spanClock)));
    } else {
      if (keepLinkedNeighbor) {
        if (dragState.mode === "resize-top") {
          dragState.neighborTargetStartMinutes = dragState.neighborStartMinutes;
          dragState.neighborTargetEndMinutes = dragState.targetStartMinutes;
        } else {
          dragState.neighborTargetStartMinutes = dragState.targetEndMinutes;
          dragState.neighborTargetEndMinutes = dragState.neighborEndMinutes;
        }
      }
      const isCrossColumn = dayOffset !== 0;
      if (isCrossColumn && !keepLinkedNeighbor) {
        dragState.neighborTargetStartMinutes = 0;
        dragState.neighborTargetEndMinutes = dragState.mode === "resize-bottom"
          ? dragState.targetEndMinutes - MINUTES_PER_DAY : dragState.targetEndMinutes;
      }
      if (dragState.mode === "resize-top" && isCrossColumn) {
        positionGhost(ensurePreview(dragState, "preview", targetColumn), dragState.targetStartMinutes + MINUTES_PER_DAY, MINUTES_PER_DAY);
        positionGhost(ensurePreview(dragState, "neighborPreview", sourceColumn), 0, dragState.targetEndMinutes);
      } else if (dragState.mode === "resize-bottom" && isCrossColumn) {
        positionGhost(ensurePreview(dragState, "preview", sourceColumn), dragState.targetStartMinutes, MINUTES_PER_DAY);
        positionGhost(ensurePreview(dragState, "neighborPreview", targetColumn), 0, dragState.targetEndMinutes - MINUTES_PER_DAY);
      } else {
        const range = previewRange();
        positionGhost(ensurePreview(dragState, "preview", targetColumn), range.startMinutes, range.endMinutes);
        if (keepLinkedNeighbor) {
          const nr = neighborPreviewRange();
          positionGhost(ensurePreview(dragState, "neighborPreview", targetColumn), nr.startMinutes, nr.endMinutes);
        } else {
          dragState.neighborPreview?.remove();
        }
      }
      const ghostedCols = new Set([sourceColumn, targetColumn].filter((c) => c instanceof HTMLElement));
      let spanIdx = 0;
      dragState.draggedElements.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        const col = el.closest(".day-column");
        if (!(col instanceof HTMLElement) || ghostedCols.has(col)) return;
        ghostedCols.add(col);
        const range = readEventBlockRange(el);
        if (!range) return;
        positionGhost(ensureSpanGhost(dragState, spanIdx, col), range.startMinutes, range.endMinutes);
        spanIdx += 1;
      });
      trimSpanGhosts(dragState, spanIdx);
    }
    restoreTemporaryStyles(dragState);
    dragState.draggedElements.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      rememberOriginalStyle(dragState, el);
      el.style.visibility = "hidden";
    });
    if (keepLinkedNeighbor && dragState.neighborElement instanceof HTMLElement) {
      rememberOriginalStyle(dragState, dragState.neighborElement);
      dragState.neighborElement.style.visibility = "hidden";
    }
    const layoutCols = [sourceColumn, targetColumn, ...dragState.draggedElements.map((el) => el.closest(".day-column"))].filter((c) => c instanceof HTMLElement);
    new Set(layoutCols).forEach((col) => layoutColumnItems(col, { includeGhost: true }));
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
    trimSpanGhosts(dragState, 0);
    Object.assign(dragState, {
      pointerId: null, dragging: false, mode: "move", eventId: null, eventDate: null,
      eventClockStart: "00:00", eventClockEnd: "00:00", eventEndDate: null, eventStartDate: null,
      eventColor: "#007aff", durationMinutes: MIN_SELECTION_MINUTES, draggedElement: null,
      draggedElements: [], spanPreviews: [], sourceColumn: null, targetColumn: null,
      targetDate: null, targetStartMinutes: 0, targetEndMinutes: MIN_SELECTION_MINUTES,
      initialStartMinutes: 0, initialEndMinutes: MIN_SELECTION_MINUTES,
      neighborEventId: null, neighborEventDate: null, neighborClockStart: "00:00", neighborClockEnd: "00:00",
      neighborStartMinutes: 0, neighborEndMinutes: 0, neighborTargetStartMinutes: 0,
      neighborTargetEndMinutes: 0, neighborElement: null, clickOffsetMinutes: 0
    });
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
    renderResizingLayout(pointerEvent.clientX, pointerEvent.clientY);
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
      const sourceDate = dragState.sourceColumn?.dataset.date ?? dragState.targetDate;
      const keepLinkedNeighbor = dragState.neighborEventId && dragState.targetColumn === dragState.sourceColumn;
      const payload = dragState.mode === "resize-top"
        ? (() => {
          const p = buildTimedPayload({ eventId: dragState.eventId, date: sourceDate, startMinutes: dragState.targetStartMinutes, endMinutes: dragState.targetEndMinutes });
          if (dragState.eventEndDate && dragState.eventEndDate !== sourceDate) { p.endDate = dragState.eventEndDate; p.endTime = dragState.eventClockEnd; }
          return p;
        })()
        : buildResizePayload({
          eventId: dragState.eventId,
          date: sourceDate,
          startMinutes: dragState.targetStartMinutes,
          endMinutes: dragState.targetEndMinutes,
          anchorDate: dragState.eventDate,
          clockStart: dragState.eventClockStart,
          clockEnd: dragState.eventClockEnd,
          eventEndDate: dragState.eventEndDate
        });
      if (dragState.mode !== "resize-top" && dragState.eventStartDate && dragState.eventStartDate !== sourceDate) {
        payload.startDate = dragState.eventStartDate;
        payload.startTime = dragState.eventClockStart;
      }
      payload.linkedNeighbor = keepLinkedNeighbor
        ? buildResizePayload({
          eventId: dragState.neighborEventId,
          date: sourceDate,
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
    dragState.eventStartDate = event.startDate ?? event.date ?? null;
    dragState.eventColor = event.color ?? "#007aff";
    const range = readEventBlockRange(element);
    const startMinutes = range?.startMinutes ?? roundNearest(event.startMinutes ?? 0, TIME_STEP_MINUTES);
    const rawEndMinutes = range?.endMinutes ?? Math.min(MINUTES_PER_DAY, startMinutes + eventDurationMinutes(event));
    const segmentDateValue = Date.parse(`${column.dataset.date ?? event.date ?? ""}T00:00:00`);
    const startDateValue = Date.parse(`${event.startDate ?? ""}T00:00:00`);
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
      const dayOffset = Number.isFinite(segmentDateValue) && Number.isFinite(startDateValue)
        ? Math.round((segmentDateValue - startDateValue) / 86400000)
        : 0;
      const anchorStartMinutes = roundNearest(parseTimeToMinutes(event.startTime) - (dayOffset * MINUTES_PER_DAY), TIME_STEP_MINUTES);
      dragState.clickOffsetMinutes = pointerToMinutes(pointerEvent.clientY, columnRect, pixelsPerHour) - anchorStartMinutes;
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
