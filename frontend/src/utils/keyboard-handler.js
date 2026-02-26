export function setupKeyboardHandler(options = {}) {
  const {
    closeOpenDialogs = () => {},
    clearEventSelection = () => {},
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

  return async (keyboardEvent) => {
    if (keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
      return;
    }

    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      closeOpenDialogs();
      clearEventSelection();
      return;
    }

    const targetTagName = keyboardEvent.target?.tagName?.toUpperCase();
    if (targetTagName === "INPUT" || targetTagName === "TEXTAREA" || targetTagName === "SELECT") {
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

    if (keyboardEvent.key.toLowerCase() === "t") {
      keyboardEvent.preventDefault();
      void goToToday();
      return;
    }

    if (keyboardEvent.key.toLowerCase() === "n") {
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
