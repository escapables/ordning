import { positionDropdown } from "../pickers/position-dropdown.js";

const DEFAULT_CALENDAR_COLOR = "#007aff";

function defaultCalendarId(calendars) {
  return calendars.find((calendar) => calendar.visible)?.id ?? calendars[0]?.id ?? "";
}

export function createCalendarPickerController({
  getCalendars,
  calendarSelect,
  calendarContainer,
  calendarTrigger,
  calendarDot,
  calendarLabel,
  saveButton
}) {
  let calendarDropdown = null;
  let calendarLastCloseTime = 0;

  function setCalendarAvailability(hasCalendars) {
    calendarSelect.disabled = !hasCalendars;
    calendarTrigger.disabled = !hasCalendars;
    saveButton.disabled = !hasCalendars;
  }

  function syncCalendarDisplay() {
    const calendars = getCalendars();
    const selected = calendars.find((calendar) => calendar.id === calendarSelect.value);
    if (selected) {
      calendarDot.style.backgroundColor = selected.color || DEFAULT_CALENDAR_COLOR;
      calendarLabel.textContent = selected.name;
    } else {
      calendarDot.style.backgroundColor = "transparent";
      calendarLabel.textContent = "";
    }
  }

  function closeCalendarDropdown() {
    if (!calendarDropdown) {
      return;
    }

    calendarDropdown.remove();
    calendarDropdown = null;
    calendarLastCloseTime = Date.now();
    document.removeEventListener("pointerdown", onCalendarOutsideClick, true);
    document.removeEventListener("keydown", onCalendarEscape);
  }

  function onCalendarOutsideClick(pointerEvent) {
    if (!calendarContainer.contains(pointerEvent.target)
      && (!calendarDropdown || !calendarDropdown.contains(pointerEvent.target))) {
      closeCalendarDropdown();
    }
  }

  function onCalendarEscape(keyEvent) {
    if (keyEvent.key === "Escape") {
      keyEvent.stopPropagation();
      closeCalendarDropdown();
    }
  }

  function openCalendarDropdown() {
    if (calendarDropdown || calendarTrigger.disabled) {
      return;
    }

    calendarDropdown = document.createElement("div");
    calendarDropdown.className = "picker__dropdown picker__dropdown--select";

    const calendars = getCalendars();
    calendars.forEach((calendar) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "picker__select-item";
      if (calendar.id === calendarSelect.value) {
        item.classList.add("picker__select-item--selected");
      }

      const dot = document.createElement("span");
      dot.className = "picker__dot";
      dot.style.backgroundColor = calendar.color || DEFAULT_CALENDAR_COLOR;

      const name = document.createElement("span");
      name.textContent = calendar.name;

      item.append(dot, name);
      item.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        calendarSelect.value = calendar.id;
        syncCalendarDisplay();
        closeCalendarDropdown();
      });
      calendarDropdown.appendChild(item);
    });

    positionDropdown(calendarDropdown, calendarTrigger);
    document.addEventListener("pointerdown", onCalendarOutsideClick, true);
    document.addEventListener("keydown", onCalendarEscape);
  }

  function fillCalendarOptions(selectedCalendarId, preferVisibleDefault = false) {
    while (calendarSelect.firstChild) {
      calendarSelect.removeChild(calendarSelect.firstChild);
    }

    const calendars = getCalendars();
    calendars.forEach((calendar) => {
      const option = document.createElement("option");
      option.value = calendar.id;
      option.textContent = calendar.name;
      calendarSelect.appendChild(option);
    });

    const hasSelectedCalendar = calendars.some((calendar) => calendar.id === selectedCalendarId);
    if (selectedCalendarId && hasSelectedCalendar) {
      calendarSelect.value = selectedCalendarId;
    } else if (preferVisibleDefault) {
      calendarSelect.value = defaultCalendarId(calendars);
    } else if (calendars.length > 0) {
      calendarSelect.value = calendars[0].id;
    }

    setCalendarAvailability(calendars.length > 0);
    syncCalendarDisplay();
    return calendars.length > 0;
  }

  calendarSelect.addEventListener("change", syncCalendarDisplay);
  calendarTrigger.addEventListener("click", () => {
    if (!calendarDropdown && Date.now() - calendarLastCloseTime > 100) {
      openCalendarDropdown();
    }
  });

  return {
    closeCalendarDropdown,
    fillCalendarOptions,
    syncCalendarDisplay
  };
}
