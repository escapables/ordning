import { getLang, t } from "../../i18n/strings.js";
import { createSelectPicker } from "../pickers/select-picker.js";

function getTimezones(fallbackTimezone) {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return [fallbackTimezone];
}

export function createSettingsDialog({
  getTimezone = () => "UTC",
  onChangeSettings = async () => {}
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
  form.append(title, field, timezoneField, actions);
  dialog.appendChild(form);

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
    dialog.showModal();
    langPicker.trigger.focus();
  };

  return {
    element: dialog,
    open,
  };
}
