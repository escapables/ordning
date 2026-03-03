import { t } from "../../i18n/strings.js";
import { getState } from "../../state.js";
import { getDialogDefaultPath } from "../../utils/dialog-default-path.js";

function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }
  return invokeFn(command, payload);
}

function createRadio(name, value, checked, labelText, subtitleText) {
  const label = document.createElement("label");
  label.className = "export-dialog__radio";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  label.appendChild(input);

  const textGroup = document.createElement("span");
  textGroup.className = "export-dialog__radio-copy";

  const text = document.createElement("span");
  text.className = "export-dialog__radio-label";
  text.textContent = labelText;
  textGroup.appendChild(text);

  const subtitle = document.createElement("span");
  subtitle.className = "export-dialog__radio-subtitle";
  subtitle.textContent = subtitleText;
  textGroup.appendChild(subtitle);

  label.appendChild(textGroup);

  return { label, input };
}

function createPasswordField(className, labelText) {
  const row = document.createElement("label");
  row.className = "export-dialog__field";

  const label = document.createElement("span");
  label.className = "export-dialog__field-label";
  label.textContent = labelText;
  row.appendChild(label);

  const input = document.createElement("input");
  input.type = "password";
  input.className = className;
  input.autocomplete = "new-password";
  row.appendChild(input);

  return { row, input };
}

export function createExportDialog({ onPrint } = {}) {
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

  const fullMode = createRadio("export-mode", "full", true, t("exportModeFull"), t("exportModeFullSubtitle"));
  const publicMode = createRadio("export-mode", "public", false, t("exportModePublic"), t("exportModePublicSubtitle"));
  modeSection.appendChild(fullMode.label);
  modeSection.appendChild(publicMode.label);
  form.appendChild(modeSection);

  const encryptSection = document.createElement("fieldset");
  encryptSection.className = "export-dialog__fieldset";

  const encryptToggle = document.createElement("label");
  encryptToggle.className = "export-dialog__toggle";

  const encryptInput = document.createElement("input");
  encryptInput.type = "checkbox";
  encryptInput.className = "export-dialog__encrypt-checkbox";
  encryptToggle.appendChild(encryptInput);

  const encryptCopy = document.createElement("span");
  encryptCopy.className = "export-dialog__radio-copy";

  const encryptLabel = document.createElement("span");
  encryptLabel.className = "export-dialog__radio-label";
  encryptLabel.textContent = t("exportEncryptLabel");
  encryptCopy.appendChild(encryptLabel);

  const encryptHint = document.createElement("span");
  encryptHint.className = "export-dialog__radio-subtitle";
  encryptHint.textContent = t("exportEncryptHint");
  encryptCopy.appendChild(encryptHint);

  encryptToggle.appendChild(encryptCopy);
  encryptSection.appendChild(encryptToggle);

  const passwordFields = document.createElement("div");
  passwordFields.className = "export-dialog__passwords";
  passwordFields.hidden = true;

  const passwordField = createPasswordField(
    "export-dialog__password-input",
    t("exportPasswordLabel")
  );
  const passwordConfirmField = createPasswordField(
    "export-dialog__password-confirm-input",
    t("exportPasswordConfirmLabel")
  );
  passwordFields.appendChild(passwordField.row);
  passwordFields.appendChild(passwordConfirmField.row);
  encryptSection.appendChild(passwordFields);
  form.appendChild(encryptSection);

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

  if (typeof onPrint === "function") {
    const printButton = document.createElement("button");
    printButton.type = "button";
    printButton.className = "export-dialog__btn export-dialog__btn--secondary";
    printButton.textContent = t("printWeekButton");
    printButton.addEventListener("click", () => {
      onPrint();
      dialog.close();
    });
    actions.appendChild(printButton);
  }

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
  let defaultPath = "";

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

  function isEncryptedExport() {
    return encryptInput.checked;
  }

  function resetPasswordFields() {
    passwordField.input.value = "";
    passwordConfirmField.input.value = "";
  }

  function syncPasswordVisibility() {
    passwordFields.hidden = !isEncryptedExport();
    if (!isEncryptedExport()) {
      resetPasswordFields();
    }
  }

  async function open() {
    clearError();
    defaultPath = await getDialogDefaultPath();
    buildCalendarList();
    await refreshPreview();
    encryptInput.checked = false;
    syncPasswordVisibility();
    dialog.showModal();
  }

  cancelButton.addEventListener("click", () => {
    dialog.close();
  });

  encryptInput.addEventListener("change", () => {
    clearError();
    syncPasswordVisibility();
  });

  passwordField.input.addEventListener("input", () => {
    clearError();
  });

  passwordConfirmField.input.addEventListener("input", () => {
    clearError();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const calendarIds = selectedCalendarIds();
    if (calendarIds.length === 0) {
      showError(t("exportCalendarRequired"));
      return;
    }

    let password;
    if (isEncryptedExport()) {
      if (!passwordField.input.value.trim() || !passwordConfirmField.input.value.trim()) {
        showError(t("exportPasswordRequired"));
        return;
      }
      if (passwordField.input.value !== passwordConfirmField.input.value) {
        showError(t("exportPasswordMismatch"));
        return;
      }
      password = passwordField.input.value;
    }

    try {
      const payload = {
        mode: selectedMode(),
        calendarIds,
        defaultPath
      };
      if (password) {
        payload.password = password;
      }
      const result = await invoke("export_json", payload);
      resetPasswordFields();
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
