import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  readEventBlockRange
} from "./drag-time-utils.js";
import {
  ensurePreview,
  ensureSpanGhost,
  findColumnByDate,
  trimSpanGhosts
} from "./drag-dom-helpers.js";

export function previewRange(dragState) {
  if (dragState.mode === "move") {
    return {
      startMinutes: Math.max(0, dragState.targetStartMinutes),
      endMinutes: Math.min(MINUTES_PER_DAY, dragState.targetStartMinutes + dragState.durationMinutes)
    };
  }

  const startMinutes = dragState.targetStartMinutes;
  const endMinutes = dragState.targetEndMinutes;
  if (startMinutes < 0) {
    return {
      startMinutes: startMinutes + MINUTES_PER_DAY,
      endMinutes: MINUTES_PER_DAY
    };
  }

  if (endMinutes > MINUTES_PER_DAY) {
    return {
      startMinutes,
      endMinutes: MINUTES_PER_DAY
    };
  }

  return {
    startMinutes,
    endMinutes
  };
}

export function neighborPreviewRange(dragState) {
  return {
    startMinutes: dragState.neighborTargetStartMinutes,
    endMinutes: dragState.neighborTargetEndMinutes
  };
}

export function positionGhost(ghost, startMinutes, endMinutes, pixelsPerHour) {
  ghost.style.top = `${(startMinutes / MINUTES_PER_HOUR) * pixelsPerHour}px`;
  ghost.style.height = `${Math.max(((endMinutes - startMinutes) / MINUTES_PER_HOUR) * pixelsPerHour, 18)}px`;
  ghost.dataset.startMinutes = String(startMinutes);
  ghost.dataset.endMinutes = String(endMinutes);
}

export function addGhostItem(items, ghost, rangeFn, column) {
  if (ghost instanceof HTMLElement && ghost.parentElement === column) {
    const range = rangeFn ? rangeFn() : readEventBlockRange(ghost);
    if (range) {
      items.push({
        element: ghost,
        startMinutes: range.startMinutes,
        endMinutes: range.endMinutes
      });
    }
  }
}

export function renderSpanGhosts({
  dragState,
  column,
  spans,
  pixelsPerHour
}) {
  const ghostColumns = new Set();
  spans.forEach((span, index) => {
    const targetColumn = findColumnByDate(column, span.dateKey);
    if (!(targetColumn instanceof HTMLElement)) {
      return;
    }

    ghostColumns.add(targetColumn);
    const ghost = index < 2
      ? ensurePreview(dragState, index === 0 ? "preview" : "neighborPreview", targetColumn)
      : ensureSpanGhost(dragState, index - 2, targetColumn);
    positionGhost(ghost, span.startMinutes, span.endMinutes, pixelsPerHour);
  });

  if (spans.length < 2) {
    dragState.neighborPreview?.remove();
  }

  trimSpanGhosts(dragState, Math.max(0, spans.length - 2));
  if (spans.length > 1) {
    dragState.neighborTargetStartMinutes = spans[1].startMinutes;
    dragState.neighborTargetEndMinutes = spans[1].endMinutes;
  } else {
    dragState.neighborTargetStartMinutes = 0;
    dragState.neighborTargetEndMinutes = 0;
  }

  return ghostColumns;
}
