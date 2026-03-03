import { t } from "../../i18n/strings.js";
import { getState } from "../../state.js";
import { createRecurrencePicker } from "./recurrence-picker.js";
import { createEventTemplateSearch } from "./event-template-search.js";

function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }

  return invokeFn(command, payload);
}

function todayDateKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function defaultTimes() {
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
  const FORCE_HIDDEN_CLASS = "event-modal__hidden";
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
  form.appendChild(createField(t("eventFormCalendar"), calendarSelect));

  const dateRow = document.createElement("div");
  dateRow.className = "event-modal__row";
  const startDateInput = createInput("date", "startDate");
  startDateInput.required = true;
  const endDateInput = createInput("date", "endDate");
  endDateInput.required = true;
  dateRow.appendChild(createField(t("eventFormStartDate"), startDateInput));
  dateRow.appendChild(createField(t("eventFormEndDate"), endDateInput));
  form.appendChild(dateRow);

  const timeRow = document.createElement("div");
  timeRow.className = "event-modal__row";
  const startTimeInput = createInput("time", "startTime");
  startTimeInput.required = true;
  const endTimeInput = createInput("time", "endTime");
  endTimeInput.required = true;
  timeRow.appendChild(createField(t("eventFormStartTime"), startTimeInput));
  timeRow.appendChild(createField(t("eventFormEndTime"), endTimeInput));
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

  const recurrencePicker = createRecurrencePicker({ startDateInput });
  form.appendChild(recurrencePicker.element);

  const privateDescriptionInput = document.createElement("textarea");
  privateDescriptionInput.className =
    "event-modal__input event-modal__input--private event-modal__textarea";
  privateDescriptionInput.name = "descriptionPrivate";
  privateDescriptionInput.rows = 3;
  form.appendChild(
    createField(t("eventFormPrivateDescription"), privateDescriptionInput, "", {
      labelPrefix: "\uD83D\uDD12 ",
      labelTitle: t("eventFormPrivateDescriptionTooltip")
    })
  );

  const publicDescriptionInput = document.createElement("textarea");
  publicDescriptionInput.className = "event-modal__input event-modal__textarea";
  publicDescriptionInput.name = "descriptionPublic";
  publicDescriptionInput.rows = 3;
  form.appendChild(createField(t("eventFormPublicDescription"), publicDescriptionInput));

  const templateField = createEventTemplateSearch({
    invoke,
    showError,
    clearError,
    applyAllDayState,
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

  const state = {
    mode: "create",
    editingId: null,
    originalDescriptionPrivate: "",
    originalDescriptionPublic: ""
  };

  function toggleNoCalendarsCreateState(enabled) {
    noCalendarsPrompt.hidden = !enabled;
    noCalendarsPrompt.classList.toggle(FORCE_HIDDEN_CLASS, !enabled);
    templateField.setEnabled(!enabled && state.mode === "create");
    const editableSections = form.querySelectorAll(
      ".event-modal__field, .event-modal__row, .event-modal__checkbox, .event-modal__actions, .recurrence-picker"
    );
    editableSections.forEach((section) => {
      section.hidden = enabled;
      section.classList.toggle(FORCE_HIDDEN_CLASS, enabled);
    });
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function clearError() {
    error.hidden = true;
    error.textContent = "";
  }

  function setTitleValidationError(active) {
    titleInput.classList.toggle("event-modal__input--error", active);
  }

  function applyAllDayState() {
    const disabled = allDayInput.checked;
    startTimeInput.disabled = disabled;
    endTimeInput.disabled = disabled;
  }

  function defaultCalendarId(calendars) {
    return calendars.find((calendar) => calendar.visible)?.id ?? calendars[0]?.id ?? "";
  }

  function setCalendarAvailability(hasCalendars) {
    calendarSelect.disabled = !hasCalendars;
    saveButton.disabled = !hasCalendars;
  }

  function fillCalendarOptions(selectedCalendarId, preferVisibleDefault = false) {
    calendarSelect.innerHTML = "";
    const calendars = getState().calendars;

    calendars.forEach((calendar) => {
      const option = document.createElement("option");
      option.value = calendar.id;
      option.textContent = `● ${calendar.name}`;
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
    return calendars.length > 0;
  }

  async function ensureCalendarsLoaded() {
    // Always refresh before opening create/edit to avoid stale calendar state.
    await onEnsureCalendars();
  }

  function setDefaults() {
    const { startTime, endTime } = defaultTimes();
    const dateKey = todayDateKey();

    titleInput.value = "";
    startDateInput.value = dateKey;
    endDateInput.value = dateKey;
    startTimeInput.value = startTime;
    endTimeInput.value = endTime;
    allDayInput.checked = false;
    locationInput.value = "";
    privateDescriptionInput.value = "";
    publicDescriptionInput.value = "";
    templateField.reset();
    recurrencePicker.reset();
    applyAllDayState();
    setTitleValidationError(false);
  }

  function setModeCreate() {
    state.mode = "create";
    state.editingId = null;
    heading.textContent = t("eventFormCreateHeading");
    deleteButton.hidden = true;
    templateField.setEnabled(true);
  }

  function setModeEdit(eventId) {
    state.mode = "edit";
    state.editingId = eventId;
    heading.textContent = t("eventFormEditHeading");
    deleteButton.hidden = false;
    templateField.setEnabled(false);
    toggleNoCalendarsCreateState(false);
  }

  function collectPayload() {
    return {
      calendarId: calendarSelect.value,
      title: titleInput.value,
      startDate: startDateInput.value,
      endDate: endDateInput.value,
      startTime: allDayInput.checked ? null : startTimeInput.value,
      endTime: allDayInput.checked ? null : endTimeInput.value,
      allDay: allDayInput.checked,
      descriptionPrivate: privateDescriptionInput.value,
      descriptionPublic: publicDescriptionInput.value,
      location: locationInput.value,
      recurrence: recurrencePicker.collectRecurrence()
    };
  }

  async function openCreate(prefill = {}) {
    clearError();
    setModeCreate();

    await ensureCalendarsLoaded();
    const hasCalendars = fillCalendarOptions(prefill.calendarId, true);
    setDefaults();

    if (prefill.startDate || prefill.date) {
      startDateInput.value = prefill.startDate ?? prefill.date;
    }

    if (prefill.endDate || prefill.date) {
      endDateInput.value = prefill.endDate ?? prefill.date;
    }

    if (prefill.startTime) {
      startTimeInput.value = prefill.startTime;
    }

    if (prefill.endTime) {
      endTimeInput.value = prefill.endTime;
    }

    toggleNoCalendarsCreateState(!hasCalendars);
    if (!hasCalendars) {
      showError(t("eventFormNoCalendars"));
    }

    dialog.showModal();
    if (hasCalendars) {
      titleInput.focus();
    } else {
      focusCalendarCreateButton.focus();
    }
  }

  async function openEdit(eventId) {
    clearError();
    setModeEdit(eventId);

    try {
      await ensureCalendarsLoaded();
      const event = await invoke("get_event", { id: eventId });
      fillCalendarOptions(event.calendarId);

      titleInput.value = event.title ?? "";
      startDateInput.value = event.startDate ?? todayDateKey();
      endDateInput.value = event.endDate ?? startDateInput.value;
      startTimeInput.value = event.startTime ?? "09:00";
      endTimeInput.value = event.endTime ?? "10:00";
      allDayInput.checked = Boolean(event.allDay);
      locationInput.value = event.location ?? "";
      privateDescriptionInput.value = event.descriptionPrivate ?? "";
      publicDescriptionInput.value = event.descriptionPublic ?? "";
      state.originalDescriptionPrivate = privateDescriptionInput.value;
      state.originalDescriptionPublic = publicDescriptionInput.value;
      recurrencePicker.loadRecurrence(event.recurrence ?? null);
      applyAllDayState();
      setTitleValidationError(false);

      dialog.showModal();
      titleInput.focus();
    } catch (invokeError) {
      showError(String(invokeError));
      dialog.showModal();
    }
  }

  allDayInput.addEventListener("change", applyAllDayState);
  [startDateInput, endDateInput, startTimeInput, endTimeInput].forEach(input => {
    input.addEventListener("change", () => input.blur());
  });
  titleInput.addEventListener("input", () => {
    if (titleInput.value.trim().length > 0) {
      setTitleValidationError(false);
    }
  });
  titleInput.addEventListener("focus", () => {
    if (titleInput.value.trim().length > 0) {
      setTitleValidationError(false);
    }
  });

  cancelButton.addEventListener("click", () => {
    dialog.close();
  });

  focusCalendarCreateButton.addEventListener("click", () => {
    dialog.close();
    onFocusCalendarCreate();
  });

  closeEmptyStateButton.addEventListener("click", () => {
    dialog.close();
  });

  deleteButton.addEventListener("click", async () => {
    if (!state.editingId) {
      return;
    }

    try {
      const deleted = await onDelete(state.editingId);
      if (!deleted) {
        return;
      }

      dialog.close();
    } catch (invokeError) {
      showError(String(invokeError));
    }
  });

  function descriptionChanged(payload) {
    return payload.descriptionPrivate !== state.originalDescriptionPrivate
      || payload.descriptionPublic !== state.originalDescriptionPublic;
  }

  async function maybeBulkUpdateDescriptions(payload) {
    if (!confirmDialog || !state.editingId || !descriptionChanged(payload)) {
      return true;
    }

    const matchCount = await invoke("count_events_by_title", {
      title: payload.title,
      calendarId: payload.calendarId,
      excludeId: state.editingId
    });

    if (matchCount === 0) {
      return true;
    }

    const choice = await confirmDialog.choose(
      t("bulkDescriptionPrompt").replace("{count}", matchCount),
      {
        confirmLabel: t("bulkDescriptionUpdateAll"),
        confirmTone: "success",
        alternateLabel: t("bulkDescriptionOnlyThis")
      }
    );

    if (choice === false) {
      return false;
    }

    if (choice === true) {
      await invoke("bulk_update_descriptions", {
        title: payload.title,
        calendarId: payload.calendarId,
        excludeId: state.editingId,
        descriptionPrivate: payload.descriptionPrivate,
        descriptionPublic: payload.descriptionPublic
      });
    }

    return true;
  }

  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    clearError();

    if (state.mode === "create" && getState().calendars.length === 0) {
      showError(t("eventFormNoCalendars"));
      return;
    }

    if (!calendarSelect.value) {
      showError(t("eventFormCalendarRequired"));
      return;
    }

    if (titleInput.value.trim().length === 0) {
      setTitleValidationError(true);
      titleInput.focus();
      return;
    }

    const payload = collectPayload();

    try {
      if (state.mode === "edit" && state.editingId) {
        const proceed = await maybeBulkUpdateDescriptions(payload);
        if (!proceed) {
          return;
        }
        await invoke("update_event", { id: state.editingId, event: payload });
      } else {
        await invoke("create_event", { event: payload });
      }

      await onPersist?.();
      dialog.close();
    } catch (invokeError) {
      showError(String(invokeError));
    }
  });

  return {
    element: dialog,
    openCreate,
    openEdit
  };
}
