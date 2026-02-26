import { t } from "../../i18n/strings.js";

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
  strategySection.appendChild(mergeStrategy.label);
  strategySection.appendChild(replaceStrategy.label);
  form.appendChild(strategySection);

  const previewBox = document.createElement("div");
  previewBox.className = "import-dialog__preview";

  const previewPath = document.createElement("p");
  previewPath.className = "import-dialog__path";
  const previewHeader = document.createElement("div");
  previewHeader.className = "import-dialog__preview-header";
  previewPath.textContent = t("importNoFileSelected");
  previewHeader.appendChild(previewPath);

  const pickButton = document.createElement("button");
  pickButton.type = "button";
  pickButton.className = "import-dialog__btn import-dialog__btn--pick";
  pickButton.textContent = t("importPickFile");
  previewHeader.appendChild(pickButton);
  previewBox.appendChild(previewHeader);

  const previewSummary = document.createElement("ul");
  previewSummary.className = "import-dialog__summary";
  previewSummary.hidden = true;
  previewBox.appendChild(previewSummary);
  form.appendChild(previewBox);

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
    summary: null
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

  async function pickFileAndPreview() {
    clearError();
    submitButton.disabled = true;
    previewSummary.hidden = true;

    try {
      const preview = await invoke("preview_import_json", {
        strategy: selectedStrategy()
      });
      state.filePath = preview.path;
      state.summary = preview.summary;
      previewPath.textContent = preview.path;
      renderSummary(preview.summary);
      submitButton.disabled = false;
    } catch (previewError) {
      showError(String(previewError));
      state.filePath = "";
      state.summary = null;
      previewPath.textContent = t("importNoFileSelected");
    }
  }

  pickButton.addEventListener("click", () => {
    void pickFileAndPreview();
  });

  mergeStrategy.input.addEventListener("change", () => {
    state.filePath = "";
    state.summary = null;
    previewPath.textContent = t("importNoFileSelected");
    previewSummary.hidden = true;
    submitButton.disabled = true;
  });

  replaceStrategy.input.addEventListener("change", () => {
    state.filePath = "";
    state.summary = null;
    previewPath.textContent = t("importNoFileSelected");
    previewSummary.hidden = true;
    submitButton.disabled = true;
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
        strategy: selectedStrategy()
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
    state.filePath = "";
    state.summary = null;
    previewPath.textContent = t("importNoFileSelected");
    previewSummary.hidden = true;
    submitButton.disabled = true;
    dialog.showModal();
  }

  return {
    element: dialog,
    open
  };
}
