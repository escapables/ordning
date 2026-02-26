import { t } from "../../i18n/strings.js";

export function createConfirmDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "confirm-dialog";

  const form = document.createElement("form");
  form.className = "confirm-dialog__form";
  form.method = "dialog";

  const message = document.createElement("p");
  message.className = "confirm-dialog__message";

  const actions = document.createElement("div");
  actions.className = "confirm-dialog__actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "confirm-dialog__btn";
  cancelButton.textContent = t("eventFormCancel");

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "confirm-dialog__btn confirm-dialog__btn--danger";
  confirmButton.textContent = t("eventFormDelete");

  actions.append(cancelButton, confirmButton);
  form.append(message, actions);
  dialog.appendChild(form);

  let resolver = null;

  const closeWith = (value) => {
    if (resolver) {
      resolver(value);
      resolver = null;
    }
    dialog.close();
  };

  cancelButton.addEventListener("click", () => {
    closeWith(false);
  });

  confirmButton.addEventListener("click", () => {
    closeWith(true);
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeWith(false);
  });

  dialog.addEventListener("close", () => {
    if (resolver) {
      resolver(false);
      resolver = null;
    }
  });

  const defaultCancelLabel = t("eventFormCancel");
  const defaultConfirmLabel = t("eventFormDelete");

  const confirm = (text, options = {}) =>
    new Promise((resolve) => {
      resolver = resolve;
      message.textContent = text;
      cancelButton.textContent = options.cancelLabel ?? defaultCancelLabel;
      confirmButton.textContent = options.confirmLabel ?? defaultConfirmLabel;
      dialog.showModal();
    });

  return {
    element: dialog,
    confirm
  };
}
