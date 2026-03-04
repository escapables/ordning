import { FORCE_HIDDEN_CLASS, defaultTimes, todayDateKey } from "./event-modal-dom.js";

const EDITABLE_SECTIONS_SELECTOR =
  ".event-modal__field, .event-modal__row, .event-modal__checkbox, .event-modal__actions, .recurrence-picker";

const EMPTY_TEMPLATE_FIELD = {
  reset() {},
  setEnabled() {}
};

export function createEventModalSession({
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
  fillCalendarOptions,
  ensureCalendarsLoaded,
  showError,
  clearError,
  t,
  invoke
}) {
  const state = {
    mode: "create",
    editingId: null,
    originalDescriptionPrivate: "",
    originalDescriptionPublic: "",
    instanceDate: null,
    isVirtual: false
  };

  let templateField = EMPTY_TEMPLATE_FIELD;

  function setTemplateField(nextTemplateField) {
    templateField = nextTemplateField ?? EMPTY_TEMPLATE_FIELD;
  }

  function toggleNoCalendarsCreateState(enabled) {
    noCalendarsPrompt.hidden = !enabled;
    noCalendarsPrompt.classList.toggle(FORCE_HIDDEN_CLASS, !enabled);
    templateField.setEnabled(!enabled && state.mode === "create");
    const editableSections = form.querySelectorAll(EDITABLE_SECTIONS_SELECTOR);
    editableSections.forEach((section) => {
      section.hidden = enabled;
      section.classList.toggle(FORCE_HIDDEN_CLASS, enabled);
    });
  }

  function setTitleValidationError(active) {
    titleInput.classList.toggle("event-modal__input--error", active);
  }

  function applyAllDayState() {
    const disabled = allDayInput.checked;
    startTimeInput.disabled = disabled;
    endTimeInput.disabled = disabled;
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
    state.instanceDate = null;
    state.isVirtual = false;
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
      calendarId: form.elements.calendarId.value,
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

  function descriptionChanged(payload) {
    return payload.descriptionPrivate !== state.originalDescriptionPrivate
      || payload.descriptionPublic !== state.originalDescriptionPublic;
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

  async function openEdit(eventId, instanceContext = {}) {
    clearError();
    setModeEdit(eventId);
    state.instanceDate = instanceContext.instanceDate ?? null;
    state.isVirtual = Boolean(instanceContext.isVirtual);

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

  return {
    state,
    setTemplateField,
    setTitleValidationError,
    applyAllDayState,
    collectPayload,
    descriptionChanged,
    openCreate,
    openEdit
  };
}
