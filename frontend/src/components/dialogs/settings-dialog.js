import { getLang, t } from "../../i18n/strings.js";

export function createSettingsDialog({ onChangeLang = async () => {} }) {
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
  form.append(title, field, actions);
  dialog.appendChild(form);

  select.addEventListener("change", async () => {
    const nextLang = select.value;
    if (nextLang === getLang()) {
      return;
    }

    await onChangeLang(nextLang);
    dialog.close();
  });

  const open = () => {
    select.value = getLang();
    dialog.showModal();
    select.focus();
  };

  return {
    element: dialog,
    open,
  };
}
