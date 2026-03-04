import {
  createDeleteEventByIdAction,
  createDeleteMultipleEventsAction
} from "./event-mutations-delete-actions.js";
import {
  appendExceptionDate,
  buildEventInput,
  toRecurrenceInput
} from "./event-mutations-recurrence.js";
import { createUpdateTimedEventPositionAction } from "./event-mutations-reschedule-actions.js";
import { createStoredEvent } from "./event-mutations-store.js";

export {
  appendExceptionDate,
  buildEventInput,
  createStoredEvent,
  toRecurrenceInput
};

export async function chooseRecurringScope(confirmDialog, t, confirmTone) {
  return confirmDialog.choose(t("recurrenceEditPrompt"), {
    confirmLabel: t("recurrenceEditAllFuture"),
    confirmTone,
    alternateLabel: t("recurrenceEditJustThisOne")
  });
}

export function createEventMutationHandlers({
  invoke,
  confirmDialog,
  t,
  weekContainer,
  refreshAndRender,
  refreshCurrentWeekEvents,
  setPendingHighlightEvent,
  setPendingWeekViewRenderOptions
}) {
  const resolveRecurringScope = (confirmTone) => chooseRecurringScope(confirmDialog, t, confirmTone);

  const deleteEventById = createDeleteEventByIdAction({
    invoke,
    confirmDialog,
    t,
    refreshAndRender,
    setPendingHighlightEvent,
    chooseRecurringScope: resolveRecurringScope
  });

  const deleteMultipleEvents = createDeleteMultipleEventsAction({
    invoke,
    confirmDialog,
    t,
    refreshAndRender,
    deleteEventById
  });

  const updateTimedEventPosition = createUpdateTimedEventPositionAction({
    invoke,
    weekContainer,
    refreshCurrentWeekEvents,
    setPendingHighlightEvent,
    setPendingWeekViewRenderOptions,
    chooseRecurringScope: resolveRecurringScope
  });

  return {
    deleteEventById,
    deleteMultipleEvents,
    updateTimedEventPosition
  };
}
