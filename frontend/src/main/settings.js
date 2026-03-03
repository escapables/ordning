import { setLang } from "../i18n/strings.js";

let currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
let currentEncryptionStatus = {
  encrypted: false,
  locked: false
};

export function getCurrentTimezone() {
  return currentTimezone;
}

function mergeEncryptionStatus(status = {}) {
  const nextStatus = { ...currentEncryptionStatus };

  if (typeof status.storageEncrypted === "boolean") {
    nextStatus.encrypted = status.storageEncrypted;
  } else if (typeof status.encrypted === "boolean") {
    nextStatus.encrypted = status.encrypted;
  }

  if (typeof status.storageLocked === "boolean") {
    nextStatus.locked = status.storageLocked;
  } else if (typeof status.locked === "boolean") {
    nextStatus.locked = status.locked;
  }

  currentEncryptionStatus = nextStatus;
  return getEncryptionStatus();
}

export function applyLoadedSettings(settings) {
  if (!settings) {
    return null;
  }

  setLang(settings.lang);
  currentTimezone = settings.timezone ?? currentTimezone;
  mergeEncryptionStatus(settings);
  return settings;
}

export function getEncryptionStatus() {
  return { ...currentEncryptionStatus };
}

export function setEncryptionStatus(status) {
  return mergeEncryptionStatus(status);
}

export async function initializeSettings({ invoke }) {
  try {
    const settings = await invoke("get_settings");
    return applyLoadedSettings(settings);
  } catch (error) {
    console.error("Failed to load settings", error);
    return null;
  }
}

export async function applySettings({ invoke, nextSettings, onApplied }) {
  try {
    const persisted = await invoke("set_settings", { settings: nextSettings });
    applyLoadedSettings({
      ...persisted,
      lang: persisted?.lang ?? nextSettings.lang,
      timezone: persisted?.timezone ?? nextSettings.timezone
    });
  } catch (error) {
    console.error("Failed to persist settings", error);
    return;
  }

  if (typeof onApplied === "function") {
    await onApplied();
  }
}
