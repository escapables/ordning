export function createManualSaveController({ invoke, onChange = () => {} }) {
  let hasUnsavedChanges = false;
  let isSaving = false;
  let status = "idle";
  let resetTimerId = null;
  let syncInFlight = false;
  let syncQueued = false;

  const notify = () => {
    onChange();
  };

  const setHasUnsavedChanges = (nextValue) => {
    if (hasUnsavedChanges === nextValue) {
      return;
    }
    hasUnsavedChanges = nextValue;
    notify();
  };

  const setStatus = (nextStatus) => {
    if (status === nextStatus) {
      return;
    }
    status = nextStatus;
    notify();
  };

  const sync = async () => {
    if (syncInFlight) {
      syncQueued = true;
      return;
    }

    syncInFlight = true;
    do {
      syncQueued = false;
      try {
        const value = await invoke("has_unsaved_changes");
        if (typeof value === "boolean") {
          setHasUnsavedChanges(value);
        }
      } catch (error) {
        console.error("Failed to resolve unsaved state", error);
      }
    } while (syncQueued);
    syncInFlight = false;
  };

  const onSave = async () => {
    if (isSaving || !hasUnsavedChanges) {
      return;
    }

    isSaving = true;
    notify();
    try {
      await invoke("persist_snapshot");
      setHasUnsavedChanges(false);
      setStatus("saved");
      if (resetTimerId !== null) {
        window.clearTimeout(resetTimerId);
      }
      resetTimerId = window.setTimeout(() => {
        resetTimerId = null;
        setStatus("idle");
      }, 1200);
    } catch (error) {
      window.alert(String(error));
      console.error("Failed to persist snapshot", error);
    } finally {
      isSaving = false;
      notify();
      await sync();
    }
  };

  const dispose = () => {
    if (resetTimerId !== null) {
      window.clearTimeout(resetTimerId);
      resetTimerId = null;
    }
  };

  const getToolbarProps = () => ({
    onSave,
    saveEnabled: hasUnsavedChanges && !isSaving,
    saveStatus: isSaving ? "saving" : status
  });

  return {
    dispose,
    getToolbarProps,
    sync
  };
}
