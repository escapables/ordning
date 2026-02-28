import { t } from "../../i18n/strings.js";
import { getState } from "../../state.js";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_EVENT_COLOR = "#007aff";

function parseDateKey(dateKey) {
  if (!dateKey || typeof dateKey !== "string") {
    return null;
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseTimeToMinutes(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const [hours, minutes] = raw.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return (hours * 60) + minutes;
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addDaysToDateKey(dateKey, dayCount) {
  const base = parseDateKey(dateKey) ?? new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + dayCount);
  return formatDateKey(next);
}

function getCalendarColor(calendarId) {
  return (
    getState().calendars.find((calendar) => calendar.id === calendarId)?.color
    ?? DEFAULT_EVENT_COLOR
  );
}

function getTemplateTiming(result, templateEvent) {
  const startDateKey = result?.start_date ?? templateEvent?.startDate ?? templateEvent?.start_date;
  const endDateKey = result?.end_date ?? templateEvent?.endDate ?? templateEvent?.end_date ?? startDateKey;
  const startTime = result?.start_time ?? templateEvent?.startTime ?? templateEvent?.start_time ?? null;
  const endTime = result?.end_time ?? templateEvent?.endTime ?? templateEvent?.end_time ?? null;
  const explicitAllDay = result?.all_day ?? templateEvent?.allDay ?? templateEvent?.all_day;
  const allDay = Boolean(explicitAllDay ?? (!startTime || !endTime));

  if (allDay) {
    const startDate = parseDateKey(startDateKey);
    const endDate = parseDateKey(endDateKey) ?? startDate;
    const spanMs = startDate && endDate ? endDate.getTime() - startDate.getTime() : 0;
    const daySpan = Math.max(1, Math.round(spanMs / 86400000) + 1);
    return { allDay: true, daySpan };
  }

  const dayOffset = (() => {
    const startDate = parseDateKey(startDateKey);
    const endDate = parseDateKey(endDateKey);
    if (!startDate || !endDate) {
      return 0;
    }
    return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
  })();
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return { allDay: false, durationMinutes: 60 };
  }

  let durationMinutes = (dayOffset * MINUTES_PER_DAY) + (endMinutes - startMinutes);
  if (durationMinutes <= 0) {
    durationMinutes += MINUTES_PER_DAY;
  }

  return { allDay: false, durationMinutes: Math.max(1, durationMinutes) };
}

function formatDurationLabel(result) {
  const timing = getTemplateTiming(result);

  if (timing.allDay) {
    if (timing.daySpan <= 1) {
      return t("eventFormTemplateAllDay");
    }

    return t("eventFormTemplateDays").replace("{count}", String(timing.daySpan));
  }

  const hours = Math.floor(timing.durationMinutes / 60);
  const minutes = timing.durationMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h${minutes}m`;
}

function normalizeGroupValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function buildGroupKey(result) {
  return [
    result?.calendar_id ?? "",
    normalizeGroupValue(result?.title),
    normalizeGroupValue(result?.location),
    normalizeGroupValue(result?.description_private),
    normalizeGroupValue(result?.description_public)
  ].join("\u241f");
}

function collapseResults(results) {
  const grouped = new Map();

  (Array.isArray(results) ? results : []).forEach((result) => {
    const key = buildGroupKey(result);
    if (!grouped.has(key)) {
      grouped.set(key, result);
    }
  });

  return Array.from(grouped.values());
}

export function createEventTemplateSearch({
  invoke,
  showError,
  clearError,
  applyAllDayState,
  titleField,
  fields
}) {
  const {
    titleInput,
    calendarSelect,
    startDateInput,
    endDateInput,
    startTimeInput,
    endTimeInput,
    allDayInput,
    locationInput,
    privateDescriptionInput,
    publicDescriptionInput
  } = fields;

  const dropdown = document.createElement("div");
  dropdown.className = "event-modal__template-dropdown";
  dropdown.hidden = true;

  const anchor = document.createElement("div");
  anchor.className = "event-modal__search-anchor";

  titleField.classList.add("event-modal__field--search");
  titleField.removeChild(titleInput);
  anchor.append(titleInput, dropdown);
  titleField.appendChild(anchor);

  let enabled = false;
  let debounceTimer = null;
  let requestSeq = 0;
  let results = [];
  let activeIndex = -1;
  let selecting = false;

  function hideDropdown() {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
    results = [];
    activeIndex = -1;
  }

  function reset() {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    requestSeq += 1;
    hideDropdown();
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    if (!enabled) {
      reset();
    }
  }

  function renderResults() {
    dropdown.innerHTML = "";

    if (results.length === 0) {
      const empty = document.createElement("div");
      empty.className = "event-modal__template-empty";
      empty.textContent = t("eventFormTemplateNoResults");
      dropdown.appendChild(empty);
      dropdown.hidden = false;
      return;
    }

    const list = document.createElement("div");
    list.className = "event-modal__template-list";

    results.forEach((result, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "event-modal__template-item";
      item.setAttribute("aria-selected", activeIndex === index ? "true" : "false");
      item.classList.toggle("event-modal__template-item--active", activeIndex === index);

      const topRow = document.createElement("div");
      topRow.className = "event-modal__template-item-top";

      const titleGroup = document.createElement("div");
      titleGroup.className = "event-modal__template-item-main";

      const dot = document.createElement("span");
      dot.className = "event-modal__template-dot";
      dot.style.color = getCalendarColor(result.calendar_id);
      dot.textContent = "\u25CF";

      const title = document.createElement("span");
      title.className = "event-modal__template-item-title";
      title.textContent = result.title;

      const duration = document.createElement("span");
      duration.className = "event-modal__template-duration";
      duration.textContent = formatDurationLabel(result);

      titleGroup.append(dot, title);
      topRow.append(titleGroup, duration);
      item.append(topRow);

      if (result.location) {
        const subtitle = document.createElement("span");
        subtitle.className = "event-modal__template-item-subtitle";
        subtitle.textContent = result.location;
        item.append(subtitle);
      }

      item.addEventListener("click", () => {
        void selectResult(index);
      });

      list.appendChild(item);
    });

    dropdown.appendChild(list);
    dropdown.hidden = false;
  }

  function applyTemplate(result, templateEvent) {
    const timing = getTemplateTiming(result, templateEvent);
    const preservedStartDate =
      startDateInput.value
      || result?.start_date
      || templateEvent?.startDate
      || templateEvent?.start_date
      || addDaysToDateKey("", 0);
    const preservedStartMinutes =
      parseTimeToMinutes(startTimeInput.value)
      ?? parseTimeToMinutes(result?.start_time)
      ?? parseTimeToMinutes(templateEvent?.startTime)
      ?? parseTimeToMinutes(templateEvent?.start_time)
      ?? (9 * 60);

    titleInput.value = templateEvent?.title ?? "";
    locationInput.value = templateEvent?.location ?? "";
    privateDescriptionInput.value = templateEvent?.descriptionPrivate ?? "";
    publicDescriptionInput.value = templateEvent?.descriptionPublic ?? "";

    const templateCalendarId = templateEvent?.calendarId ?? templateEvent?.calendar_id;
    if (
      templateCalendarId
      && Array.from(calendarSelect.options).some((option) => option.value === templateCalendarId)
    ) {
      calendarSelect.value = templateCalendarId;
    }

    startDateInput.value = preservedStartDate;
    startTimeInput.value = minutesToTime(preservedStartMinutes);

    if (timing.allDay) {
      allDayInput.checked = true;
      endDateInput.value = addDaysToDateKey(preservedStartDate, timing.daySpan - 1);
    } else {
      const totalEndMinutes = preservedStartMinutes + timing.durationMinutes;
      allDayInput.checked = false;
      endDateInput.value = addDaysToDateKey(
        preservedStartDate,
        Math.floor(totalEndMinutes / MINUTES_PER_DAY)
      );
      endTimeInput.value = minutesToTime(totalEndMinutes);
    }

    applyAllDayState();
    titleInput.focus();
  }

  async function selectResult(index) {
    const result = results[index];
    if (!result?.id || selecting) {
      return;
    }

    selecting = true;
    clearError();

    try {
      const templateEvent = await invoke("get_event", { id: result.id });
      applyTemplate(result, templateEvent);
      reset();
    } catch (error) {
      showError(String(error));
    } finally {
      selecting = false;
    }
  }

  async function runSearch(rawQuery) {
    if (!enabled) {
      return;
    }

    const query = String(rawQuery || "").trim();
    if (query.length < MIN_QUERY_LENGTH) {
      hideDropdown();
      return;
    }

    const currentRequest = requestSeq + 1;
    requestSeq = currentRequest;

    let nextResults = [];
    try {
      nextResults = collapseResults(await invoke("search_events", { query }));
    } catch (_error) {
      hideDropdown();
      return;
    }

    if (currentRequest !== requestSeq || titleInput.value.trim() !== query) {
      return;
    }

    results = nextResults;
    activeIndex = -1;
    renderResults();
  }

  titleInput.addEventListener("input", () => {
    if (!enabled) {
      return;
    }

    clearError();

    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      void runSearch(titleInput.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  titleInput.addEventListener("keydown", (keyboardEvent) => {
    if (!enabled) {
      return;
    }

    if (keyboardEvent.key === "ArrowDown") {
      if (results.length === 0) {
        return;
      }

      keyboardEvent.preventDefault();
      activeIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % results.length;
      renderResults();
      return;
    }

    if (keyboardEvent.key === "ArrowUp") {
      if (results.length === 0) {
        return;
      }

      keyboardEvent.preventDefault();
      activeIndex = activeIndex < 0 ? results.length - 1 : (activeIndex - 1 + results.length) % results.length;
      renderResults();
      return;
    }

    if (keyboardEvent.key === "Enter" && !dropdown.hidden && results.length > 0) {
      keyboardEvent.preventDefault();
      void selectResult(activeIndex < 0 ? 0 : activeIndex);
      return;
    }

    if (keyboardEvent.key === "Escape") {
      hideDropdown();
      return;
    }

    if (keyboardEvent.key === "Tab") {
      hideDropdown();
    }
  });

  anchor.addEventListener("focusout", () => {
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (!activeElement || !anchor.contains(activeElement)) {
        hideDropdown();
      }
    }, 0);
  });

  document.addEventListener(
    "pointerdown",
    (pointerEvent) => {
      if (!enabled || dropdown.hidden) {
        return;
      }

      const target = pointerEvent.target;
      if (target instanceof Node && anchor.contains(target)) {
        return;
      }

      hideDropdown();
    },
    true
  );

  return {
    reset,
    setEnabled
  };
}
