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

  const alternateButton = document.createElement("button");
  alternateButton.type = "button";
  alternateButton.className = "confirm-dialog__btn";
  alternateButton.hidden = true;

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "confirm-dialog__btn confirm-dialog__btn--danger";
  confirmButton.textContent = t("eventFormDelete");
  confirmButton.autofocus = true;

  actions.append(cancelButton, alternateButton, confirmButton);
  form.append(message, actions);
  dialog.appendChild(form);

  let resolver = null;
  let closedByButton = false;

  const closeWith = (value) => {
    closedByButton = true;
    if (resolver) {
      resolver(value);
      resolver = null;
    }
    dialog.close();
  };

  cancelButton.addEventListener("click", () => {
    closeWith(false);
  });

  alternateButton.addEventListener("click", () => {
    closeWith("alternate");
  });

  confirmButton.addEventListener("click", () => {
    closeWith(true);
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeWith(false);
  });

  dialog.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      closeWith(false);
    }
  });

  dialog.addEventListener("close", () => {
    if (closedByButton) {
      closedByButton = false;
      return;
    }
    if (resolver) {
      resolver(false);
      resolver = null;
    }
  });

  const defaultCancelLabel = t("eventFormCancel");
  const defaultConfirmLabel = t("eventFormDelete");
  const defaultAlternateLabel = "";
  const defaultAlternateTone = "neutral";
  const confirmToneClasses = ["confirm-dialog__btn--danger", "confirm-dialog__btn--success"];
  const alternateToneClasses = ["confirm-dialog__btn--danger-soft"];
  const applyConfirmTone = (tone = "danger") => {
    confirmButton.classList.remove(...confirmToneClasses);
    confirmButton.classList.add(
      tone === "success" ? "confirm-dialog__btn--success" : "confirm-dialog__btn--danger"
    );
  };
  const applyAlternateTone = (tone = defaultAlternateTone) => {
    alternateButton.classList.remove(...alternateToneClasses);
    if (tone === "danger") {
      alternateButton.classList.add("confirm-dialog__btn--danger-soft");
    }
  };

  const confirm = (text, options = {}) =>
    new Promise((resolve) => {
      resolver = resolve;
      message.textContent = text;
      cancelButton.textContent = options.cancelLabel ?? defaultCancelLabel;
      confirmButton.textContent = options.confirmLabel ?? defaultConfirmLabel;
      applyConfirmTone(options.confirmTone);
      alternateButton.hidden = true;
      applyAlternateTone();
      dialog.showModal();
      confirmButton.focus();
    });

  const choose = (text, options = {}) =>
    new Promise((resolve) => {
      resolver = resolve;
      message.textContent = text;
      cancelButton.textContent = options.cancelLabel ?? defaultCancelLabel;
      confirmButton.textContent = options.confirmLabel ?? defaultConfirmLabel;
      applyConfirmTone(options.confirmTone);
      const alternateLabel = options.alternateLabel ?? defaultAlternateLabel;
      alternateButton.textContent = alternateLabel;
      applyAlternateTone(options.alternateTone);
      alternateButton.hidden = !alternateLabel;
      dialog.showModal();
      confirmButton.focus();
    });

  return {
    element: dialog,
    confirm,
    choose
  };
}
