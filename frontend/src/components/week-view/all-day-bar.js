import { formatDateKey } from "../../utils/date-utils.js";
import { openEventContextMenu } from "./context-menu.js";

function renderAllDayEvent(event, handlers = {}) {
  const {
    onEventSelect = () => {},
    onEventClick = () => {},
    onEventDelete = () => {},
    onEventCopy = () => {}
  } = handlers;
  const element = document.createElement("article");
  element.className = "all-day-event";
  element.dataset.eventId = event.id;
  element.tabIndex = 3;
  element.style.setProperty("--event-color", event.color);
  element.textContent = event.title;

  const select = (uiEvent) => {
    uiEvent.stopPropagation();
    onEventSelect(event.id, element);
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
    onEventClick(event.id);
  });
  element.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") {
      return;
    }
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    onEventClick(event.id);
  });
  element.addEventListener("contextmenu", (contextMenuEvent) => {
    openEventContextMenu(
      contextMenuEvent,
      {
        id: event.id,
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
