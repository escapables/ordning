import { t, tDayShort } from "../../i18n/strings.js";

const WEEKDAY_OPTIONS = [
  { value: "mon", dayIndex: 1 },
  { value: "tue", dayIndex: 2 },
  { value: "wed", dayIndex: 3 },
  { value: "thu", dayIndex: 4 },
  { value: "fri", dayIndex: 5 },
  { value: "sat", dayIndex: 6 },
  { value: "sun", dayIndex: 0 }
];

const ORDINAL_VALUES = [1, 2, 3, 4, 5];

function clampNumber(value, fallback, min, max) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
}

function parseDateKey(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date, count) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + count);
  return next;
}

function normalizeDateList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    .map((value) => value.trim());
}

function getWeekOfMonth(date) {
  return Math.min(5, Math.floor((date.getDate() - 1) / 7) + 1);
}

function getDayValue(date) {
  return WEEKDAY_OPTIONS.find((option) => option.dayIndex === date.getDay())?.value ?? "mon";
}

export function createRecurrencePicker({ startDateInput } = {}) {
  const element = document.createElement("section");
  element.className = "recurrence-picker";

  const repeatRow = document.createElement("div");
  repeatRow.className = "recurrence-picker__row";

  const repeatLabel = document.createElement("span");
  repeatLabel.className = "event-modal__label";
  repeatLabel.textContent = t("recurrenceRepeat");

  const repeatSelect = document.createElement("select");
  repeatSelect.className = "event-modal__input";
  repeatSelect.name = "recurrenceRepeat";

  [
    ["none", t("recurrenceNone")],
    ["weekly", t("recurrenceWeekly")],
    ["monthly", t("recurrenceMonthly")]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    repeatSelect.appendChild(option);
  });

  repeatRow.append(repeatLabel, repeatSelect);
  element.appendChild(repeatRow);

  const intervalRow = document.createElement("div");
  intervalRow.className = "recurrence-picker__row";

  const intervalPrefix = document.createElement("span");
  intervalPrefix.textContent = t("recurrenceEvery");

  const intervalInput = document.createElement("input");
  intervalInput.className = "event-modal__input";
  intervalInput.type = "number";
  intervalInput.name = "recurrenceInterval";
  intervalInput.min = "1";
  intervalInput.max = "52";
  intervalInput.value = "1";

  const intervalUnit = document.createElement("span");
  intervalRow.append(intervalPrefix, intervalInput, intervalUnit);
  element.appendChild(intervalRow);

  const weeklyRow = document.createElement("div");
  weeklyRow.className = "recurrence-picker__row";

  const weeklyPrefix = document.createElement("span");
  weeklyPrefix.textContent = t("recurrenceOn");
  weeklyRow.appendChild(weeklyPrefix);

  const chipButtons = WEEKDAY_OPTIONS.map((option) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "recurrence-picker__chip";
    chip.dataset.value = option.value;
    chip.setAttribute("aria-pressed", "false");
    chip.textContent = tDayShort(option.dayIndex);
    chip.addEventListener("click", () => {
      const nextPressed = chip.getAttribute("aria-pressed") !== "true";
      chip.setAttribute("aria-pressed", nextPressed ? "true" : "false");
    });
    weeklyRow.appendChild(chip);
    return chip;
  });
  element.appendChild(weeklyRow);

  const monthlyRow = document.createElement("div");
  monthlyRow.className = "recurrence-picker__row";

  const monthlyPrefix = document.createElement("span");
  monthlyPrefix.textContent = t("recurrenceOnThe");

  const weekOfMonthSelect = document.createElement("select");
  weekOfMonthSelect.className = "event-modal__input";
  weekOfMonthSelect.name = "recurrenceWeekOfMonth";
  ORDINAL_VALUES.forEach((value) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = t(`recurrenceOrdinal${value}`);
    weekOfMonthSelect.appendChild(option);
  });

  const dayOfWeekSelect = document.createElement("select");
  dayOfWeekSelect.className = "event-modal__input";
  dayOfWeekSelect.name = "recurrenceDayOfWeek";
  WEEKDAY_OPTIONS.forEach((option) => {
    const dayOption = document.createElement("option");
    dayOption.value = option.value;
    dayOption.textContent = tDayShort(option.dayIndex);
    dayOfWeekSelect.appendChild(dayOption);
  });

  monthlyRow.append(monthlyPrefix, weekOfMonthSelect, dayOfWeekSelect);
  element.appendChild(monthlyRow);

  const endsRow = document.createElement("div");
  endsRow.className = "recurrence-picker__row";

  const endsLabel = document.createElement("span");
  endsLabel.textContent = t("recurrenceEnds");

  const endsSelect = document.createElement("select");
  endsSelect.className = "event-modal__input";
  endsSelect.name = "recurrenceEnds";
  [
    ["never", t("recurrenceNever")],
    ["after", t("recurrenceAfter")],
    ["on_date", t("recurrenceOnDate")]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    endsSelect.appendChild(option);
  });

  const afterCountInput = document.createElement("input");
  afterCountInput.className = "event-modal__input";
  afterCountInput.type = "number";
  afterCountInput.name = "recurrenceOccurrences";
  afterCountInput.min = "1";
  afterCountInput.max = "999";
  afterCountInput.value = "10";

  const afterCountLabel = document.createElement("span");
  afterCountLabel.textContent = t("recurrenceOccurrences");

  const untilDateInput = document.createElement("input");
  untilDateInput.className = "event-modal__input";
  untilDateInput.type = "date";
  untilDateInput.name = "recurrenceUntilDate";

  endsRow.append(
    endsLabel,
    endsSelect,
    afterCountInput,
    afterCountLabel,
    untilDateInput
  );
  element.appendChild(endsRow);

  let exceptionDates = [];

  function resolveStartDate() {
    return parseDateKey(startDateInput?.value) ?? new Date();
  }

  function defaultUntilDate() {
    return formatDateKey(addMonths(resolveStartDate(), 3));
  }

  function setSelectedDays(dayValues) {
    const active = new Set(dayValues);
    chipButtons.forEach((chip) => {
      chip.setAttribute(
        "aria-pressed",
        active.has(chip.dataset.value) ? "true" : "false"
      );
    });
  }

  function selectedDays() {
    return chipButtons
      .filter((chip) => chip.getAttribute("aria-pressed") === "true")
      .map((chip) => chip.dataset.value);
  }

  function applyStartDateDefaults() {
    const startDate = resolveStartDate();
    setSelectedDays([getDayValue(startDate)]);
    weekOfMonthSelect.value = String(getWeekOfMonth(startDate));
    dayOfWeekSelect.value = getDayValue(startDate);
    untilDateInput.value = defaultUntilDate();
  }

  function syncVisibility() {
    const frequency = repeatSelect.value;
    const endsMode = endsSelect.value;

    intervalRow.hidden = frequency === "none";
    weeklyRow.hidden = frequency !== "weekly";
    monthlyRow.hidden = frequency !== "monthly";
    endsRow.hidden = frequency === "none";
    afterCountInput.hidden = endsRow.hidden || endsMode !== "after";
    afterCountLabel.hidden = afterCountInput.hidden;
    untilDateInput.hidden = endsRow.hidden || endsMode !== "on_date";
    intervalUnit.textContent = frequency === "monthly"
      ? t("recurrenceMonths")
      : t("recurrenceWeeks");

    if (!afterCountInput.hidden && !afterCountInput.value) {
      afterCountInput.value = "10";
    }

    if (!untilDateInput.hidden && !untilDateInput.value) {
      untilDateInput.value = defaultUntilDate();
    }
  }

  function loadRecurrence(rule) {
    if (!rule) {
      reset();
      return;
    }

    exceptionDates = normalizeDateList(rule.exception_dates);
    repeatSelect.value = rule.frequency === "monthly" ? "monthly" : "weekly";
    intervalInput.value = String(clampNumber(rule.interval, 1, 1, 52));

    if (repeatSelect.value === "weekly") {
      const days = Array.isArray(rule.days_of_week) && rule.days_of_week.length > 0
        ? rule.days_of_week
        : [getDayValue(resolveStartDate())];
      setSelectedDays(days);
    } else {
      weekOfMonthSelect.value = String(
        clampNumber(rule.week_of_month, getWeekOfMonth(resolveStartDate()), 1, 5)
      );
      dayOfWeekSelect.value = rule.day_of_week || getDayValue(resolveStartDate());
    }

    const endCondition = rule.end_condition ?? { type: "never" };
    if (endCondition.type === "after_count") {
      endsSelect.value = "after";
      afterCountInput.value = String(clampNumber(endCondition.count, 10, 1, 999));
      untilDateInput.value = defaultUntilDate();
    } else if (endCondition.type === "until_date") {
      endsSelect.value = "on_date";
      afterCountInput.value = "10";
      untilDateInput.value = parseDateKey(endCondition.until_date)
        ? endCondition.until_date
        : defaultUntilDate();
    } else {
      endsSelect.value = "never";
      afterCountInput.value = "10";
      untilDateInput.value = defaultUntilDate();
    }

    syncVisibility();
  }

  function collectRecurrence() {
    if (repeatSelect.value === "none") {
      return null;
    }

    const interval = clampNumber(intervalInput.value, 1, 1, 52);
    const endConditionType = endsSelect.value === "after"
      ? "after_count"
      : (endsSelect.value === "on_date" ? "until_date" : "never");

    return {
      frequency: repeatSelect.value,
      interval,
      daysOfWeek: repeatSelect.value === "weekly" ? selectedDays() : [],
      endConditionType,
      endConditionCount: endConditionType === "after_count"
        ? clampNumber(afterCountInput.value, 10, 1, 999)
        : null,
      endConditionUntilDate: endConditionType === "until_date"
        ? (parseDateKey(untilDateInput.value) ? untilDateInput.value : defaultUntilDate())
        : null,
      exceptionDates: [...exceptionDates],
      weekOfMonth: repeatSelect.value === "monthly"
        ? clampNumber(weekOfMonthSelect.value, getWeekOfMonth(resolveStartDate()), 1, 5)
        : null,
      dayOfWeek: repeatSelect.value === "monthly"
        ? dayOfWeekSelect.value
        : null
    };
  }

  function reset() {
    exceptionDates = [];
    repeatSelect.value = "none";
    intervalInput.value = "1";
    endsSelect.value = "never";
    afterCountInput.value = "10";
    applyStartDateDefaults();
    syncVisibility();
  }

  repeatSelect.addEventListener("change", () => {
    if (repeatSelect.value === "weekly") {
      setSelectedDays([getDayValue(resolveStartDate())]);
    }

    if (repeatSelect.value === "monthly") {
      weekOfMonthSelect.value = String(getWeekOfMonth(resolveStartDate()));
      dayOfWeekSelect.value = getDayValue(resolveStartDate());
    }

    if (repeatSelect.value !== "none" && endsSelect.value === "on_date") {
      untilDateInput.value = defaultUntilDate();
    }

    syncVisibility();
  });

  endsSelect.addEventListener("change", () => {
    if (endsSelect.value === "on_date") {
      untilDateInput.value = defaultUntilDate();
    }

    syncVisibility();
  });
  intervalInput.addEventListener("change", () => {
    intervalInput.value = String(clampNumber(intervalInput.value, 1, 1, 52));
  });
  afterCountInput.addEventListener("change", () => {
    afterCountInput.value = String(clampNumber(afterCountInput.value, 10, 1, 999));
  });

  reset();

  return {
    element,
    collectRecurrence,
    loadRecurrence,
    reset
  };
}
