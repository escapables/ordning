import {
  addDaysToDateKey,
  getTemplateTiming,
  MINUTES_PER_DAY,
  minutesToTime,
  parseTimeToMinutes
} from "./event-template-search-formatters.js";

export function applyTemplateToFields({
  result,
  templateEvent,
  fields,
  applyAllDayState
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
    calendarSelect.dispatchEvent(new Event("change", { bubbles: true }));
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
