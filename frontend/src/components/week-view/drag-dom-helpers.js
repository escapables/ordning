export function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

export function findColumnByDate(anchorColumn, dateKey) {
  const root = anchorColumn.closest(".week-grid") ?? document;
  const found = root.querySelector(`.day-column[data-date="${dateKey}"]`);
  return found instanceof HTMLElement ? found : null;
}

export function rememberOriginalStyle(dragState, element) {
  if (dragState.originalStyles.has(element)) {
    return;
  }
  dragState.originalStyles.set(element, {
    width: element.style.width,
    left: element.style.left,
    visibility: element.style.visibility
  });
}

export function restoreTemporaryStyles(dragState) {
  dragState.originalStyles.forEach((value, element) => {
    element.style.width = value.width;
    element.style.left = value.left;
    element.style.visibility = value.visibility;
  });
  dragState.originalStyles.clear();
}

export function ensurePreview(dragState, key, parentColumn) {
  if (!(dragState[key] instanceof HTMLElement)) {
    const preview = document.createElement("div");
    preview.className = "day-column__move-preview";
    dragState[key] = preview;
  }
  dragState[key].style.setProperty("--event-color", dragState.eventColor);
  if (dragState[key].parentElement !== parentColumn) {
    parentColumn.appendChild(dragState[key]);
  }
  return dragState[key];
}

export function applyItemPosition(dragState, item) {
  const widthPercent = 100 / item.totalColumns;
  rememberOriginalStyle(dragState, item.element);
  item.element.style.width = `calc(${widthPercent}% - 4px)`;
  item.element.style.left = `calc(${item.column * widthPercent}% + 2px)`;
}

const MINUTES_PER_DAY = 24 * 60;

export function computeEventSpans(targetDate, startMinutes, durationMinutes) {
  const dayShift = Math.floor(startMinutes / MINUTES_PER_DAY);
  const baseDate = dayShift ? addDaysToDateKey(targetDate, dayShift) : targetDate;
  const baseClock = startMinutes - dayShift * MINUTES_PER_DAY;
  const spans = [];
  let remaining = durationMinutes;
  let segStart = baseClock;
  let dayOffset = 0;
  while (remaining > 0) {
    const dateKey = dayOffset === 0 ? baseDate : addDaysToDateKey(baseDate, dayOffset);
    const end = Math.min(segStart + remaining, MINUTES_PER_DAY);
    if (end > segStart) {
      spans.push({ dateKey, startMinutes: segStart, endMinutes: end });
    }
    remaining -= (end - segStart);
    segStart = 0;
    dayOffset += 1;
  }
  return spans;
}

export function ensureSpanGhost(dragState, index, parentColumn) {
  while (dragState.spanPreviews.length <= index) {
    const ghost = document.createElement("div");
    ghost.className = "day-column__move-preview";
    dragState.spanPreviews.push(ghost);
  }
  const ghost = dragState.spanPreviews[index];
  ghost.style.setProperty("--event-color", dragState.eventColor);
  if (ghost.parentElement !== parentColumn) {
    parentColumn.appendChild(ghost);
  }
  return ghost;
}

export function trimSpanGhosts(dragState, needed) {
  for (let i = needed; i < dragState.spanPreviews.length; i += 1) {
    dragState.spanPreviews[i]?.remove();
  }
  dragState.spanPreviews.length = needed;
}
