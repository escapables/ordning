import { tDayShort } from "../../i18n/strings.js";
import { formatDateKey, formatMonthDay } from "../../utils/date-utils.js";
import { openEventContextMenu, openMultiSelectContextMenu, openSlotContextMenu } from "./context-menu.js";
import { installCreateInteractions } from "./drag-create.js";
import { createEventMovePointerDownHandler } from "./event-move-drag.js";
import { renderEventBlocks } from "./event-block.js";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const MIN_SELECTION_MINUTES = 15;
const CONTEXT_MENU_STEP_MINUTES = 30;

function clampMinutes(value) {
  return Math.max(0, Math.min(MINUTES_PER_DAY, value));
}

function roundNearest(value, step) {
  return Math.round(value / step) * step;
}

function formatTimeFromMinutes(value) {
  const minutes = Math.max(0, Math.min(MINUTES_PER_DAY - MIN_SELECTION_MINUTES, value));
  const hoursPart = Math.floor(minutes / MINUTES_PER_HOUR);
  const minutesPart = minutes % MINUTES_PER_HOUR;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
}

function toPrefillFromPoint(clientY, rect, pixelsPerHour) {
  const roundedStart = roundNearest(pointerToMinutes(clientY, rect, pixelsPerHour), CONTEXT_MENU_STEP_MINUTES);
  const safeStart = Math.max(0, Math.min(MINUTES_PER_DAY - CONTEXT_MENU_STEP_MINUTES, roundedStart));
  const safeEnd = Math.min(MINUTES_PER_DAY, safeStart + CONTEXT_MENU_STEP_MINUTES);
  return {
    startTime: formatTimeFromMinutes(safeStart),
    endTime: safeEnd >= MINUTES_PER_DAY ? "23:59" : formatTimeFromMinutes(safeEnd)
  };
}

function pointerToMinutes(clientY, rect, pixelsPerHour) {
  const maxHeight = HOURS_PER_DAY * pixelsPerHour;
  const y = Math.max(0, Math.min(clientY - rect.top, maxHeight));
  return clampMinutes((y / pixelsPerHour) * MINUTES_PER_HOUR);
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
    onEventSelect = () => {},
    onEventClick = () => {},
    onEventDelete = () => {},
    onEventCopy = () => {},
    onEventMove = async () => {},
    onEventResize = async () => {},
    onCreateSlot = () => {},
    onCreateFromContextMenu = () => {},
    onPasteFromContextMenu = () => {},
    canPasteFromContextMenu = () => false,
    getSelectedEventTargets = () => [],
    onMultiDelete = async () => {}
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

  const onEventPointerDown = createEventMovePointerDownHandler(column, pixelsPerHour, {
    onEventMove,
    onEventResize
  });
  column.appendChild(
    renderEventBlocks(events, pixelsPerHour, {
      onEventSelect,
      onEventOpen: onEventClick,
      onEventPointerDown
    })
  );
  wireEventContextMenu(column, {
    onEventClick,
    onEventDelete,
    onEventCopy,
    onCreateFromContextMenu,
    onPasteFromContextMenu,
    canPasteFromContextMenu,
    getSelectedEventTargets,
    onMultiDelete,
    pixelsPerHour
  });
  installCreateInteractions(column, pixelsPerHour, onCreateSlot);

  return column;
}
function wireEventContextMenu(column, handlers) {
  const {
    onEventClick = () => {},
    onEventDelete = () => {},
    onEventCopy = () => {},
    onCreateFromContextMenu = () => {},
    onPasteFromContextMenu = () => {},
    canPasteFromContextMenu = () => false,
    getSelectedEventTargets = () => [],
    onMultiDelete = async () => {},
    pixelsPerHour = 42
  } = handlers;

  column.addEventListener("contextmenu", (contextMenuEvent) => {
    const target = contextMenuEvent.target;
    if (!(target instanceof Element)) {
      return;
    }

    const eventBlock = target.closest(".event-block");
    if (!(eventBlock instanceof HTMLElement)) {
      const date = column.dataset.date;
      if (!date) {
        return;
      }
      const rect = column.getBoundingClientRect();
      openSlotContextMenu(
        contextMenuEvent,
        {
          date,
          ...toPrefillFromPoint(contextMenuEvent.clientY, rect, pixelsPerHour)
        },
        {
          onCreate: onCreateFromContextMenu,
          onPaste: onPasteFromContextMenu,
          canPaste: canPasteFromContextMenu
        }
      );
      return;
    }

    const eventId = eventBlock.dataset.eventActionId ?? eventBlock.dataset.eventId;
    if (!eventId) {
      return;
    }

    if (eventBlock.classList.contains("event-block--selected")) {
      const targets = getSelectedEventTargets();
      if (targets.length > 1) {
        openMultiSelectContextMenu(contextMenuEvent, targets.length, {
          onDelete: () => onMultiDelete(targets)
        });
        return;
      }
    }

    const title = eventBlock.querySelector(".event-block__title")?.textContent ?? "";
    const time = eventBlock.querySelector(".event-block__time")?.textContent ?? "";

    openEventContextMenu(
      contextMenuEvent,
      {
        id: eventId,
        date: eventBlock.dataset.eventDate ?? null,
        isVirtual: eventBlock.dataset.eventIsVirtual === "true",
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
