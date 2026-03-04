import { setupKeyboardHandler } from "../utils/keyboard-handler.js";

export function installKeyboardShortcuts(options = {}) {
  const {
    weekViewController,
    eventModal,
    deleteMultipleEvents = async () => false,
    deleteEventById = async () => {},
    onDeleteError = () => {}
  } = options;

  const keydownHandler = setupKeyboardHandler({
    closeOpenDialogs: () => {
      document.querySelectorAll("dialog[open]").forEach((dialogElement) => {
        dialogElement.close();
      });
    },
    clearEventSelection: () => {
      weekViewController.clearSelection({ blurFocusedEvent: true });
    },
    cancelPasteMode: () => {
      weekViewController.cancelPasteMode();
    },
    copySelectedEvent: () => weekViewController.copySelectedEvent(),
    pasteCopiedEvent: () => weekViewController.pasteAtCurrentPointer(),
    goToPreviousWeek: () => weekViewController.goToPreviousWeek(),
    goToNextWeek: () => weekViewController.goToNextWeek(),
    goToToday: () => weekViewController.goToToday(),
    openCreateEvent: () => {
      eventModal.openCreate();
    },
    hasOpenDialog: () => Boolean(document.querySelector("dialog[open]")),
    getSelectedEventTargets: () => weekViewController.getSelectedEventTargets(),
    deleteMultipleEvents,
    getDeleteEventId: () => weekViewController.getDeleteEventTarget(),
    deleteEventById,
    onDeleteError
  });

  document.addEventListener("keydown", keydownHandler);
  return keydownHandler;
}
