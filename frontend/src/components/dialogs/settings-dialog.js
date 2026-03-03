import { getLang, t } from "../../i18n/strings.js";
import { createSelectPicker } from "../pickers/select-picker.js";

function getTimezones(fallbackTimezone) {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return [fallbackTimezone];
}

function createPasswordField(className, labelText) {
  const field = document.createElement("label");
  field.className = "settings-dialog__field";

  const label = document.createElement("span");
  label.className = "settings-dialog__label";
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "password";
  input.className = className;
  input.autocomplete = "new-password";

  field.append(label, input);
  return { field, input };
}

export function createSettingsDialog({
  getTimezone = () => "UTC",
  getEncryptionStatus = () => ({ encrypted: false, locked: false }),
  onChangeSettings = async () => {},
  onEnableEncryption = async () => {},
  onDisableEncryption = async () => {}
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "settings-dialog";

  const form = document.createElement("form");
  form.className = "settings-dialog__form";
  form.method = "dialog";

  const title = document.createElement("h3");
  title.className = "settings-dialog__title";
  title.textContent = t("settingsTitle");

  const field = document.createElement("label");
  field.className = "settings-dialog__field";

  const label = document.createElement("span");
  label.className = "settings-dialog__label";
  label.textContent = t("settingsLanguageLabel");

  const langPicker = createSelectPicker({
    name: "settingsLanguage",
    items: [
      ["sv", t("settingsLanguageSwedish")],
      ["en", t("settingsLanguageEnglish")]
    ],
    className: "settings-dialog__select-picker",
    onChange: () => persistSettings()
  });
  const select = langPicker.select;
  field.append(label, langPicker.container);

  const timezoneField = document.createElement("label");
  timezoneField.className = "settings-dialog__field";

  const timezoneLabel = document.createElement("span");
  timezoneLabel.className = "settings-dialog__label";
  timezoneLabel.textContent = t("settingsTimezoneLabel");

  const timezonePicker = createSelectPicker({
    name: "settingsTimezone",
    className: "settings-dialog__select-picker",
    searchable: true,
    onChange: () => persistSettings()
  });
  const timezoneSelect = timezonePicker.select;
  timezoneField.append(timezoneLabel, timezonePicker.container);

  const encryptionSection = document.createElement("fieldset");
  encryptionSection.className = "settings-dialog__fieldset";

  const encryptionLegend = document.createElement("legend");
  encryptionLegend.className = "settings-dialog__legend";

  const encryptionLegendTitle = document.createElement("span");
  encryptionLegendTitle.className = "settings-dialog__legend-title";

  const encryptionStatus = document.createElement("span");
  encryptionStatus.className = "settings-dialog__status";
  encryptionStatus.hidden = true;

  encryptionLegend.append(encryptionLegendTitle, encryptionStatus);

  const encryptionDescription = document.createElement("p");
  encryptionDescription.className = "settings-dialog__description";

  const enableButton = document.createElement("button");
  enableButton.type = "button";
  enableButton.className = "settings-dialog__btn settings-dialog__btn--ghost";
  enableButton.textContent = t("settingsEncryptButton");

  const disableButton = document.createElement("button");
  disableButton.type = "button";
  disableButton.className = "settings-dialog__btn";
  disableButton.textContent = t("settingsDisableEncrypt");
  disableButton.hidden = true;

  const encryptFields = document.createElement("div");
  encryptFields.className = "settings-dialog__passwords";
  encryptFields.hidden = true;

  const passwordField = createPasswordField(
    "settings-dialog__password-input",
    t("unlockPasswordLabel")
  );
  const confirmField = createPasswordField(
    "settings-dialog__password-confirm-input",
    t("settingsEncryptConfirmLabel")
  );

  const encryptError = document.createElement("p");
  encryptError.className = "settings-dialog__error";
  encryptError.hidden = true;

  const encryptActions = document.createElement("div");
  encryptActions.className = "settings-dialog__encrypt-actions";

  const cancelEncryptButton = document.createElement("button");
  cancelEncryptButton.type = "button";
  cancelEncryptButton.className = "settings-dialog__btn";
  cancelEncryptButton.textContent = t("settingsEncryptCancel");

  const confirmEncryptButton = document.createElement("button");
  confirmEncryptButton.type = "button";
  confirmEncryptButton.className = "settings-dialog__btn settings-dialog__btn--primary";
  confirmEncryptButton.textContent = t("settingsEncryptSubmit");

  encryptActions.append(cancelEncryptButton, confirmEncryptButton);
  encryptFields.append(
    passwordField.field,
    confirmField.field,
    encryptError,
    encryptActions
  );

  encryptionSection.append(
    encryptionLegend,
    encryptionDescription,
    enableButton,
    disableButton,
    encryptFields
  );

  const actions = document.createElement("div");
  actions.className = "settings-dialog__actions";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "settings-dialog__btn";
  closeButton.textContent = t("eventFormCancel");
  closeButton.addEventListener("click", () => {
    dialog.close();
  });

  actions.append(closeButton);
  form.append(title, field, timezoneField, encryptionSection, actions);
  dialog.appendChild(form);

  const clearEncryptError = () => {
    encryptError.hidden = true;
    encryptError.textContent = "";
  };

  const showEncryptError = (message) => {
    encryptError.hidden = false;
    encryptError.textContent = message;
  };

  const resetEncryptInputs = () => {
    passwordField.input.value = "";
    confirmField.input.value = "";
    clearEncryptError();
  };

  const setEncryptMode = (mode) => {
    const { encrypted } = getEncryptionStatus();
    const expanded = mode !== null;
    const isEnableMode = mode === "enable";

    encryptFields.hidden = !expanded;
    enableButton.hidden = encrypted || expanded;
    disableButton.hidden = !encrypted || expanded;
    disableButton.disabled = !encrypted;
    confirmField.field.hidden = !isEnableMode;
    passwordField.input.autocomplete = mode === "disable" ? "current-password" : "new-password";
    encryptionLegendTitle.textContent = expanded
      ? isEnableMode
        ? t("settingsEncryptButton")
        : t("settingsDisableEncrypt")
      : t("settingsEncryptionTitle");
    confirmEncryptButton.textContent =
      mode === "disable" ? t("settingsDisableEncrypt") : t("settingsEncryptSubmit");

    if (!expanded) {
      resetEncryptInputs();
      return;
    }

    if (!isEnableMode) {
      confirmField.input.value = "";
    }

    passwordField.input.focus();
  };

  const renderEncryptionState = () => {
    const { encrypted } = getEncryptionStatus();
    encryptionStatus.hidden = !encrypted;
    encryptionStatus.textContent = `● ${t("settingsEncryptedStatus")}`;
    encryptionDescription.textContent = encrypted
      ? t("settingsEncryptionOn")
      : t("settingsEncryptionOff");
    setEncryptMode(null);
  };

  const persistSettings = async () => {
    const nextLang = select.value;
    const nextTimezone = timezoneSelect.value;
    if (nextLang === getLang() && nextTimezone === getTimezone()) {
      return;
    }

    await onChangeSettings({
      lang: nextLang,
      timezone: nextTimezone
    });
    dialog.close();
  };

  enableButton.addEventListener("click", () => {
    setEncryptMode("enable");
  });

  disableButton.addEventListener("click", () => {
    setEncryptMode("disable");
  });

  [passwordField.input, confirmField.input].forEach((input) => {
    input.addEventListener("input", () => {
      clearEncryptError();
    });
  });

  cancelEncryptButton.addEventListener("click", () => {
    setEncryptMode(null);
  });

  confirmEncryptButton.addEventListener("click", async () => {
    clearEncryptError();
    const password = passwordField.input.value;
    if (confirmField.field.hidden) {
      if (!password.trim()) {
        showEncryptError(t("settingsEncryptPasswordRequired"));
        return;
      }

      try {
        await onDisableEncryption(password);
        dialog.close();
      } catch (error) {
        showEncryptError(String(error));
      }
      return;
    }

    const confirmation = confirmField.input.value;
    if (!password.trim() || !confirmation.trim()) {
      showEncryptError(t("settingsEncryptPasswordRequired"));
      return;
    }

    if (password !== confirmation) {
      showEncryptError(t("settingsEncryptPasswordMismatch"));
      return;
    }

    try {
      await onEnableEncryption(password);
      dialog.close();
    } catch (error) {
      showEncryptError(String(error));
    }
  });

  const open = () => {
    const currentTimezone = getTimezone();
    const timezoneOptions = getTimezones(currentTimezone);
    if (!timezoneOptions.includes(currentTimezone)) {
      timezoneOptions.unshift(currentTimezone);
    }

    timezonePicker.setItems(timezoneOptions.map((tz) => [tz, tz]));
    select.value = getLang();
    langPicker.syncDisplay();
    timezoneSelect.value = currentTimezone;
    timezonePicker.syncDisplay();
    renderEncryptionState();
    dialog.showModal();
    langPicker.trigger.focus();
  };

  return {
    element: dialog,
    open
  };
}
