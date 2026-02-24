import { t } from "../../i18n/strings.js";
import { getState } from "../../state.js";

function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }
  return invokeFn(command, payload);
}

function createRadio(name, value, checked, labelText) {
  const label = document.createElement("label");
  label.className = "export-dialog__radio";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  label.appendChild(input);

  const text = document.createElement("span");
  text.textContent = labelText;
  label.appendChild(text);

  return { label, input };
}

export function createExportDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "export-dialog";

  const form = document.createElement("form");
  form.className = "export-dialog__form";
  form.method = "dialog";

  const heading = document.createElement("h2");
  heading.className = "export-dialog__title";
  heading.textContent = t("exportDialogTitle");
  form.appendChild(heading);

  const error = document.createElement("p");
  error.className = "export-dialog__error";
  error.hidden = true;
  form.appendChild(error);

  const modeSection = document.createElement("fieldset");
  modeSection.className = "export-dialog__fieldset";
  const modeLegend = document.createElement("legend");
  modeLegend.className = "export-dialog__legend";
  modeLegend.textContent = t("exportModeLabel");
  modeSection.appendChild(modeLegend);

  const fullMode = createRadio("export-mode", "full", true, t("exportModeFull"));
  const publicMode = createRadio("export-mode", "public", false, t("exportModePublic"));
  modeSection.appendChild(fullMode.label);
  modeSection.appendChild(publicMode.label);
  form.appendChild(modeSection);

  const calendarSection = document.createElement("fieldset");
  calendarSection.className = "export-dialog__fieldset";
  const calendarLegend = document.createElement("legend");
  calendarLegend.className = "export-dialog__legend";
  calendarLegend.textContent = t("exportCalendarsLabel");
  calendarSection.appendChild(calendarLegend);

  const calendarList = document.createElement("div");
  calendarList.className = "export-dialog__calendar-list";
  calendarSection.appendChild(calendarList);
  form.appendChild(calendarSection);

  const preview = document.createElement("p");
  preview.className = "export-dialog__preview";
  form.appendChild(preview);

  const actions = document.createElement("div");
  actions.className = "export-dialog__actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "export-dialog__btn";
  cancelButton.textContent = t("exportCancel");
  actions.appendChild(cancelButton);

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "export-dialog__btn export-dialog__btn--primary";
  submitButton.textContent = t("exportConfirm");
  actions.appendChild(submitButton);

  form.appendChild(actions);
  dialog.appendChild(form);

  const selection = new Set();

  function showError(message) {
    error.hidden = false;
    error.textContent = message;
  }

  function clearError() {
    error.hidden = true;
    error.textContent = "";
  }

  function selectedCalendarIds() {
    return [...selection];
  }

  async function refreshPreview() {
    const calendarIds = selectedCalendarIds();
    if (calendarIds.length === 0) {
      preview.textContent = t("exportPreviewNone");
      submitButton.disabled = true;
      return;
    }

    try {
      const count = await invoke("get_export_event_count", {
        calendarIds
      });
      preview.textContent = t("exportPreviewCount").replace("{count}", String(count));
      submitButton.disabled = false;
    } catch (previewError) {
      submitButton.disabled = true;
      showError(String(previewError));
    }
  }

  function buildCalendarList() {
    calendarList.innerHTML = "";
    selection.clear();

    const calendars = getState().calendars;
    if (calendars.length === 0) {
      const empty = document.createElement("p");
      empty.className = "export-dialog__empty";
      empty.textContent = t("sidebarPlaceholder");
      calendarList.appendChild(empty);
      return;
    }

    calendars.forEach((calendar) => {
      const row = document.createElement("label");
      row.className = "export-dialog__calendar";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = calendar.id;
      input.checked = true;
      selection.add(calendar.id);
      input.addEventListener("change", () => {
        if (input.checked) {
          selection.add(calendar.id);
        } else {
          selection.delete(calendar.id);
        }
        clearError();
        void refreshPreview();
      });

      const dot = document.createElement("span");
      dot.className = "export-dialog__dot";
      dot.style.backgroundColor = calendar.color;

      const name = document.createElement("span");
      name.className = "export-dialog__calendar-name";
      name.textContent = calendar.name;

      row.appendChild(input);
      row.appendChild(dot);
      row.appendChild(name);
      calendarList.appendChild(row);
    });
  }

  function selectedMode() {
    return publicMode.input.checked ? "public" : "full";
  }

  async function open() {
    clearError();
    buildCalendarList();
    await refreshPreview();
    dialog.showModal();
  }

  cancelButton.addEventListener("click", () => {
    dialog.close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const calendarIds = selectedCalendarIds();
    if (calendarIds.length === 0) {
      showError(t("exportCalendarRequired"));
      return;
    }

    try {
      const result = await invoke("export_json", {
        mode: selectedMode(),
        calendarIds
      });
      dialog.close();
      window.alert(t("exportSuccessMessage").replace("{path}", result.path));
    } catch (exportError) {
      showError(String(exportError));
    }
  });

  return {
    element: dialog,
    open
  };
}
