import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MIN_SELECTION_MINUTES,
  TIME_STEP_MINUTES,
  clamp,
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
import { resolveAbsoluteEndMinutes } from "./drag-payload-utils.js";
import {
  addGhostItem,
  neighborPreviewRange,
  positionGhost,
  previewRange,
  renderSpanGhosts
} from "./event-move-drag-preview.js";

export function createEventMoveDragRenderer({
  column,
  pixelsPerHour,
  dragState
}) {
  function resolveDayOffset(fromDate, toDate) {
    const fromValue = Date.parse(`${fromDate ?? ""}T00:00:00`);
    const toValue = Date.parse(`${toDate ?? ""}T00:00:00`);
    if (!Number.isFinite(fromValue) || !Number.isFinite(toValue)) {
      return 0;
    }

    return Math.round((toValue - fromValue) / 86400000);
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
    const items = [];
    Array.from(targetColumn.querySelectorAll(".event-block")).forEach((block) => {
      if (!(block instanceof HTMLElement)) {
        return;
      }

      if (block.dataset.eventId === dragState.eventId || block.dataset.eventId === dragState.neighborEventId) {
        return;
      }

      const range = readEventBlockRange(block);
      if (range) {
        items.push({
          element: block,
          startMinutes: range.startMinutes,
          endMinutes: range.endMinutes
        });
      }
    });

    if (includeGhost) {
      addGhostItem(items, dragState.preview, () => previewRange(dragState), targetColumn);
      addGhostItem(items, dragState.neighborPreview, () => neighborPreviewRange(dragState), targetColumn);
      dragState.spanPreviews.forEach((ghost) => addGhostItem(items, ghost, null, targetColumn));
    }

    layoutOverlapItems(items).forEach((item) => applyItemPosition(dragState, item));
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

    const columnRect = targetColumn.getBoundingClientRect();
    const rawStartMinutes = roundNearest(
      pointerToMinutes(clientY, columnRect, pixelsPerHour) - dragState.clickOffsetMinutes,
      TIME_STEP_MINUTES
    );
    const minStartMinutes = -(dragState.durationMinutes - TIME_STEP_MINUTES);
    const startMinutes = clamp(rawStartMinutes, minStartMinutes, MINUTES_PER_DAY - TIME_STEP_MINUTES);

    dragState.targetColumn = targetColumn;
    dragState.targetDate = targetDate;
    dragState.targetStartMinutes = startMinutes;

    const ghostColumns = renderSpanGhosts({
      dragState,
      column,
      spans: computeEventSpans(targetDate, startMinutes, dragState.durationMinutes),
      pixelsPerHour
    });

    restoreTemporaryStyles(dragState);
    dragState.draggedElements.forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      rememberOriginalStyle(dragState, element);
      element.style.visibility = "hidden";
    });

    const columnsToLayout = new Set(
      dragState.draggedElements
        .map((element) => element.closest(".day-column"))
        .filter((target) => target instanceof HTMLElement)
    );
    ghostColumns.forEach((ghostColumn) => columnsToLayout.add(ghostColumn));
    columnsToLayout.forEach((layoutColumn) => {
      layoutColumnItems(layoutColumn, { includeGhost: true });
    });
  }

  function renderResizingLayout(clientX, clientY) {
    const sourceColumn = dragState.sourceColumn;
    const sourceDate = sourceColumn?.dataset.date;
    if (!(sourceColumn instanceof HTMLElement) || !sourceDate) {
      return;
    }

    const pointedColumn = resolveColumnFromPoint(clientX, clientY);
    const pointedDate = pointedColumn?.dataset.date ?? sourceDate;
    const rawDayOffset = resolveDayOffset(sourceDate, pointedDate);

    const isMultiDay = dragState.eventStartDate
      && dragState.eventEndDate
      && dragState.eventStartDate !== dragState.eventEndDate;
    const startDayBound = dragState.eventStartDate
      ? resolveDayOffset(sourceDate, dragState.eventStartDate)
      : 0;
    const endDayBound = dragState.eventEndDate
      ? resolveDayOffset(sourceDate, dragState.eventEndDate)
      : 0;

    const dayOffset = dragState.mode === "resize-top"
      ? clamp(rawDayOffset, -6, Math.max(0, endDayBound))
      : clamp(rawDayOffset, Math.min(0, startDayBound), 6);

    const targetDate = dayOffset ? addDaysToDateKey(sourceDate, dayOffset) : sourceDate;
    const targetColumn = dayOffset
      ? findColumnByDate(column, targetDate) ?? sourceColumn
      : sourceColumn;

    dragState.targetColumn = targetColumn;
    dragState.targetDate = targetDate;

    const targetRect = targetColumn.getBoundingClientRect();
    const rawMinutes = roundNearest(pointerToMinutes(clientY, targetRect, pixelsPerHour), TIME_STEP_MINUTES)
      + (dayOffset * MINUTES_PER_DAY);
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
        ? -sourceDayFromStart * MINUTES_PER_DAY
          + parseTimeToMinutes(dragState.eventClockStart)
          + MIN_SELECTION_MINUTES
        : dragState.targetStartMinutes + MIN_SELECTION_MINUTES;
      const maxEnd = keepLinkedNeighbor
        ? dragState.neighborEndMinutes - MIN_SELECTION_MINUTES
        : dayOffset > 0 ? (1 + dayOffset) * MINUTES_PER_DAY : MINUTES_PER_DAY;
      dragState.targetEndMinutes = clamp(rawMinutes, minEnd, maxEnd);
    }

    if ((isMultiDay || Math.abs(dayOffset) > 0) && !keepLinkedNeighbor) {
      const startClock = parseTimeToMinutes(dragState.eventClockStart);
      const endAbsoluteMinutes = resolveDayOffset(dragState.eventStartDate, dragState.eventEndDate) * MINUTES_PER_DAY
        + parseTimeToMinutes(dragState.eventClockEnd);
      const spanStart = dragState.mode === "resize-top"
        ? sourceDayFromStart * MINUTES_PER_DAY + dragState.targetStartMinutes
        : startClock;
      const spanEnd = dragState.mode === "resize-top"
        ? endAbsoluteMinutes
        : sourceDayFromStart * MINUTES_PER_DAY + dragState.targetEndMinutes;

      renderSpanGhosts({
        dragState,
        column,
        spans: computeEventSpans(
          dragState.eventStartDate,
          spanStart,
          Math.max(MIN_SELECTION_MINUTES, spanEnd - spanStart)
        ),
        pixelsPerHour
      });
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
          ? dragState.targetEndMinutes - MINUTES_PER_DAY
          : dragState.targetEndMinutes;
      }

      if (dragState.mode === "resize-top" && isCrossColumn) {
        positionGhost(
          ensurePreview(dragState, "preview", targetColumn),
          dragState.targetStartMinutes + MINUTES_PER_DAY,
          MINUTES_PER_DAY,
          pixelsPerHour
        );
        positionGhost(
          ensurePreview(dragState, "neighborPreview", sourceColumn),
          0,
          dragState.targetEndMinutes,
          pixelsPerHour
        );
      } else if (dragState.mode === "resize-bottom" && isCrossColumn) {
        positionGhost(
          ensurePreview(dragState, "preview", sourceColumn),
          dragState.targetStartMinutes,
          MINUTES_PER_DAY,
          pixelsPerHour
        );
        positionGhost(
          ensurePreview(dragState, "neighborPreview", targetColumn),
          0,
          dragState.targetEndMinutes - MINUTES_PER_DAY,
          pixelsPerHour
        );
      } else {
        const range = previewRange(dragState);
        positionGhost(
          ensurePreview(dragState, "preview", targetColumn),
          range.startMinutes,
          range.endMinutes,
          pixelsPerHour
        );

        if (keepLinkedNeighbor) {
          const neighborRange = neighborPreviewRange(dragState);
          positionGhost(
            ensurePreview(dragState, "neighborPreview", targetColumn),
            neighborRange.startMinutes,
            neighborRange.endMinutes,
            pixelsPerHour
          );
        } else {
          dragState.neighborPreview?.remove();
        }
      }

      const ghostedColumns = new Set([sourceColumn, targetColumn].filter((target) => target instanceof HTMLElement));
      let spanGhostIndex = 0;
      dragState.draggedElements.forEach((element) => {
        if (!(element instanceof HTMLElement)) {
          return;
        }

        const eventColumn = element.closest(".day-column");
        if (!(eventColumn instanceof HTMLElement) || ghostedColumns.has(eventColumn)) {
          return;
        }

        ghostedColumns.add(eventColumn);
        const range = readEventBlockRange(element);
        if (!range) {
          return;
        }

        positionGhost(
          ensureSpanGhost(dragState, spanGhostIndex, eventColumn),
          range.startMinutes,
          range.endMinutes,
          pixelsPerHour
        );
        spanGhostIndex += 1;
      });

      trimSpanGhosts(dragState, spanGhostIndex);
    }

    restoreTemporaryStyles(dragState);
    dragState.draggedElements.forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      rememberOriginalStyle(dragState, element);
      element.style.visibility = "hidden";
    });

    if (keepLinkedNeighbor && dragState.neighborElement instanceof HTMLElement) {
      rememberOriginalStyle(dragState, dragState.neighborElement);
      dragState.neighborElement.style.visibility = "hidden";
    }

    const layoutColumns = [
      sourceColumn,
      targetColumn,
      ...dragState.draggedElements.map((element) => element.closest(".day-column"))
    ].filter((target) => target instanceof HTMLElement);

    new Set(layoutColumns).forEach((layoutColumn) => {
      layoutColumnItems(layoutColumn, { includeGhost: true });
    });
  }

  return {
    findLinkedNeighbor,
    renderMovingLayout,
    renderResizingLayout
  };
}
