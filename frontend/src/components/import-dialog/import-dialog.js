import { t } from "../../i18n/strings.js";
import { getDialogDefaultPath } from "../../utils/dialog-default-path.js";

function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }
  return invokeFn(command, payload);
}

function createRadio(name, value, checked, labelText) {
  const label = document.createElement("label");
  label.className = "import-dialog__radio";

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

function createPasswordField(labelText) {
  const row = document.createElement("label");
  row.className = "import-dialog__field";

  const label = document.createElement("span");
  label.className = "import-dialog__field-label";
  label.textContent = labelText;
  row.appendChild(label);

  const input = document.createElement("input");
  input.type = "password";
  input.className = "import-dialog__password-input";
  input.autocomplete = "current-password";
  row.appendChild(input);

  return { row, input };
}

export function createImportDialog({ onImported = async () => {} } = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = "import-dialog";

  const form = document.createElement("form");
  form.className = "import-dialog__form";
  form.method = "dialog";

  const heading = document.createElement("h2");
  heading.className = "import-dialog__title";
  heading.textContent = t("importDialogTitle");
  form.appendChild(heading);

  const error = document.createElement("p");
  error.className = "import-dialog__error";
  error.hidden = true;
  form.appendChild(error);

  const strategySection = document.createElement("fieldset");
  strategySection.className = "import-dialog__fieldset";
  const strategyLegend = document.createElement("legend");
  strategyLegend.className = "import-dialog__legend";
  strategyLegend.textContent = t("importStrategyLabel");
  strategySection.appendChild(strategyLegend);

  const mergeStrategy = createRadio(
    "import-strategy",
    "merge",
    true,
    t("importStrategyMerge")
  );
  const replaceStrategy = createRadio(
    "import-strategy",
    "replace",
    false,
    t("importStrategyReplace")
  );
  strategySection.append(mergeStrategy.label, replaceStrategy.label);
  form.appendChild(strategySection);

  const previewBox = document.createElement("div");
  previewBox.className = "import-dialog__preview";

  const previewHeader = document.createElement("div");
  previewHeader.className = "import-dialog__preview-header";

  const previewCopy = document.createElement("div");
  previewCopy.className = "import-dialog__preview-copy";

  const previewPath = document.createElement("p");
  previewPath.className = "import-dialog__path";
  previewPath.textContent = t("importNoFileSelected");

  const previewStatus = document.createElement("p");
  previewStatus.className = "import-dialog__status";
  previewStatus.hidden = true;

  previewCopy.append(previewPath, previewStatus);

  const pickButton = document.createElement("button");
  pickButton.type = "button";
  pickButton.className = "import-dialog__btn import-dialog__btn--pick";
  pickButton.textContent = t("importPickFile");

  previewHeader.append(previewCopy, pickButton);
  previewBox.appendChild(previewHeader);

  const previewSummary = document.createElement("ul");
  previewSummary.className = "import-dialog__summary";
  previewSummary.hidden = true;
  previewBox.appendChild(previewSummary);
  form.appendChild(previewBox);

  const passwordField = createPasswordField(t("importPasswordLabel"));
  passwordField.row.hidden = true;
  form.appendChild(passwordField.row);

  const unlockButton = document.createElement("button");
  unlockButton.type = "button";
  unlockButton.className = "import-dialog__btn import-dialog__btn--unlock";
  unlockButton.textContent = t("importUnlockButton");
  unlockButton.hidden = true;
  form.appendChild(unlockButton);

  const actions = document.createElement("div");
  actions.className = "import-dialog__actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "import-dialog__btn import-dialog__btn--cancel";
  cancelButton.textContent = t("importCancel");
  actions.appendChild(cancelButton);

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "import-dialog__btn import-dialog__btn--primary";
  submitButton.textContent = t("importConfirm");
  submitButton.disabled = true;
  actions.appendChild(submitButton);

  form.appendChild(actions);
  dialog.appendChild(form);

  const state = {
    filePath: "",
    summary: null,
    fileIsEncrypted: false,
    fileUnlocked: false
  };

  function selectedStrategy() {
    return replaceStrategy.input.checked ? "replace" : "merge";
  }

  function clearError() {
    error.hidden = true;
    error.textContent = "";
  }

  function showError(message) {
    error.hidden = false;
    error.textContent = message;
  }

  function renderSummary(summary) {
    previewSummary.innerHTML = "";
    const lines = [
      t("importSummaryCalendars").replace("{count}", String(summary.calendarCount)),
      t("importSummaryEvents").replace("{count}", String(summary.eventCount)),
      t("importSummaryNew").replace("{count}", String(summary.newEvents)),
      t("importSummaryUpdated").replace("{count}", String(summary.updatedEvents)),
      t("importSummaryConflicts").replace("{count}", String(summary.conflictEvents))
    ];

    lines.forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      previewSummary.appendChild(item);
    });
    previewSummary.hidden = false;
  }

  function renderStatus() {
    if (!state.filePath || !state.fileIsEncrypted) {
      previewStatus.hidden = true;
      previewStatus.textContent = "";
      previewStatus.classList.remove(
        "import-dialog__status--locked",
        "import-dialog__status--unlocked"
      );
      return;
    }

    previewStatus.hidden = false;
    if (state.fileUnlocked) {
      previewStatus.textContent = `🔓 ${t("importUnlocked")}`;
      previewStatus.classList.remove("import-dialog__status--locked");
      previewStatus.classList.add("import-dialog__status--unlocked");
      return;
    }

    previewStatus.textContent = `🔒 ${t("importEncryptedFile")}`;
    previewStatus.classList.remove("import-dialog__status--unlocked");
    previewStatus.classList.add("import-dialog__status--locked");
  }

  function resetPreviewState() {
    state.filePath = "";
    state.summary = null;
    state.fileIsEncrypted = false;
    state.fileUnlocked = false;
    previewPath.textContent = t("importNoFileSelected");
    previewSummary.hidden = true;
    previewSummary.innerHTML = "";
    passwordField.row.hidden = true;
    passwordField.input.value = "";
    unlockButton.hidden = true;
    submitButton.disabled = true;
    renderStatus();
  }

  function applyPreview(preview) {
    state.filePath = preview.path;
    state.summary = preview.summary ?? null;
    state.fileIsEncrypted = Boolean(preview.encrypted);
    state.fileUnlocked = state.fileIsEncrypted && Boolean(preview.summary);
    previewPath.textContent = preview.path;

    if (preview.summary) {
      renderSummary(preview.summary);
    } else {
      previewSummary.hidden = true;
      previewSummary.innerHTML = "";
    }

    passwordField.row.hidden = !state.fileIsEncrypted || state.fileUnlocked;
    unlockButton.hidden = !state.fileIsEncrypted || state.fileUnlocked;
    submitButton.disabled = !preview.summary;
    renderStatus();

    if (state.fileIsEncrypted && !state.fileUnlocked) {
      passwordField.input.focus();
    }
  }

  async function pickFileAndPreview() {
    clearError();
    resetPreviewState();

    try {
      const defaultPath = await getDialogDefaultPath();
      const preview = await invoke("preview_import_json", {
        strategy: selectedStrategy(),
        defaultPath
      });
      applyPreview(preview);
    } catch (previewError) {
      showError(String(previewError));
    }
  }

  async function unlockPreview() {
    clearError();

    if (!state.filePath) {
      showError(t("importNoFileSelected"));
      return;
    }

    try {
      const preview = await invoke("preview_import_json", {
        path: state.filePath,
        strategy: selectedStrategy(),
        password: passwordField.input.value || undefined
      });
      applyPreview(preview);
    } catch (previewError) {
      showError(String(previewError));
    }
  }

  pickButton.addEventListener("click", () => {
    void pickFileAndPreview();
  });

  unlockButton.addEventListener("click", () => {
    void unlockPreview();
  });

  passwordField.input.addEventListener("input", () => {
    clearError();
  });

  [mergeStrategy.input, replaceStrategy.input].forEach((input) => {
    input.addEventListener("change", () => {
      clearError();
      resetPreviewState();
    });
  });

  cancelButton.addEventListener("click", () => {
    dialog.close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    if (!state.filePath) {
      showError(t("importNoFileSelected"));
      return;
    }

    try {
      const result = await invoke("import_json", {
        path: state.filePath,
        strategy: selectedStrategy(),
        password: state.fileIsEncrypted
          ? passwordField.input.value || undefined
          : undefined
      });
      dialog.close();
      await onImported();
      window.alert(
        t("importSuccessMessage")
          .replace("{new}", String(result.summary.newEvents))
          .replace("{updated}", String(result.summary.updatedEvents))
          .replace("{conflicts}", String(result.summary.conflictEvents))
      );
    } catch (importError) {
      showError(String(importError));
    }
  });

  async function open() {
    clearError();
    resetPreviewState();
    dialog.showModal();
  }

  return {
    element: dialog,
    open
  };
}
