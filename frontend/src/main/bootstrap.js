import { createUnlockScreen } from "../components/unlock-screen.js";

import { applyLoadedSettings } from "./settings.js";

export async function bootstrapApp({
  initializeSettings,
  renderAppShell
}) {
  const settings = await initializeSettings();
  if (settings?.storageLocked) {
    const app = document.querySelector("#app");
    if (!app) {
      return;
    }

    const unlockScreen = createUnlockScreen({
      onUnlocked: async (unlockedSettings) => {
        applyLoadedSettings(unlockedSettings);
        await renderAppShell();
      }
    });
    app.replaceChildren(unlockScreen.element);
    return;
  }

  await renderAppShell();
}
