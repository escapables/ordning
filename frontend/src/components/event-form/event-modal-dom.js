import { createDatePicker } from "../pickers/date-picker.js";
import { createTimePicker } from "../pickers/time-picker.js";

export const FORCE_HIDDEN_CLASS = "event-modal__hidden";

export function todayDateKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function defaultTimes() {
  return { startTime: "09:00", endTime: "10:00" };
}

function createField(labelText, input, className = "", options = {}) {
  const { labelPrefix = "", labelTitle = "" } = options;
  const wrapper = document.createElement("label");
  wrapper.className = `event-modal__field ${className}`.trim();

  const label = document.createElement("span");
  label.className = "event-modal__label";
  label.textContent = `${labelPrefix}${labelText}`;
  if (labelTitle) {
    label.title = labelTitle;
  }

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
}

function createInput(type, name) {
  const input = document.createElement("input");
  input.className = "event-modal__input";
  input.type = type;
  input.name = name;
  return input;
}

export function createEventModalDom({ t }) {
  const dialog = document.createElement("dialog");
  dialog.className = "event-modal";

  const form = document.createElement("form");
  form.className = "event-modal__form";
  form.method = "dialog";

  const heading = document.createElement("h2");
  heading.className = "event-modal__title";
  form.appendChild(heading);

  const error = document.createElement("p");
  error.className = "event-modal__error";
  error.hidden = true;
  form.appendChild(error);

  const noCalendarsPrompt = document.createElement("div");
  noCalendarsPrompt.className = "event-modal__empty";
  noCalendarsPrompt.hidden = true;

  const noCalendarsText = document.createElement("p");
  noCalendarsText.className = "event-modal__empty-text";
  noCalendarsText.textContent = t("eventFormNoCalendarsPrompt");

  const noCalendarsActions = document.createElement("div");
  noCalendarsActions.className = "event-modal__empty-actions";

  const focusCalendarCreateButton = document.createElement("button");
  focusCalendarCreateButton.type = "button";
  focusCalendarCreateButton.className = "event-modal__btn event-modal__btn--primary";
  focusCalendarCreateButton.textContent = t("eventFormFocusCalendarCreate");

  const closeEmptyStateButton = document.createElement("button");
  closeEmptyStateButton.type = "button";
  closeEmptyStateButton.className = "event-modal__btn";
  closeEmptyStateButton.textContent = t("eventFormCancel");

  noCalendarsActions.append(focusCalendarCreateButton, closeEmptyStateButton);
  noCalendarsPrompt.append(noCalendarsText, noCalendarsActions);
  form.appendChild(noCalendarsPrompt);

  const titleInput = createInput("text", "title");
  titleInput.maxLength = 200;
  const titleField = createField(t("eventFormTitle"), titleInput);
  form.appendChild(titleField);

  const calendarSelect = document.createElement("select");
  calendarSelect.className = "event-modal__input";
  calendarSelect.name = "calendarId";
  calendarSelect.required = true;
  calendarSelect.style.cssText = "position:absolute;opacity:0;pointer-events:none;width:0;height:0";

  const calendarContainer = document.createElement("div");
  calendarContainer.className = "picker picker--calendar";

  const calendarTrigger = document.createElement("button");
  calendarTrigger.type = "button";
  calendarTrigger.className = "event-modal__input picker__trigger";
  const calendarDot = document.createElement("span");
  calendarDot.className = "picker__dot";
  const calendarLabel = document.createElement("span");
  calendarLabel.className = "picker__trigger-label";
  calendarTrigger.append(calendarDot, calendarLabel);

  calendarContainer.append(calendarSelect, calendarTrigger);
  form.appendChild(createField(t("eventFormCalendar"), calendarContainer));

  const dateRow = document.createElement("div");
  dateRow.className = "event-modal__row";
  const startDatePicker = createDatePicker({ name: "startDate", required: true });
  const startDateInput = startDatePicker.input;
  const endDatePicker = createDatePicker({ name: "endDate", required: true });
  const endDateInput = endDatePicker.input;
  dateRow.appendChild(createField(t("eventFormStartDate"), startDatePicker.container));
  dateRow.appendChild(createField(t("eventFormEndDate"), endDatePicker.container));
  form.appendChild(dateRow);

  const timeRow = document.createElement("div");
  timeRow.className = "event-modal__row";
  const startTimePicker = createTimePicker({ name: "startTime", required: true });
  const startTimeInput = startTimePicker.input;
  const endTimePicker = createTimePicker({ name: "endTime", required: true });
  const endTimeInput = endTimePicker.input;
  timeRow.appendChild(createField(t("eventFormStartTime"), startTimePicker.container));
  timeRow.appendChild(createField(t("eventFormEndTime"), endTimePicker.container));
  form.appendChild(timeRow);

  const allDayLabel = document.createElement("label");
  allDayLabel.className = "event-modal__checkbox";
  const allDayInput = createInput("checkbox", "allDay");
  allDayInput.className = "event-modal__checkbox-input";
  const allDayText = document.createElement("span");
  allDayText.textContent = t("eventFormAllDay");
  allDayLabel.appendChild(allDayInput);
  allDayLabel.appendChild(allDayText);
  form.appendChild(allDayLabel);

  const locationInput = createInput("text", "location");
  locationInput.maxLength = 200;
  form.appendChild(createField(t("eventFormLocation"), locationInput));

  const privateDescriptionInput = document.createElement("textarea");
  privateDescriptionInput.className =
    "event-modal__input event-modal__input--private event-modal__textarea";
  privateDescriptionInput.name = "descriptionPrivate";
  privateDescriptionInput.rows = 3;
  const privateDescriptionField = createField(
    t("eventFormPrivateDescription"),
    privateDescriptionInput,
    "",
    {
      labelPrefix: "\uD83D\uDD12 ",
      labelTitle: t("eventFormPrivateDescriptionTooltip")
    }
  );

  const publicDescriptionInput = document.createElement("textarea");
  publicDescriptionInput.className = "event-modal__input event-modal__textarea";
  publicDescriptionInput.name = "descriptionPublic";
  publicDescriptionInput.rows = 3;
  const publicDescriptionField = createField(t("eventFormPublicDescription"), publicDescriptionInput);

  form.appendChild(privateDescriptionField);
  form.appendChild(publicDescriptionField);

  const actions = document.createElement("div");
  actions.className = "event-modal__actions";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "event-modal__btn event-modal__btn--danger";
  deleteButton.textContent = t("eventFormDelete");

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "event-modal__btn";
  cancelButton.textContent = t("eventFormCancel");

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "event-modal__btn event-modal__btn--primary";
  saveButton.textContent = t("eventFormSave");

  actions.appendChild(deleteButton);
  actions.appendChild(cancelButton);
  actions.appendChild(saveButton);
  form.appendChild(actions);

  dialog.appendChild(form);

  const insertRecurrenceField = (element) => {
    form.insertBefore(element, privateDescriptionField);
  };

  return {
    dialog,
    form,
    heading,
    error,
    noCalendarsPrompt,
    focusCalendarCreateButton,
    closeEmptyStateButton,
    titleField,
    titleInput,
    calendarSelect,
    calendarContainer,
    calendarTrigger,
    calendarDot,
    calendarLabel,
    startDateInput,
    endDateInput,
    startTimeInput,
    endTimeInput,
    allDayInput,
    locationInput,
    privateDescriptionInput,
    publicDescriptionInput,
    deleteButton,
    cancelButton,
    saveButton,
    insertRecurrenceField
  };
}
