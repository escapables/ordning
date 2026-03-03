import { formatDateKey } from "../../utils/date-utils.js";
import { openEventContextMenu, openMultiSelectContextMenu } from "./context-menu.js";

function renderAllDayEvent(event, handlers = {}) {
  const {
    onEventSelect = () => {},
    onEventClick = () => {},
    onEventDelete = () => {},
    onEventCopy = () => {},
    getSelectedEventTargets = () => [],
    onMultiDelete = async () => {}
  } = handlers;
  const element = document.createElement("article");
  element.className = "all-day-event";
  element.classList.toggle("all-day-event--recurring", Boolean(event.isVirtual));
  element.dataset.eventId = event.id;
  element.dataset.eventActionId = event.actionId ?? event.id;
  element.dataset.eventDate = event.date ?? "";
  element.dataset.eventIsVirtual = event.isVirtual ? "true" : "false";
  element.tabIndex = 3;
  element.style.setProperty("--event-color", event.color);
  element.textContent = event.title;

  const select = (uiEvent) => {
    uiEvent.stopPropagation();
    onEventSelect(event.id, element, { ctrlKey: uiEvent.ctrlKey || uiEvent.metaKey });
  };

  element.addEventListener("pointerdown", (pointerEvent) => {
    if (pointerEvent.button !== 0) {
      return;
    }
    select(pointerEvent);
  });
  element.addEventListener("click", (clickEvent) => {
    select(clickEvent);
  });
  element.addEventListener("dblclick", (doubleClickEvent) => {
    doubleClickEvent.stopPropagation();
    onEventClick(event.actionId ?? event.id);
  });
  element.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") {
      return;
    }
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    onEventClick(event.actionId ?? event.id);
  });
  element.addEventListener("contextmenu", (contextMenuEvent) => {
    if (element.classList.contains("event-block--selected")) {
      const targets = getSelectedEventTargets();
      if (targets.length > 1) {
        openMultiSelectContextMenu(contextMenuEvent, targets.length, {
          onDelete: () => onMultiDelete(targets)
        });
        return;
      }
    }
    openEventContextMenu(
      contextMenuEvent,
      {
        id: event.actionId ?? event.id,
        date: event.date ?? null,
        isVirtual: Boolean(event.isVirtual),
        title: event.title,
        time: ""
      },
      {
        onOpen: onEventClick,
        onDelete: onEventDelete,
        onCopy: onEventCopy
      }
    );
  });

  return element;
}

function renderDayCell(date, events, handlers = {}) {
  const dateKey = formatDateKey(date);
  const cell = document.createElement("div");
  cell.className = "all-day-bar__day";

  events
    .filter((event) => event.date === dateKey)
    .forEach((event) => {
      cell.appendChild(renderAllDayEvent(event, handlers));
    });

  return cell;
}

export function renderAllDayBar(dates, events = [], handlers = {}) {
  const bar = document.createElement("div");
  bar.className = "all-day-bar";

  const label = document.createElement("div");
  label.className = "all-day-bar__label";
  label.textContent = "";
  bar.appendChild(label);

  dates.forEach((date) => {
    bar.appendChild(renderDayCell(date, events, handlers));
  });

  return bar;
}
