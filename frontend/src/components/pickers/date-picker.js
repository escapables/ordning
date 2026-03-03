import { tDayShort } from "../../i18n/strings.js";
import { getMonthDays, isSameDate, monthLabel } from "../../utils/calendar-grid.js";
import { positionDropdown } from "./position-dropdown.js";

function parseDateValue(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export function createDatePicker({ name, required = false, onChange } = {}) {
  const container = document.createElement("div");
  container.className = "picker picker--date";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "event-modal__input picker__input";
  input.name = name ?? "";
  input.required = required;
  input.placeholder = "YYYY-MM-DD";
  input.autocomplete = "off";
  container.appendChild(input);

  let dropdown = null;
  let lastCloseTime = 0;
  let displayedMonth = new Date();
  displayedMonth.setDate(1);

  function open() {
    if (dropdown) {
      return;
    }

    const current = parseDateValue(input.value);
    if (current) {
      displayedMonth = new Date(current.getFullYear(), current.getMonth(), 1);
    } else {
      displayedMonth = new Date();
      displayedMonth.setDate(1);
    }

    dropdown = document.createElement("div");
    dropdown.className = "picker__dropdown picker__dropdown--calendar";
    renderCalendar();
    positionDropdown(dropdown, input);

    document.addEventListener("pointerdown", onOutsideClick, true);
    document.addEventListener("keydown", onEscape);
  }

  function close() {
    if (!dropdown) {
      return;
    }
    dropdown.remove();
    dropdown = null;
    lastCloseTime = Date.now();
    document.removeEventListener("pointerdown", onOutsideClick, true);
    document.removeEventListener("keydown", onEscape);
  }

  function selectDate(date) {
    input.value = formatDateValue(date);
    close();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    onChange?.();
  }

  function renderCalendar() {
    if (!dropdown) {
      return;
    }
    clearChildren(dropdown);

    const header = document.createElement("div");
    header.className = "picker__calendar-header";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "picker__calendar-nav";
    prev.textContent = "\u2039";
    prev.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
      renderCalendar();
    });

    const title = document.createElement("span");
    title.className = "picker__calendar-title";
    title.textContent = monthLabel(displayedMonth);

    const next = document.createElement("button");
    next.type = "button";
    next.className = "picker__calendar-nav";
    next.textContent = "\u203A";
    next.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
      renderCalendar();
    });

    header.append(prev, title, next);
    dropdown.appendChild(header);

    const weekdays = document.createElement("div");
    weekdays.className = "picker__weekdays";
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      const cell = document.createElement("span");
      cell.className = "picker__weekday";
      cell.textContent = tDayShort(weekday % 7);
      weekdays.appendChild(cell);
    }
    dropdown.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "picker__days";

    const today = new Date();
    const selected = parseDateValue(input.value);
    const { cells, monthStart } = getMonthDays(displayedMonth);

    for (const cellDate of cells) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker__day";
      btn.textContent = String(cellDate.getDate());

      if (cellDate.getMonth() !== monthStart.getMonth()) {
        btn.classList.add("picker__day--outside");
      }
      if (isSameDate(cellDate, today)) {
        btn.classList.add("picker__day--today");
      }
      if (selected && isSameDate(cellDate, selected)) {
        btn.classList.add("picker__day--selected");
      }

      btn.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        selectDate(cellDate);
      });

      grid.appendChild(btn);
    }

    dropdown.appendChild(grid);
  }

  function onOutsideClick(pointerEvent) {
    if (!container.contains(pointerEvent.target)
      && (!dropdown || !dropdown.contains(pointerEvent.target))) {
      close();
    }
  }

  function onEscape(keyEvent) {
    if (keyEvent.key === "Escape") {
      keyEvent.stopPropagation();
      close();
      input.focus();
    }
  }

  input.addEventListener("click", () => {
    if (!dropdown && Date.now() - lastCloseTime > 100) {
      open();
    }
  });

  input.addEventListener("blur", () => {
    const raw = input.value.trim();
    if (raw && !parseDateValue(raw)) {
      input.value = "";
    }
  });

  input.addEventListener("keydown", (keyEvent) => {
    if (keyEvent.key === "Enter" && dropdown) {
      keyEvent.preventDefault();
      close();
    }
  });

  return { container, input };
}
