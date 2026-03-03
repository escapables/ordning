(function () {
  "use strict";

  var DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  function dateKey(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function parseDateKey(value) {
    var parts = String(value || "").split("-").map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      return null;
    }

    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setHours(0, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(date, count) {
    var next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  }

  function addDaysToKey(value, count) {
    var base = parseDateKey(value);
    return base ? dateKey(addDays(base, count)) : String(value || "");
  }

  function daySpan(startDate, endDate) {
    var start = parseDateKey(startDate);
    var end = parseDateKey(endDate);
    if (!start || !end) {
      return 0;
    }

    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  }

  function overlapsRange(startDate, endDate, rangeStart, rangeEnd) {
    return String(endDate || startDate) >= rangeStart && String(startDate || endDate) <= rangeEnd;
  }

  function clampInt(value, fallback, min, max) {
    var numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, numeric));
  }

  function weekdayKey(date) {
    return DAY_KEYS[date.getDay()] || "sun";
  }

  function weekOfMonth(date) {
    return Math.min(5, Math.floor((date.getDate() - 1) / 7) + 1);
  }

  function normalizeRecurrencePayload(recurrence) {
    if (!recurrence || typeof recurrence !== "object") {
      return null;
    }

    return {
      frequency: recurrence.frequency === "monthly" ? "monthly" : "weekly",
      interval: clampInt(recurrence.interval, 1, 1, 52),
      daysOfWeek: Array.isArray(recurrence.daysOfWeek)
        ? recurrence.daysOfWeek.filter(function (value) {
          return DAY_KEYS.includes(value);
        })
        : [],
      endConditionType: recurrence.endConditionType === "after_count"
        ? "after_count"
        : (recurrence.endConditionType === "until_date" ? "until_date" : "never"),
      endConditionCount: recurrence.endConditionType === "after_count"
        ? clampInt(recurrence.endConditionCount, 1, 1, 999)
        : null,
      endConditionUntilDate: recurrence.endConditionType === "until_date"
        ? (typeof recurrence.endConditionUntilDate === "string"
          ? recurrence.endConditionUntilDate
          : null)
        : null,
      exceptionDates: Array.isArray(recurrence.exceptionDates)
        ? recurrence.exceptionDates.filter(function (value) {
          return typeof value === "string";
        })
        : [],
      weekOfMonth: recurrence.weekOfMonth == null
        ? null
        : clampInt(recurrence.weekOfMonth, 1, 1, 5),
      dayOfWeek: DAY_KEYS.includes(recurrence.dayOfWeek) ? recurrence.dayOfWeek : null
    };
  }

  function recurrenceToRule(recurrence) {
    if (!recurrence) {
      return null;
    }

    var endCondition = { type: "never" };
    if (recurrence.endConditionType === "after_count") {
      endCondition = {
        type: "after_count",
        count: clampInt(recurrence.endConditionCount, 1, 1, 999)
      };
    } else if (recurrence.endConditionType === "until_date") {
      endCondition = {
        type: "until_date",
        until_date: recurrence.endConditionUntilDate
      };
    }

    return {
      frequency: recurrence.frequency,
      interval: clampInt(recurrence.interval, 1, 1, 52),
      days_of_week: Array.isArray(recurrence.daysOfWeek) ? recurrence.daysOfWeek.slice() : [],
      end_condition: endCondition,
      exception_dates: Array.isArray(recurrence.exceptionDates) ? recurrence.exceptionDates.slice() : [],
      week_of_month: recurrence.weekOfMonth,
      day_of_week: recurrence.dayOfWeek
    };
  }

  function buildEventResponse(event) {
    return {
      ...event,
      recurrence: recurrenceToRule(event.recurrence),
      recurrenceParentId: event.recurrenceParentId ?? null
    };
  }

  function calendarColor(state, calendarId) {
    var calendar = state.calendars.find(function (entry) {
      return entry.id === calendarId;
    });
    return calendar ? calendar.color : "#007aff";
  }

  function toWeekEvent(state, event) {
    return {
      id: event.displayId || event.id,
      source_id: event.sourceId || null,
      is_virtual: Boolean(event.isVirtual),
      date: event.startDate,
      start_date: event.startDate,
      end_date: event.endDate,
      start_time: event.startTime,
      end_time: event.endTime,
      title: event.title,
      color: calendarColor(state, event.calendarId)
    };
  }

  function toAllDayEvent(state, event) {
    return {
      id: event.displayId || event.id,
      source_id: event.sourceId || null,
      is_virtual: Boolean(event.isVirtual),
      date: event.startDate,
      title: event.title,
      color: calendarColor(state, event.calendarId)
    };
  }

  function recurringParentIds(state) {
    return new Set(
      state.events
        .filter(function (event) {
          return Boolean(event.recurrence) && !event.recurrenceParentId;
        })
        .map(function (event) {
          return event.id;
        })
    );
  }

  function collectOverrides(state) {
    var overridesByParent = new Map();

    state.events.forEach(function (event) {
      if (event.recurrence || !event.recurrenceParentId) {
        return;
      }

      if (!overridesByParent.has(event.recurrenceParentId)) {
        overridesByParent.set(event.recurrenceParentId, new Map());
      }

      overridesByParent.get(event.recurrenceParentId).set(event.startDate, event);
    });

    return overridesByParent;
  }

  function nthWeekdayOfMonth(year, monthIndex, weekOrdinal, dayKeyValue) {
    var targetIndex = DAY_KEYS.indexOf(dayKeyValue);
    if (targetIndex < 0) {
      return null;
    }

    var firstDay = new Date(year, monthIndex, 1);
    firstDay.setHours(0, 0, 0, 0);
    var offset = (targetIndex - firstDay.getDay() + 7) % 7;
    var occurrence = new Date(year, monthIndex, 1 + offset + ((weekOrdinal - 1) * 7));
    occurrence.setHours(0, 0, 0, 0);

    return occurrence.getMonth() === monthIndex ? occurrence : null;
  }

  function weeklyOccurrenceDates(event, recurrence, expansionEnd) {
    var startDate = parseDateKey(event.startDate);
    if (!startDate) {
      return [];
    }

    var interval = clampInt(recurrence.interval, 1, 1, 52);
    var configuredDays = Array.isArray(recurrence.daysOfWeek)
      ? recurrence.daysOfWeek.filter(function (value) {
        return DAY_KEYS.includes(value);
      })
      : [];
    var scheduledDays = new Set(configuredDays.length ? configuredDays : [weekdayKey(startDate)]);
    var current = new Date(startDate);
    var dates = [];

    while (current <= expansionEnd) {
      var daysSinceStart = Math.round((current.getTime() - startDate.getTime()) / 86400000);
      var weekOffset = Math.floor(daysSinceStart / 7);

      if (weekOffset % interval === 0 && scheduledDays.has(weekdayKey(current))) {
        dates.push(dateKey(current));
      }

      current = addDays(current, 1);
    }

    return dates;
  }

  function monthlyOccurrenceDates(event, recurrence, expansionEnd) {
    var startDate = parseDateKey(event.startDate);
    if (!startDate) {
      return [];
    }

    var interval = clampInt(recurrence.interval, 1, 1, 52);
    var ordinal = recurrence.weekOfMonth == null
      ? weekOfMonth(startDate)
      : clampInt(recurrence.weekOfMonth, weekOfMonth(startDate), 1, 5);
    var dayKeyValue = DAY_KEYS.includes(recurrence.dayOfWeek)
      ? recurrence.dayOfWeek
      : weekdayKey(startDate);
    var dates = [];

    for (var monthOffset = 0; ; monthOffset += interval) {
      var monthStart = new Date(startDate.getFullYear(), startDate.getMonth() + monthOffset, 1);
      monthStart.setHours(0, 0, 0, 0);
      if (monthStart > expansionEnd) {
        break;
      }

      var occurrence = nthWeekdayOfMonth(
        monthStart.getFullYear(),
        monthStart.getMonth(),
        ordinal,
        dayKeyValue
      );

      if (occurrence && occurrence >= startDate && occurrence <= expansionEnd) {
        dates.push(dateKey(occurrence));
      }
    }

    return dates;
  }

  function recurrenceExpansionEnd(event, recurrence, rangeEnd) {
    var startDate = parseDateKey(event.startDate);
    var viewEnd = parseDateKey(rangeEnd);
    if (!startDate || !viewEnd) {
      return null;
    }

    var hardLimit = addDays(startDate, 365);
    var end = viewEnd < hardLimit ? viewEnd : hardLimit;

    if (recurrence.endConditionType === "until_date") {
      var untilDate = parseDateKey(recurrence.endConditionUntilDate);
      if (untilDate && untilDate < end) {
        end = untilDate;
      }
    }

    return end;
  }

  function occurrenceDates(event, recurrence, expansionEnd) {
    if (recurrence.frequency === "monthly") {
      return monthlyOccurrenceDates(event, recurrence, expansionEnd);
    }

    return weeklyOccurrenceDates(event, recurrence, expansionEnd);
  }

  function expandRecurringEvent(event, rangeStart, rangeEnd, overridesByDate, consumedOverrideIds) {
    if (!event.recurrence) {
      return [];
    }

    var recurrence = event.recurrence;
    var expansionEnd = recurrenceExpansionEnd(event, recurrence, rangeEnd);
    if (!expansionEnd) {
      return [];
    }

    var dates = occurrenceDates(event, recurrence, expansionEnd);
    var exceptionDates = new Set(
      Array.isArray(recurrence.exceptionDates) ? recurrence.exceptionDates : []
    );
    var spanDays = daySpan(event.startDate, event.endDate);
    var afterCount = recurrence.endConditionType === "after_count"
      ? clampInt(recurrence.endConditionCount, 1, 1, 999)
      : null;
    var expanded = [];
    var scheduledCount = 0;

    for (var index = 0; index < dates.length; index += 1) {
      var occurrenceDate = dates[index];
      scheduledCount += 1;

      var overrideEvent = overridesByDate ? overridesByDate.get(occurrenceDate) : null;
      if (overrideEvent) {
        consumedOverrideIds.add(overrideEvent.id);
        if (overlapsRange(overrideEvent.startDate, overrideEvent.endDate, rangeStart, rangeEnd)) {
          expanded.push({
            ...overrideEvent,
            displayId: overrideEvent.id,
            sourceId: overrideEvent.id,
            isVirtual: false
          });
        }
      } else if (!exceptionDates.has(occurrenceDate)) {
        var occurrenceEndDate = addDaysToKey(occurrenceDate, spanDays);
        if (overlapsRange(occurrenceDate, occurrenceEndDate, rangeStart, rangeEnd)) {
          expanded.push({
            ...event,
            displayId: event.id + "_" + occurrenceDate,
            sourceId: event.id,
            isVirtual: true,
            startDate: occurrenceDate,
            endDate: occurrenceEndDate
          });
        }
      }

      if (afterCount != null && scheduledCount >= afterCount) {
        break;
      }
    }

    return expanded;
  }

  function expandedWeekEvents(state, startDate, endDate) {
    var visibleIds = new Set(
      state.calendars
        .filter(function (calendar) {
          return calendar.visible;
        })
        .map(function (calendar) {
          return calendar.id;
        })
    );
    var recurringIds = recurringParentIds(state);
    var overridesByParent = collectOverrides(state);
    var consumedOverrideIds = new Set();
    var expanded = [];

    state.events.forEach(function (event) {
      if (!visibleIds.has(event.calendarId)) {
        return;
      }

      if (event.recurrence && !event.recurrenceParentId) {
        expandRecurringEvent(
          event,
          startDate,
          endDate,
          overridesByParent.get(event.id),
          consumedOverrideIds
        ).forEach(function (instance) {
          expanded.push(instance);
        });
        return;
      }

      if (event.recurrenceParentId && recurringIds.has(event.recurrenceParentId)) {
        return;
      }

      if (overlapsRange(event.startDate, event.endDate, startDate, endDate)) {
        expanded.push({
          ...event,
          displayId: event.id,
          sourceId: null,
          isVirtual: false
        });
      }
    });

    state.events.forEach(function (event) {
      if (event.recurrence || !event.recurrenceParentId) {
        return;
      }

      if (!visibleIds.has(event.calendarId)) {
        return;
      }

      if (!recurringIds.has(event.recurrenceParentId) || consumedOverrideIds.has(event.id)) {
        return;
      }

      if (overlapsRange(event.startDate, event.endDate, startDate, endDate)) {
        expanded.push({
          ...event,
          displayId: event.id,
          sourceId: event.id,
          isVirtual: false
        });
      }
    });

    return expanded;
  }

  function createWeekPayload(state, startDate, endDate) {
    var timed = [];
    var allDay = [];

    expandedWeekEvents(state, startDate, endDate).forEach(function (event) {
      if (event.allDay || !event.startTime || !event.endTime) {
        allDay.push(toAllDayEvent(state, event));
        return;
      }

      timed.push(toWeekEvent(state, event));
    });

    return { timed: timed, all_day: allDay };
  }

  window.__ORDNING_TAURI_MOCK_RECURRENCE = {
    buildEventResponse: buildEventResponse,
    createWeekPayload: createWeekPayload,
    normalizeRecurrencePayload: normalizeRecurrencePayload
  };
})();
