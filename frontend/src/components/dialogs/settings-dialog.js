import { getLang, t } from "../../i18n/strings.js";

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

  const select = document.createElement("select");
  select.className = "settings-dialog__select";

  const swedishOption = document.createElement("option");
  swedishOption.value = "sv";
  swedishOption.textContent = t("settingsLanguageSwedish");

  const englishOption = document.createElement("option");
  englishOption.value = "en";
  englishOption.textContent = t("settingsLanguageEnglish");

  select.append(swedishOption, englishOption);
  field.append(label, select);

  const timezoneField = document.createElement("label");
  timezoneField.className = "settings-dialog__field";

  const timezoneLabel = document.createElement("span");
  timezoneLabel.className = "settings-dialog__label";
  timezoneLabel.textContent = t("settingsTimezoneLabel");

  const timezoneSelect = document.createElement("select");
  timezoneSelect.className = "settings-dialog__select";

  timezoneField.append(timezoneLabel, timezoneSelect);

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

  select.addEventListener("change", persistSettings);
  timezoneSelect.addEventListener("change", persistSettings);

  const open = () => {
    const currentTimezone = getTimezone();
    timezoneSelect.innerHTML = "";
    const timezoneOptions = getTimezones(currentTimezone);
    if (!timezoneOptions.includes(currentTimezone)) {
      timezoneOptions.unshift(currentTimezone);
    }
    timezoneOptions.forEach((timezone) => {
      const option = document.createElement("option");
      option.value = timezone;
      option.textContent = timezone;
      timezoneSelect.appendChild(option);
    });
    select.value = getLang();
    timezoneSelect.value = currentTimezone;
    dialog.showModal();
    select.focus();
  };

  return {
    element: dialog,
    open,
  };
}
