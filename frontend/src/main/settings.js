import { setLang } from "../i18n/strings.js";

let currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

export function getCurrentTimezone() {
  return currentTimezone;
}

export async function initializeSettings({ invoke }) {
  try {
    const settings = await invoke("get_settings");
    setLang(settings?.lang);
    currentTimezone = settings?.timezone ?? currentTimezone;
  } catch (error) {
    console.error("Failed to load settings", error);
  }
}

export async function applySettings({ invoke, nextSettings, onApplied }) {
  try {
    const persisted = await invoke("set_settings", { settings: nextSettings });
    setLang(persisted?.lang ?? nextSettings.lang);
    currentTimezone = persisted?.timezone ?? nextSettings.timezone ?? currentTimezone;
  } catch (error) {
    console.error("Failed to persist settings", error);
    return;
  }

  if (typeof onApplied === "function") {
    await onApplied();
  }
}
