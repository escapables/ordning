function parseDateKey(value) {
  const [year, month, day] = String(value ?? "").split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDaysToDateKey(value, days) {
  const parsed = parseDateKey(value);
  if (!(parsed instanceof Date)) {
    return String(value ?? "");
  }

  parsed.setDate(parsed.getDate() + days);
  return formatDateKey(parsed);
}

function dateKeyDayBefore(value) {
  return addDaysToDateKey(value, -1);
}

function weekdayKey(value) {
  const parsed = parseDateKey(value);
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  if (!(parsed instanceof Date)) {
    return "mon";
  }
  return keys[parsed.getDay()] ?? "mon";
}

function weekOfMonth(value) {
  const parsed = parseDateKey(value);
  if (!(parsed instanceof Date)) {
    return 1;
  }
  return Math.min(5, Math.floor((parsed.getDate() - 1) / 7) + 1);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function hasOwn(overrides, key) {
  return Object.prototype.hasOwnProperty.call(overrides, key);
}

function toRecurrenceInput(rule) {
  if (!rule) {
    return null;
  }

  const endCondition = rule.end_condition ?? { type: "never" };
  const endConditionType = endCondition.type === "after_count"
    ? "after_count"
    : (endCondition.type === "until_date" ? "until_date" : "never");

  return {
    frequency: rule.frequency === "monthly" ? "monthly" : "weekly",
    interval: clampInteger(rule.interval, 1, 1, 52),
    daysOfWeek: Array.isArray(rule.days_of_week) ? [...rule.days_of_week] : [],
    endConditionType,
    endConditionCount: endConditionType === "after_count"
      ? clampInteger(endCondition.count, 1, 1, 999)
      : null,
    endConditionUntilDate: endConditionType === "until_date"
      ? endCondition.until_date ?? null
      : null,
    exceptionDates: Array.isArray(rule.exception_dates)
      ? Array.from(new Set(rule.exception_dates))
      : [],
    weekOfMonth: rule.week_of_month ?? null,
    dayOfWeek: rule.day_of_week ?? null
  };
}

function buildEventInput(existing, overrides = {}) {
  return {
    calendarId: hasOwn(overrides, "calendarId") ? overrides.calendarId : existing.calendarId,
    title: hasOwn(overrides, "title") ? overrides.title : (existing.title ?? ""),
    startDate: hasOwn(overrides, "startDate") ? overrides.startDate : existing.startDate,
    endDate: hasOwn(overrides, "endDate") ? overrides.endDate : (existing.endDate ?? existing.startDate),
    startTime: hasOwn(overrides, "startTime") ? overrides.startTime : (existing.startTime ?? null),
    endTime: hasOwn(overrides, "endTime") ? overrides.endTime : (existing.endTime ?? null),
    allDay: hasOwn(overrides, "allDay") ? Boolean(overrides.allDay) : Boolean(existing.allDay),
    descriptionPrivate: hasOwn(overrides, "descriptionPrivate")
      ? overrides.descriptionPrivate
      : (existing.descriptionPrivate ?? ""),
    descriptionPublic: hasOwn(overrides, "descriptionPublic")
      ? overrides.descriptionPublic
      : (existing.descriptionPublic ?? ""),
    location: hasOwn(overrides, "location") ? overrides.location : (existing.location ?? ""),
    recurrence: hasOwn(overrides, "recurrence")
      ? overrides.recurrence
      : toRecurrenceInput(existing.recurrence),
    recurrenceParentId: hasOwn(overrides, "recurrenceParentId")
      ? overrides.recurrenceParentId
      : (existing.recurrenceParentId ?? null)
  };
}

function appendExceptionDate(recurrence, dateKey) {
  if (!recurrence) {
    return null;
  }

  const nextDates = Array.from(new Set([...(recurrence.exceptionDates ?? []), dateKey]));
  return {
    ...recurrence,
    exceptionDates: nextDates
  };
}

function truncateRecurringSeries(recurrence, dateKey) {
  if (!recurrence) {
    return null;
  }

  return {
    ...recurrence,
    endConditionType: "until_date",
    endConditionCount: null,
    endConditionUntilDate: dateKeyDayBefore(dateKey)
  };
}

function adjustRecurringRuleForDate(recurrence, fromDateKey, toDateKey) {
  if (!recurrence || !fromDateKey || !toDateKey || fromDateKey === toDateKey) {
    return recurrence;
  }

  if (recurrence.frequency === "monthly") {
    return {
      ...recurrence,
      weekOfMonth: weekOfMonth(toDateKey),
      dayOfWeek: weekdayKey(toDateKey)
    };
  }

  const previousDay = weekdayKey(fromDateKey);
  const nextDay = weekdayKey(toDateKey);
  const existingDays = Array.isArray(recurrence.daysOfWeek) && recurrence.daysOfWeek.length > 0
    ? [...recurrence.daysOfWeek]
    : [previousDay];
  let replaced = false;
  const shiftedDays = existingDays.map((day) => {
    if (!replaced && day === previousDay) {
      replaced = true;
      return nextDay;
    }
    return day;
  });

  if (!replaced) {
    shiftedDays.push(nextDay);
  }

  return {
    ...recurrence,
    daysOfWeek: Array.from(new Set(shiftedDays))
  };
}

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

function normalizeDeleteTarget(target) {
  if (typeof target === "string") {
    return {
      eventId: target,
      instanceDate: null,
      isVirtual: false
    };
  }

  return {
    eventId: target?.id ?? null,
    instanceDate: target?.date ?? null,
    isVirtual: Boolean(target?.isVirtual)
  };
}

async function chooseRecurringScope(confirmDialog, t, confirmTone) {
  return confirmDialog.choose(t("recurrenceEditPrompt"), {
    confirmLabel: t("recurrenceEditAllFuture"),
    confirmTone,
    alternateLabel: t("recurrenceEditJustThisOne")
  });
}

async function updateStoredEvent(invoke, eventId, payload) {
  await invoke("update_event", {
    id: eventId,
    event: payload
  });
}

async function deleteStoredEvent(invoke, eventId) {
  await invoke("delete_event", { id: eventId });
}

async function getStoredEvent(invoke, eventId) {
  return invoke("get_event", { id: eventId });
}

async function createStoredEvent(invoke, payload) {
  return invoke("create_event", {
    event: payload
  });
}

async function applyTimedUpdates(invoke, updates) {
  for (const update of updates) {
    const existing = await getStoredEvent(invoke, update.eventId);
    await updateStoredEvent(
      invoke,
      update.eventId,
      buildEventInput(existing, {
        startDate: update.startDate ?? update.date,
        endDate: update.endDate ?? update.date,
        startTime: update.startTime,
        endTime: update.endTime,
        allDay: false
      })
    );
  }
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
  const deleteEventById = async (target) => {
    const { eventId, instanceDate, isVirtual } = normalizeDeleteTarget(target);
    if (!eventId) {
      return false;
    }

    try {
      if (!isVirtual || !instanceDate) {
        const confirmed = await confirmDialog.confirm(t("eventFormDeleteConfirm"));
        if (!confirmed) {
          return false;
        }

        await deleteStoredEvent(invoke, eventId);
        await refreshAndRender();
        return true;
      }

      const choice = await chooseRecurringScope(confirmDialog, t, "danger");
      if (!choice) {
        return false;
      }

      const existing = await getStoredEvent(invoke, eventId);
      const recurrence = toRecurrenceInput(existing.recurrence);
      const nextRecurrence = choice === "alternate"
        ? appendExceptionDate(recurrence, instanceDate)
        : truncateRecurringSeries(recurrence, instanceDate);

      await updateStoredEvent(
        invoke,
        eventId,
        buildEventInput(existing, { recurrence: nextRecurrence })
      );
      setPendingHighlightEvent(null);
      await refreshAndRender();
      return true;
    } catch (error) {
      window.alert(String(error));
      console.error("Failed to delete event", error);
      return false;
    }
  };

  const updateTimedEventPosition = async (
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
  ) => {
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

      const choice = await chooseRecurringScope(confirmDialog, t, "success");
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
      await refreshCurrentWeekEvents();
    } catch (error) {
      setPendingWeekViewRenderOptions(null);
      window.alert(String(error));
      console.error(`Failed to ${actionName} event`, error);
    }
  };

  const deleteMultipleEvents = async (targets) => {
    if (!Array.isArray(targets) || targets.length === 0) {
      return false;
    }

    if (targets.length === 1) {
      return deleteEventById(targets[0]);
    }

    try {
      const hasVirtual = targets.some((target) => target.isVirtual);
      let message = t("multiDeleteConfirm").replace("{count}", String(targets.length));
      if (hasVirtual) {
        message += "\n" + t("multiDeleteRecurringNote");
      }
      const confirmed = await confirmDialog.confirm(message);
      if (!confirmed) {
        return false;
      }

      const nonVirtual = targets.filter((target) => !target.isVirtual);
      const virtual = targets.filter((target) => target.isVirtual && target.date);

      if (nonVirtual.length > 0) {
        await invoke("delete_events", { ids: nonVirtual.map((target) => target.id) });
      }

      for (const target of virtual) {
        const existing = await getStoredEvent(invoke, target.id);
        const recurrence = toRecurrenceInput(existing.recurrence);
        await updateStoredEvent(
          invoke,
          target.id,
          buildEventInput(existing, { recurrence: appendExceptionDate(recurrence, target.date) })
        );
      }

      await refreshAndRender();
      return true;
    } catch (error) {
      window.alert(String(error));
      console.error("Failed to delete multiple events", error);
      return false;
    }
  };

  return {
    deleteEventById,
    deleteMultipleEvents,
    updateTimedEventPosition
  };
}
