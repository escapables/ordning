export function setupKeyboardHandler(options = {}) {
  const {
    closeOpenDialogs = () => {},
    clearEventSelection = () => {},
    cancelPasteMode = () => {},
    copySelectedEvent = async () => false,
    pasteCopiedEvent = async () => false,
    goToPreviousWeek = async () => {},
    goToNextWeek = async () => {},
    goToToday = async () => {},
    openCreateEvent = () => {},
    hasOpenDialog = () => false,
    getDeleteEventId = () => null,
    deleteEventById = async () => {},
    onDeleteError = () => {}
  } = options;

  let isDeletingFromKeyboard = false;

  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tagName = target.tagName.toUpperCase();
    return tagName === "INPUT"
      || tagName === "TEXTAREA"
      || tagName === "SELECT"
      || target.isContentEditable;
  }

  return async (keyboardEvent) => {
    const editableTarget = isEditableTarget(keyboardEvent.target);
    const hasCommandModifier = keyboardEvent.ctrlKey || keyboardEvent.metaKey;
    const lowerKey = keyboardEvent.key.toLowerCase();

    if (!keyboardEvent.altKey && !keyboardEvent.shiftKey && hasCommandModifier && !editableTarget) {
      if (lowerKey === "c") {
        if (await copySelectedEvent()) {
          keyboardEvent.preventDefault();
        }
        return;
      }

      if (lowerKey === "v") {
        if (await pasteCopiedEvent()) {
          keyboardEvent.preventDefault();
        }
        return;
      }
    }

    if (keyboardEvent.altKey || hasCommandModifier) {
      return;
    }

    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      cancelPasteMode();
      closeOpenDialogs();
      clearEventSelection();
      return;
    }

    if (editableTarget) {
      return;
    }

    if (keyboardEvent.key === "ArrowLeft") {
      keyboardEvent.preventDefault();
      void goToPreviousWeek();
      return;
    }

    if (keyboardEvent.key === "ArrowRight") {
      keyboardEvent.preventDefault();
      void goToNextWeek();
      return;
    }

    if (lowerKey === "t") {
      keyboardEvent.preventDefault();
      void goToToday();
      return;
    }

    if (lowerKey === "n") {
      keyboardEvent.preventDefault();
      openCreateEvent();
      return;
    }

    if (keyboardEvent.key !== "Delete" && keyboardEvent.key !== "Backspace") {
      return;
    }

    if (keyboardEvent.repeat || isDeletingFromKeyboard) {
      return;
    }

    if (hasOpenDialog()) {
      return;
    }

    const eventId = getDeleteEventId();
    if (!eventId) {
      return;
    }

    keyboardEvent.preventDefault();
    isDeletingFromKeyboard = true;
    try {
      await deleteEventById(eventId);
    } catch (error) {
      onDeleteError(error);
    } finally {
      isDeletingFromKeyboard = false;
    }
  };
}
