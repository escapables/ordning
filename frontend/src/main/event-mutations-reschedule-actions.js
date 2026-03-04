import {
  adjustRecurringRuleForDate,
  appendExceptionDate,
  buildEventInput,
  toRecurrenceInput,
  truncateRecurringSeries
} from "./event-mutations-recurrence.js";
import {
  applyTimedUpdates,
  createStoredEvent,
  getStoredEvent,
  updateStoredEvent
} from "./event-mutations-store.js";

function captureScrollTop(weekContainer) {
  const weekBody = weekContainer.querySelector(".week-grid__body");
  return weekBody instanceof HTMLElement ? weekBody.scrollTop : null;
}

function preserveWeekScroll(setPendingWeekViewRenderOptions, weekContainer) {
  setPendingWeekViewRenderOptions({
    preserveScrollTop: captureScrollTop(weekContainer),
    skipAutoScroll: true,
    remainingRenders: 2
  });
}

export function createUpdateTimedEventPositionAction({
  invoke,
  weekContainer,
  refreshCurrentWeekEvents,
  setPendingHighlightEvent,
  setPendingWeekViewRenderOptions,
  chooseRecurringScope
}) {
  return async function updateTimedEventPosition(
    {
      eventId,
      date,
      startDate,
      endDate,
      startTime,
      endTime,
      linkedNeighbor = null,
      instanceDate = null,
      isVirtual = false
    },
    actionName
  ) {
    const primaryUpdate = { eventId, date, startDate, endDate, startTime, endTime };
    const linkedUpdates = linkedNeighbor?.eventId ? [linkedNeighbor] : [];

    try {
      if (!isVirtual || !instanceDate) {
        preserveWeekScroll(setPendingWeekViewRenderOptions, weekContainer);
        await applyTimedUpdates(invoke, [primaryUpdate, ...linkedUpdates]);
        setPendingHighlightEvent({ eventId, skipScroll: true });
        await refreshCurrentWeekEvents();
        return;
      }

      const choice = await chooseRecurringScope("success");
      if (!choice) {
        return;
      }

      preserveWeekScroll(setPendingWeekViewRenderOptions, weekContainer);
      const existing = await getStoredEvent(invoke, eventId);
      const resolvedStartDate = startDate ?? date ?? instanceDate;
      const resolvedEndDate = endDate ?? date ?? resolvedStartDate;
      const recurrence = toRecurrenceInput(existing.recurrence);

      if (!recurrence) {
        await applyTimedUpdates(invoke, [primaryUpdate, ...linkedUpdates]);
        setPendingHighlightEvent({ eventId, skipScroll: true });
        await refreshCurrentWeekEvents();
        return;
      }

      if (choice === "alternate") {
        await updateStoredEvent(
          invoke,
          eventId,
          buildEventInput(existing, {
            recurrence: appendExceptionDate(recurrence, instanceDate)
          })
        );
        const created = await createStoredEvent(
          invoke,
          buildEventInput(existing, {
            startDate: resolvedStartDate,
            endDate: resolvedEndDate,
            startTime,
            endTime,
            allDay: false,
            recurrence: null,
            recurrenceParentId: eventId
          })
        );
        if (linkedUpdates.length > 0) {
          await applyTimedUpdates(invoke, linkedUpdates);
        }
        if (created?.id) {
          setPendingHighlightEvent({ eventId: created.id, skipScroll: true });
        } else {
          setPendingHighlightEvent(null);
        }
        await refreshCurrentWeekEvents();
        return;
      }

      if (instanceDate === existing.startDate) {
        await updateStoredEvent(
          invoke,
          eventId,
          buildEventInput(existing, {
            startDate: resolvedStartDate,
            endDate: resolvedEndDate,
            startTime,
            endTime,
            allDay: false,
            recurrence: adjustRecurringRuleForDate(recurrence, instanceDate, resolvedStartDate)
          })
        );
        if (linkedUpdates.length > 0) {
          await applyTimedUpdates(invoke, linkedUpdates);
        }
        setPendingHighlightEvent({
          eventId: `${eventId}_${resolvedStartDate}`,
          skipScroll: true
        });
      } else {
        await updateStoredEvent(
          invoke,
          eventId,
          buildEventInput(existing, {
            recurrence: truncateRecurringSeries(recurrence, instanceDate)
          })
        );
        const newRecurrence = adjustRecurringRuleForDate(
          { ...recurrence, exceptionDates: [] },
          instanceDate,
          resolvedStartDate
        );
        const created = await createStoredEvent(
          invoke,
          buildEventInput(existing, {
            startDate: resolvedStartDate,
            endDate: resolvedEndDate,
            startTime,
            endTime,
            allDay: false,
            recurrence: newRecurrence,
            recurrenceParentId: null
          })
        );
        if (linkedUpdates.length > 0) {
          await applyTimedUpdates(invoke, linkedUpdates);
        }
        if (created?.id) {
          setPendingHighlightEvent({ eventId: created.id, skipScroll: true });
        } else {
          setPendingHighlightEvent(null);
        }
      }
      await refreshCurrentWeekEvents();
    } catch (error) {
      setPendingWeekViewRenderOptions(null);
      window.alert(String(error));
      console.error(`Failed to ${actionName} event`, error);
    }
  };
}
