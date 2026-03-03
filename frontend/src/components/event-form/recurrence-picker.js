import { t, tDayShort } from "../../i18n/strings.js";
import { createDatePicker } from "../pickers/date-picker.js";
import { createSelectPicker } from "../pickers/select-picker.js";

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
  repeatRow.className = "recurrence-picker__row recurrence-picker__row--top";

  const repeatLabel = document.createElement("span");
  repeatLabel.className = "event-modal__label";
  repeatLabel.textContent = t("recurrenceRepeat");

  const repeatPicker = createSelectPicker({
    name: "recurrenceRepeat",
    items: [
      ["none", t("recurrenceNone")],
      ["weekly", t("recurrenceWeekly")],
      ["monthly", t("recurrenceMonthly")]
    ]
  });
  const repeatSelect = repeatPicker.select;

  repeatRow.append(repeatLabel, repeatPicker.container);
  element.appendChild(repeatRow);

  const subGroup = document.createElement("div");
  subGroup.className = "recurrence-picker__sub";

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
  subGroup.appendChild(intervalRow);

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
  subGroup.appendChild(weeklyRow);

  const monthlyRow = document.createElement("div");
  monthlyRow.className = "recurrence-picker__row";

  const monthlyPrefix = document.createElement("span");
  monthlyPrefix.textContent = t("recurrenceOnThe");

  const weekOfMonthPicker = createSelectPicker({
    name: "recurrenceWeekOfMonth",
    items: ORDINAL_VALUES.map((value) => [String(value), t(`recurrenceOrdinal${value}`)])
  });
  const weekOfMonthSelect = weekOfMonthPicker.select;

  const dayOfWeekPicker = createSelectPicker({
    name: "recurrenceDayOfWeek",
    items: WEEKDAY_OPTIONS.map((option) => [option.value, tDayShort(option.dayIndex)])
  });
  const dayOfWeekSelect = dayOfWeekPicker.select;

  monthlyRow.append(monthlyPrefix, weekOfMonthPicker.container, dayOfWeekPicker.container);
  subGroup.appendChild(monthlyRow);

  const endsRow = document.createElement("div");
  endsRow.className = "recurrence-picker__row";

  const endsLabel = document.createElement("span");
  endsLabel.textContent = t("recurrenceEnds");

  const endsPicker = createSelectPicker({
    name: "recurrenceEnds",
    items: [
      ["never", t("recurrenceNever")],
      ["after", t("recurrenceAfter")],
      ["on_date", t("recurrenceOnDate")]
    ]
  });
  const endsSelect = endsPicker.select;

  const afterCountInput = document.createElement("input");
  afterCountInput.className = "event-modal__input";
  afterCountInput.type = "number";
  afterCountInput.name = "recurrenceOccurrences";
  afterCountInput.min = "1";
  afterCountInput.max = "999";
  afterCountInput.value = "10";

  const afterCountLabel = document.createElement("span");
  afterCountLabel.textContent = t("recurrenceOccurrences");

  const untilDatePicker = createDatePicker({ name: "recurrenceUntilDate" });
  const untilDateInput = untilDatePicker.input;

  endsRow.append(
    endsLabel,
    endsPicker.container,
    afterCountInput,
    afterCountLabel,
    untilDatePicker.container
  );
  subGroup.appendChild(endsRow);
  element.appendChild(subGroup);

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
    weekOfMonthPicker.syncDisplay();
    dayOfWeekSelect.value = getDayValue(startDate);
    dayOfWeekPicker.syncDisplay();
    untilDateInput.value = defaultUntilDate();
  }

  function syncVisibility() {
    const frequency = repeatSelect.value;
    const endsMode = endsSelect.value;

    subGroup.hidden = frequency === "none";
    intervalRow.hidden = frequency === "none";
    weeklyRow.hidden = frequency !== "weekly";
    monthlyRow.hidden = frequency !== "monthly";
    endsRow.hidden = frequency === "none";
    afterCountInput.hidden = endsRow.hidden || endsMode !== "after";
    afterCountLabel.hidden = afterCountInput.hidden;
    untilDatePicker.container.hidden = endsRow.hidden || endsMode !== "on_date";
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
    repeatPicker.syncDisplay();
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
      weekOfMonthPicker.syncDisplay();
      dayOfWeekSelect.value = rule.day_of_week || getDayValue(resolveStartDate());
      dayOfWeekPicker.syncDisplay();
    }

    const endCondition = rule.end_condition ?? { type: "never" };
    if (endCondition.type === "after_count") {
      endsSelect.value = "after";
      endsPicker.syncDisplay();
      afterCountInput.value = String(clampNumber(endCondition.count, 10, 1, 999));
      untilDateInput.value = defaultUntilDate();
    } else if (endCondition.type === "until_date") {
      endsSelect.value = "on_date";
      endsPicker.syncDisplay();
      afterCountInput.value = "10";
      untilDateInput.value = parseDateKey(endCondition.until_date)
        ? endCondition.until_date
        : defaultUntilDate();
    } else {
      endsSelect.value = "never";
      endsPicker.syncDisplay();
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
    repeatPicker.syncDisplay();
    intervalInput.value = "1";
    endsSelect.value = "never";
    endsPicker.syncDisplay();
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
      weekOfMonthPicker.syncDisplay();
      dayOfWeekSelect.value = getDayValue(resolveStartDate());
      dayOfWeekPicker.syncDisplay();
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
