import { formatTimeFromMinutes } from "../week-view/drag-time-utils.js";
import { positionDropdown } from "./position-dropdown.js";

const SLOT_STEP = 15;
const SLOTS_PER_DAY = (24 * 60) / SLOT_STEP;

function parseTimeValue(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return { hours, minutes, total: hours * 60 + minutes };
}

function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export function createTimePicker({ name, required = false, onChange } = {}) {
  const container = document.createElement("div");
  container.className = "picker picker--time";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "event-modal__input picker__input";
  input.name = name ?? "";
  input.required = required;
  input.placeholder = "HH:MM";
  input.autocomplete = "off";
  container.appendChild(input);

  let dropdown = null;
  let lastCloseTime = 0;

  function open() {
    if (dropdown || input.disabled) {
      return;
    }

    dropdown = document.createElement("div");
    dropdown.className = "picker__dropdown picker__dropdown--time";
    renderSlots();
    positionDropdown(dropdown, input);

    scrollToNearest();

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

  function selectTime(timeString) {
    input.value = timeString;
    close();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    onChange?.();
  }

  function renderSlots() {
    if (!dropdown) {
      return;
    }
    clearChildren(dropdown);

    const current = parseTimeValue(input.value);

    for (let index = 0; index < SLOTS_PER_DAY; index += 1) {
      const minutes = index * SLOT_STEP;
      const timeString = formatTimeFromMinutes(minutes);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker__slot";
      btn.textContent = timeString;
      btn.dataset.minutes = String(minutes);

      if (current && current.total === minutes) {
        btn.classList.add("picker__slot--selected");
      }

      btn.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        selectTime(timeString);
      });

      dropdown.appendChild(btn);
    }
  }

  function scrollToNearest() {
    if (!dropdown) {
      return;
    }
    const current = parseTimeValue(input.value);
    const targetMinutes = current
      ? Math.round(current.total / SLOT_STEP) * SLOT_STEP
      : 9 * 60;

    const slot = dropdown.querySelector(`[data-minutes="${targetMinutes}"]`);
    if (slot) {
      slot.scrollIntoView({ block: "center" });
    }
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
    if (raw && !parseTimeValue(raw)) {
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
