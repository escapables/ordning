import { MINUTES_PER_HOUR } from "../components/week-view/drag-time-utils.js";
import { resolvePastePlacement } from "../utils/ui-actions.js";

import { applyAnchorOffset, resolvePixelsPerHour } from "./event-copy-paste-geometry.js";

const MIN_PREVIEW_HEIGHT = 18;

function findTimedEventElement(weekContainer, eventId) {
  return Array.from(weekContainer.querySelectorAll(".event-block")).find(
    (element) =>
      element instanceof HTMLElement
      && (element.dataset.eventId === eventId || element.dataset.eventActionId === eventId)
  ) ?? null;
}

export function resolveEventColor(weekContainer, eventId, sourceElement = null) {
  const targetElement = sourceElement instanceof HTMLElement
    ? sourceElement
    : findTimedEventElement(weekContainer, eventId);
  const color = targetElement instanceof HTMLElement
    ? targetElement.style.getPropertyValue("--event-color")
    : "";
  return color || "#007aff";
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

export function clearPreviewElements(previews = []) {
  previews.forEach((preview) => {
    preview.remove();
  });
  return [];
}

export function renderPastePreview({
  weekContainer,
  sourceEvent,
  slot,
  anchorOffsetMinutes,
  eventColor
}) {
  const resolvedSlot = applyAnchorOffset(slot, anchorOffsetMinutes);
  if (!sourceEvent || !resolvedSlot) {
    return {
      previews: [],
      resolvedSlot
    };
  }

  const placement = resolvePastePlacement(sourceEvent, {
    date: resolvedSlot.date,
    startTime: resolvedSlot.startTime
  });
  if (!placement) {
    return {
      previews: [],
      resolvedSlot
    };
  }

  const previews = [];
  placement.segments.forEach((segment) => {
    const targetColumn = weekContainer.querySelector(`.day-column[data-date="${segment.date}"]`)
      ?? (segment.date === resolvedSlot.date ? resolvedSlot.column : null);
    if (!(targetColumn instanceof HTMLElement)) {
      return;
    }

    previews.push(createPreviewElement({
      color: eventColor,
      segment,
      column: targetColumn
    }));
  });

  return {
    previews,
    resolvedSlot
  };
}
