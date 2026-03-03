import { createSettingsDialog } from "../components/dialogs/settings-dialog.js";

import {
  applySettings,
  getCurrentTimezone,
  getEncryptionStatus,
  setEncryptionStatus
} from "./settings.js";

export function mountSettingsDialog({ app, settingsButton, invoke, renderAppShell }) {
  const settingsDialog = createSettingsDialog({
    getTimezone: getCurrentTimezone,
    getEncryptionStatus,
    onChangeSettings: async (nextSettings) => {
      await applySettings({ invoke, nextSettings, onApplied: renderAppShell });
    },
    onEnableEncryption: async (password) => {
      const status = await invoke("enable_encryption", { password });
      setEncryptionStatus(status);
      return status;
    },
    onDisableEncryption: async (password) => {
      const status = await invoke("disable_encryption", { password });
      setEncryptionStatus(status);
      return status;
    }
  });

  app.appendChild(settingsDialog.element);
  settingsButton.addEventListener("click", () => {
    settingsDialog.open();
  });

  return settingsDialog;
}
