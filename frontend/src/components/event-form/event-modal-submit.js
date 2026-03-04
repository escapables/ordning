import {
  toRecurrenceInput,
  buildEventInput,
  appendExceptionDate,
  chooseRecurringScope,
  createStoredEvent
} from "../../main/event-mutations.js";

export function createEventModalSubmitHandlers({
  state,
  confirmDialog,
  t,
  invoke,
  onPersist,
  onDelete,
  getCalendars,
  calendarSelect,
  titleInput,
  dialog,
  showError,
  clearError,
  setTitleValidationError,
  collectPayload,
  descriptionChanged
}) {
  async function maybeBulkUpdateDescriptions(payload) {
    if (!confirmDialog || !state.editingId || !descriptionChanged(payload)) {
      return true;
    }

    const matchCount = await invoke("count_events_by_title", {
      title: payload.title,
      calendarId: payload.calendarId,
      excludeId: state.editingId
    });

    if (matchCount === 0) {
      return true;
    }

    const choice = await confirmDialog.choose(
      t("bulkDescriptionPrompt").replace("{count}", matchCount),
      {
        confirmLabel: t("bulkDescriptionUpdateAll"),
        confirmTone: "success",
        alternateLabel: t("bulkDescriptionOnlyThis")
      }
    );

    if (choice === false) {
      return false;
    }

    if (choice === true) {
      await invoke("bulk_update_descriptions", {
        title: payload.title,
        calendarId: payload.calendarId,
        excludeId: state.editingId,
        descriptionPrivate: payload.descriptionPrivate,
        descriptionPublic: payload.descriptionPublic
      });
    }

    return true;
  }

  async function handleDelete() {
    if (!state.editingId) {
      return;
    }

    try {
      const deleteTarget = state.isVirtual && state.instanceDate
        ? { id: state.editingId, date: state.instanceDate, isVirtual: true }
        : state.editingId;
      const deleted = await onDelete(deleteTarget);
      if (!deleted) {
        return;
      }

      dialog.close();
    } catch (invokeError) {
      showError(String(invokeError));
    }
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    clearError();

    if (state.mode === "create" && getCalendars().length === 0) {
      showError(t("eventFormNoCalendars"));
      return;
    }

    if (!calendarSelect.value) {
      showError(t("eventFormCalendarRequired"));
      return;
    }

    if (titleInput.value.trim().length === 0) {
      setTitleValidationError(true);
      titleInput.focus();
      return;
    }

    const payload = collectPayload();

    try {
      if (state.mode === "edit" && state.editingId) {
        if (descriptionChanged(payload) && payload.recurrence != null && state.isVirtual && state.instanceDate) {
          const choice = await chooseRecurringScope(confirmDialog, t, "success");
          if (!choice) {
            return;
          }

          if (choice === "alternate") {
            const existing = await invoke("get_event", { id: state.editingId });
            const recurrence = toRecurrenceInput(existing.recurrence);
            await invoke("update_event", {
              id: state.editingId,
              event: buildEventInput(existing, {
                recurrence: appendExceptionDate(recurrence, state.instanceDate)
              })
            });
            await createStoredEvent(
              invoke,
              buildEventInput(existing, {
                descriptionPrivate: payload.descriptionPrivate,
                descriptionPublic: payload.descriptionPublic,
                startDate: state.instanceDate,
                endDate: state.instanceDate,
                recurrence: null,
                recurrenceParentId: state.editingId
              })
            );
          } else {
            const proceed = await maybeBulkUpdateDescriptions(payload);
            if (!proceed) {
              return;
            }
            await invoke("update_event", { id: state.editingId, event: payload });
          }
        } else {
          const proceed = await maybeBulkUpdateDescriptions(payload);
          if (!proceed) {
            return;
          }
          await invoke("update_event", { id: state.editingId, event: payload });
        }
      } else {
        await invoke("create_event", { event: payload });
      }

      await onPersist?.();
      dialog.close();
    } catch (invokeError) {
      showError(String(invokeError));
    }
  }

  return {
    handleDelete,
    handleSubmit
  };
}
