import { t } from "../../i18n/strings.js";
import { getState } from "../../state.js";
import { createCalendarPickerController } from "./event-modal-calendar-picker.js";
import { createEventModalDom } from "./event-modal-dom.js";
import { createEventModalSession } from "./event-modal-session.js";
import { createEventModalSubmitHandlers } from "./event-modal-submit.js";
import { createEventTemplateSearch } from "./event-template-search.js";
import { createRecurrencePicker } from "./recurrence-picker.js";

function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }

  return invokeFn(command, payload);
}

export function createEventModal({
  confirmDialog,
  onPersist,
  onEnsureCalendars = async () => {},
  onFocusCalendarCreate = () => {},
  onDelete = async (eventId) => {
    await invoke("delete_event", { id: eventId });
    return true;
  }
}) {
  const dom = createEventModalDom({ t });
  const {
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
  } = dom;

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function clearError() {
    error.hidden = true;
    error.textContent = "";
  }

  const recurrencePicker = createRecurrencePicker({ startDateInput });
  insertRecurrenceField(recurrencePicker.element);

  const calendarPicker = createCalendarPickerController({
    getCalendars: () => getState().calendars,
    calendarSelect,
    calendarContainer,
    calendarTrigger,
    calendarDot,
    calendarLabel,
    saveButton
  });

  async function ensureCalendarsLoaded() {
    await onEnsureCalendars();
  }

  const session = createEventModalSession({
    dialog,
    form,
    heading,
    deleteButton,
    noCalendarsPrompt,
    focusCalendarCreateButton,
    titleInput,
    startDateInput,
    endDateInput,
    startTimeInput,
    endTimeInput,
    allDayInput,
    locationInput,
    privateDescriptionInput,
    publicDescriptionInput,
    recurrencePicker,
    fillCalendarOptions: calendarPicker.fillCalendarOptions,
    ensureCalendarsLoaded,
    showError,
    clearError,
    t,
    invoke
  });

  const templateField = createEventTemplateSearch({
    invoke,
    showError,
    clearError,
    applyAllDayState: session.applyAllDayState,
    titleField,
    fields: {
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
    }
  });
  session.setTemplateField(templateField);

  allDayInput.addEventListener("change", session.applyAllDayState);
  [startDateInput, endDateInput, startTimeInput, endTimeInput].forEach((input) => {
    input.addEventListener("change", () => input.blur());
  });
  titleInput.addEventListener("input", () => {
    if (titleInput.value.trim().length > 0) {
      session.setTitleValidationError(false);
    }
  });
  titleInput.addEventListener("focus", () => {
    if (titleInput.value.trim().length > 0) {
      session.setTitleValidationError(false);
    }
  });

  cancelButton.addEventListener("click", () => {
    calendarPicker.closeCalendarDropdown();
    dialog.close();
  });

  focusCalendarCreateButton.addEventListener("click", () => {
    dialog.close();
    onFocusCalendarCreate();
  });

  closeEmptyStateButton.addEventListener("click", () => {
    dialog.close();
  });

  const submitHandlers = createEventModalSubmitHandlers({
    state: session.state,
    confirmDialog,
    t,
    invoke,
    onPersist,
    onDelete,
    getCalendars: () => getState().calendars,
    calendarSelect,
    titleInput,
    dialog,
    showError,
    clearError,
    setTitleValidationError: session.setTitleValidationError,
    collectPayload: session.collectPayload,
    descriptionChanged: session.descriptionChanged
  });

  deleteButton.addEventListener("click", () => {
    void submitHandlers.handleDelete();
  });

  form.addEventListener("submit", (submitEvent) => {
    void submitHandlers.handleSubmit(submitEvent);
  });

  return {
    element: dialog,
    openCreate: session.openCreate,
    openEdit: session.openEdit
  };
}
