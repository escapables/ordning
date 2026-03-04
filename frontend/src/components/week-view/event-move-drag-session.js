import {
  DRAG_THRESHOLD_PX,
  MINUTES_PER_DAY,
  MIN_SELECTION_MINUTES,
  TIME_STEP_MINUTES,
  eventDurationMinutes,
  parseTimeToMinutes,
  pointerToMinutes,
  readEventBlockRange,
  roundNearest
} from "./drag-time-utils.js";
import {
  restoreTemporaryStyles,
  trimSpanGhosts
} from "./drag-dom-helpers.js";
import {
  buildResizePayload,
  buildTimedPayload,
  resolveAbsoluteEndMinutes,
  resolveDraggedEndMinutes
} from "./drag-payload-utils.js";
import { createEventMoveDragRenderer } from "./event-move-drag-render.js";

const DEFAULT_EVENT_COLOR = "#007aff";

function createInitialDragState() {
  return {
    pointerId: null,
    dragging: false,
    mode: "move",
    startX: 0,
    startY: 0,
    eventId: null,
    actionEventId: null,
    eventDate: null,
    isVirtual: false,
    eventClockStart: "00:00",
    eventClockEnd: "00:00",
    eventEndDate: null,
    eventStartDate: null,
    eventColor: DEFAULT_EVENT_COLOR,
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
}

function resetDragState(dragState) {
  Object.assign(dragState, createInitialDragState());
}

function resolveDragMode(pointerEvent, element) {
  const rect = element.getBoundingClientRect();
  if (pointerEvent.clientY - rect.top <= 6) {
    return "resize-top";
  }

  if (rect.bottom - pointerEvent.clientY <= 6) {
    return "resize-bottom";
  }

  return "move";
}

export function createEventMoveDragSession({
  column,
  pixelsPerHour,
  onEventMove = async () => {},
  onEventResize = async () => {}
}) {
  const dragState = createInitialDragState();
  const renderer = createEventMoveDragRenderer({
    column,
    pixelsPerHour,
    dragState
  });

  function stopDrag() {
    window.removeEventListener("pointermove", handlePointerMove, true);
    window.removeEventListener("pointerup", handlePointerUp, true);
    window.removeEventListener("pointercancel", stopDrag, true);

    if (dragState.pointerId !== null && typeof column.releasePointerCapture === "function") {
      try {
        column.releasePointerCapture(dragState.pointerId);
      } catch (_error) {
        // No-op: capture may already be released.
      }
    }

    restoreTemporaryStyles(dragState);
    dragState.preview?.remove();
    dragState.neighborPreview?.remove();
    trimSpanGhosts(dragState, 0);
    resetDragState(dragState);
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
        try {
          column.setPointerCapture(pointerEvent.pointerId);
        } catch (_error) {
          // No-op: unable to capture pointer in this environment.
        }
      }
    }

    if (dragState.mode === "move") {
      renderer.renderMovingLayout(pointerEvent.clientX, pointerEvent.clientY);
      return;
    }

    renderer.renderResizingLayout(pointerEvent.clientX, pointerEvent.clientY);
  }

  async function handlePointerUp(pointerEvent) {
    if (pointerEvent.pointerId !== dragState.pointerId) {
      return;
    }

    let movePayload = null;
    let resizePayload = null;
    const didDrag = dragState.dragging
      && Boolean(dragState.eventId)
      && Boolean(dragState.targetDate);

    if (didDrag && dragState.mode === "move") {
      const endMinutes = dragState.targetStartMinutes + dragState.durationMinutes;
      movePayload = buildTimedPayload({
        eventId: dragState.actionEventId,
        date: dragState.targetDate,
        startMinutes: dragState.targetStartMinutes,
        endMinutes
      });
      movePayload.instanceDate = dragState.eventDate;
      movePayload.isVirtual = dragState.isVirtual;
    }

    if (didDrag && dragState.mode !== "move") {
      const sourceDate = dragState.sourceColumn?.dataset.date ?? dragState.targetDate;
      const keepLinkedNeighbor = dragState.neighborEventId && dragState.targetColumn === dragState.sourceColumn;

      resizePayload = dragState.mode === "resize-top"
        ? (() => {
          const payload = buildTimedPayload({
            eventId: dragState.actionEventId,
            date: sourceDate,
            startMinutes: dragState.targetStartMinutes,
            endMinutes: dragState.targetEndMinutes
          });

          if (dragState.eventEndDate && dragState.eventEndDate !== sourceDate) {
            payload.endDate = dragState.eventEndDate;
            payload.endTime = dragState.eventClockEnd;
          }

          return payload;
        })()
        : buildResizePayload({
          eventId: dragState.actionEventId,
          date: sourceDate,
          startMinutes: dragState.targetStartMinutes,
          endMinutes: dragState.targetEndMinutes,
          anchorDate: dragState.eventDate,
          clockStart: dragState.eventClockStart,
          clockEnd: dragState.eventClockEnd,
          eventEndDate: dragState.eventEndDate
        });

      if (dragState.mode !== "resize-top" && dragState.eventStartDate && dragState.eventStartDate !== sourceDate) {
        resizePayload.startDate = dragState.eventStartDate;
        resizePayload.startTime = dragState.eventClockStart;
      }

      resizePayload.linkedNeighbor = keepLinkedNeighbor
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
      resizePayload.instanceDate = dragState.eventDate;
      resizePayload.isVirtual = dragState.isVirtual;
    }

    const releaseBeforeAsync = dragState.isVirtual;
    if (releaseBeforeAsync) {
      stopDrag();
    }

    try {
      if (movePayload) {
        await onEventMove(movePayload);
      }

      if (resizePayload) {
        await onEventResize(resizePayload);
      }
    } finally {
      if (!releaseBeforeAsync) {
        stopDrag();
      }
    }
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
    dragState.actionEventId = event.actionId ?? event.id;
    dragState.eventDate = event.date ?? null;
    dragState.isVirtual = Boolean(event.isVirtual);
    dragState.eventClockStart = event.startTime ?? "00:00";
    dragState.eventClockEnd = event.endTime ?? "00:00";
    dragState.eventEndDate = event.endDate ?? null;
    dragState.eventStartDate = event.startDate ?? event.date ?? null;
    dragState.eventColor = event.color ?? DEFAULT_EVENT_COLOR;

    const range = readEventBlockRange(element);
    const startMinutes = range?.startMinutes ?? roundNearest(event.startMinutes ?? 0, TIME_STEP_MINUTES);
    const rawEndMinutes = range?.endMinutes
      ?? Math.min(MINUTES_PER_DAY, startMinutes + eventDurationMinutes(event));

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
      const anchorStartMinutes = roundNearest(
        parseTimeToMinutes(event.startTime) - (dayOffset * MINUTES_PER_DAY),
        TIME_STEP_MINUTES
      );
      dragState.clickOffsetMinutes = pointerToMinutes(pointerEvent.clientY, columnRect, pixelsPerHour)
        - anchorStartMinutes;
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

    const neighbor = renderer.findLinkedNeighbor();
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
