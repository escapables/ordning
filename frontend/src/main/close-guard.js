export async function installCloseGuard({ invoke, t, choose, onDiscard }) {
  const windowApi = window.__TAURI__?.window;
  if (!windowApi || typeof windowApi.getCurrentWindow !== "function") {
    return () => {};
  }

  const maybeWindow = windowApi.getCurrentWindow();
  const appWindow = typeof maybeWindow?.then === "function"
    ? await maybeWindow
    : maybeWindow;
  if (!appWindow || typeof appWindow.onCloseRequested !== "function") {
    return () => {};
  }

  const unlisten = await appWindow.onCloseRequested(async (event) => {
    event.preventDefault();

    const closeApp = async () => {
      await invoke("request_app_close");
    };

    let hasUnsavedChanges = false;
    try {
      hasUnsavedChanges = Boolean(await invoke("has_unsaved_changes"));
    } catch (error) {
      console.error("Failed to resolve unsaved state", error);
      await closeApp();
      return;
    }

    if (!hasUnsavedChanges) {
      await closeApp();
      return;
    }

    const askChoice = typeof choose === "function"
      ? choose
      : () => Promise.resolve(window.confirm(t("closeUnsavedPrompt")) ? true : false);
    const choice = await askChoice(t("closeUnsavedPrompt"), {
      confirmLabel: t("closeUnsavedSave"),
      confirmTone: "success",
      alternateLabel: t("closeUnsavedDontSave"),
      alternateTone: "danger",
      cancelLabel: t("eventFormCancel")
    });
    if (choice === true) {
      try {
        await invoke("persist_snapshot");
        await closeApp();
      } catch (error) {
        window.alert(String(error));
        console.error("Failed to persist before close", error);
      }
      return;
    }

    if (choice !== "alternate") {
      return;
    }

    try {
      await invoke("discard_unsaved_changes");
      if (typeof onDiscard === "function") {
        await onDiscard();
      }
      await closeApp();
    } catch (error) {
      window.alert(String(error));
      console.error("Failed to discard changes before close", error);
    }
  });

  return () => {
    if (typeof unlisten === "function") {
      unlisten();
    }
  };
}
