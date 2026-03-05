// Tauri API mock for Playwright-based UI validation.
// Load as a classic <script> (or via addInitScript) BEFORE the ES module entry point.
// Provides window.__TAURI__.core.invoke() with mutable state for CRUD flows.
(function () {
  "use strict";

  var recurrenceTools = window.__ORDNING_TAURI_MOCK_RECURRENCE || {
    buildEventResponse: function (event) {
      return { ...event, recurrence: null, recurrenceParentId: event.recurrenceParentId ?? null };
    },
    createWeekPayload: function () {
      return { timed: [], all_day: [] };
    },
    normalizeRecurrencePayload: function () {
      return null;
    }
  };

  function dateKey(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function weekMonday(ref) {
    var current = new Date(ref);
    current.setHours(0, 0, 0, 0);
    var day = current.getDay();
    var diff = (day - 1 + 7) % 7;
    current.setDate(current.getDate() - diff);
    return current;
  }

  function toIso() {
    return new Date().toISOString();
  }

  function makeId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
  }

  function calendarById(id) {
    return state.calendars.find(function (calendar) {
      return calendar.id === id;
    });
  }

  function visibleCalendarIds() {
    return new Set(
      state.calendars
        .filter(function (calendar) {
          return calendar.visible;
        })
        .map(function (calendar) {
          return calendar.id;
        })
    );
  }

  function searchEvents(query) {
    var visibleIds = visibleCalendarIds();
    var normalized = String(query || "").trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    return state.events
      .filter(function (event) {
        return visibleIds.has(event.calendarId);
      })
      .filter(function (event) {
        var title = String(event.title || "").toLowerCase();
        var privateDescription = String(event.descriptionPrivate || "").toLowerCase();
        var publicDescription = String(event.descriptionPublic || "").toLowerCase();
        var location = String(event.location || "").toLowerCase();

        return (
          title.includes(normalized) ||
          privateDescription.includes(normalized) ||
          publicDescription.includes(normalized) ||
          location.includes(normalized)
        );
      })
      .sort(function (left, right) {
        return left.startDate.localeCompare(right.startDate);
      })
      .map(function (event) {
        return {
          id: event.id,
          calendar_id: event.calendarId,
          title: event.title,
          start_date: event.startDate,
          end_date: event.endDate,
          start_time: event.startTime,
          end_time: event.endTime,
          all_day: Boolean(event.allDay || !event.startTime || !event.endTime),
          location: event.location || null,
          description_public: event.descriptionPublic || ""
        };
      });
  }

  function normalizeEventPayload(id, payload) {
    var nowIso = toIso();
    return {
      id: id || makeId("evt"),
      calendarId: payload.calendarId,
      title: payload.title || "",
      startDate: payload.startDate,
      endDate: payload.endDate ?? payload.startDate,
      startTime: payload.startTime ?? null,
      endTime: payload.endTime ?? null,
      allDay: Boolean(payload.allDay),
      location: payload.location || "",
      descriptionPrivate: payload.descriptionPrivate || "",
      descriptionPublic: payload.descriptionPublic || "",
      recurrence: recurrenceTools.normalizeRecurrencePayload(payload.recurrence),
      recurrenceParentId: payload.recurrenceParentId ?? null,
      updated_at: nowIso
    };
  }

  var now = new Date();
  var monday = weekMonday(now);
  var ts = toIso();
  var mon = dateKey(monday);
  var tue = dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1));
  var wed = dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2));
  var fri = dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4));
  var today = dateKey(now);
  var past = dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 14));
  var createState = window.__createOrdningTauriMockState;
  var state = typeof createState === "function"
    ? createState({ ts: ts, mon: mon, tue: tue, wed: wed, fri: fri, today: today, past: past })
    : { settings: { lang: "sv", timezone: "Europe/Stockholm" }, calendars: [], events: [] };

  function persistEncryptionState() {
    try {
      if (state.settings.storageEncrypted) {
        window.localStorage.setItem("ordning.mock.storageEncrypted", "1");
        if (state.encryptionPassword) {
          window.localStorage.setItem(
            "ordning.mock.encryptionPassword",
            String(state.encryptionPassword)
          );
        }
      } else {
        window.localStorage.removeItem("ordning.mock.storageEncrypted");
        window.localStorage.removeItem("ordning.mock.encryptionPassword");
      }
    } catch (_error) {
      // Ignore storage failures in restrictive browser contexts.
    }
  }

  persistEncryptionState();
  window.__ORDNING_TAURI_MOCK_STATE = state;

  function invoke(command, payload) {
    switch (command) {
      case "get_settings":
        return Promise.resolve({ ...state.settings });

      case "set_settings": {
        if (state.settings.storageLocked) {
          return Promise.reject("unlock encrypted data before changing settings");
        }
        var nextLang = payload && payload.settings && payload.settings.lang;
        var nextTimezone = payload && payload.settings && payload.settings.timezone;
        if (nextLang !== "sv" && nextLang !== "en") {
          return Promise.reject("unsupported language");
        }
        if (!nextTimezone || !String(nextTimezone).trim()) {
          return Promise.reject("unsupported timezone");
        }
        state.settings.lang = nextLang;
        state.settings.timezone = String(nextTimezone);
        return Promise.resolve({ ...state.settings });
      }

      case "unlock_encrypted_data": {
        var unlockPassword = payload && payload.password;
        if (!unlockPassword || !String(unlockPassword).trim()) {
          return Promise.reject("password is required");
        }
        if (!state.settings.storageEncrypted || !state.settings.storageLocked) {
          return Promise.resolve({ ...state.settings });
        }
        if (unlockPassword !== state.encryptionPassword) {
          return Promise.reject(
            "failed to unlock data file: invalid password or corrupted encrypted data"
          );
        }
        state.settings.storageLocked = false;
        persistEncryptionState();
        return Promise.resolve({ ...state.settings });
      }

      case "enable_encryption": {
        var enablePassword = payload && payload.password;
        if (!enablePassword || !String(enablePassword).trim()) {
          return Promise.reject("password is required");
        }
        state.encryptionPassword = String(enablePassword);
        state.settings.storageEncrypted = true;
        state.settings.storageLocked = false;
        persistEncryptionState();
        return Promise.resolve({ encrypted: true, locked: false });
      }

      case "disable_encryption": {
        var disablePassword = payload && payload.password;
        if (!disablePassword || !String(disablePassword).trim()) {
          return Promise.reject("password is required");
        }
        if (state.settings.storageLocked) {
          return Promise.reject("unlock encrypted data before disabling encryption");
        }
        if (!state.settings.storageEncrypted) {
          return Promise.reject("data file is not encrypted");
        }
        if (String(disablePassword) !== state.encryptionPassword) {
          return Promise.reject("failed to disable encryption: invalid password");
        }
        state.settings.storageEncrypted = false;
        state.settings.storageLocked = false;
        state.encryptionPassword = null;
        persistEncryptionState();
        return Promise.resolve({ encrypted: false, locked: false });
      }

      case "list_calendars":
        return Promise.resolve(state.calendars.slice());

      case "create_calendar": {
        var id = makeId("cal");
        var nowIso = toIso();
        var calendar = {
          id: id,
          name: (payload && payload.name) || "New calendar",
          color: (payload && payload.color) || "#007aff",
          group: "default",
          visible: true,
          created_at: nowIso,
          updated_at: nowIso
        };
        state.calendars.push(calendar);
        return Promise.resolve(calendar);
      }

      case "delete_calendar": {
        var idToDelete = payload && payload.id;
        var before = state.calendars.length;
        state.calendars = state.calendars.filter(function (calendar) {
          return calendar.id !== idToDelete;
        });
        if (state.calendars.length === before) {
          return Promise.reject("calendar not found");
        }
        state.events = state.events.filter(function (event) {
          return event.calendarId !== idToDelete;
        });
        return Promise.resolve(null);
      }

      case "toggle_visibility": {
        var target = calendarById(payload && payload.id);
        if (!target) {
          return Promise.reject("calendar not found");
        }
        var visibleCount = state.calendars.filter(function (calendar) {
          return calendar.visible;
        }).length;
        if (target.visible && visibleCount <= 1) {
          return Promise.reject("at least one calendar must remain visible");
        }
        target.visible = !target.visible;
        target.updated_at = toIso();
        return Promise.resolve(target);
      }

      case "get_week_events": {
        var startDate = (payload && payload.startDate) || "0000-00-00";
        var endDate = (payload && payload.endDate) || "9999-99-99";
        return Promise.resolve(recurrenceTools.createWeekPayload(state, startDate, endDate));
      }

      case "search_events":
        return Promise.resolve(searchEvents(payload && payload.query));

      case "get_event": {
        var found = state.events.find(function (event) {
          return event.id === (payload && payload.id);
        });
        if (!found) {
          return Promise.reject("Event not found: " + (payload && payload.id));
        }
        return Promise.resolve(recurrenceTools.buildEventResponse(found));
      }

      case "create_event": {
        var eventPayload = (payload && payload.event) || {};
        var created = normalizeEventPayload(null, eventPayload);
        state.events.push(created);
        return Promise.resolve({ id: created.id });
      }

      case "update_event": {
        var eventId = payload && payload.id;
        var nextPayload = (payload && payload.event) || {};
        var index = state.events.findIndex(function (event) {
          return event.id === eventId;
        });
        if (index < 0) {
          return Promise.reject("Event not found: " + eventId);
        }
        state.events[index] = normalizeEventPayload(eventId, {
          ...state.events[index],
          ...nextPayload
        });
        return Promise.resolve(null);
      }

      case "delete_event": {
        var id = payload && payload.id;
        var before = state.events.length;
        state.events = state.events.filter(function (event) {
          return event.id !== id;
        });
        if (state.events.length === before) {
          return Promise.reject("Event not found: " + id);
        }
        return Promise.resolve(null);
      }

      case "delete_events": {
        var idsToDelete = new Set((payload && payload.ids) || []);
        var beforeCount = state.events.length;
        state.events = state.events.filter(function (event) {
          return !idsToDelete.has(event.id);
        });
        return Promise.resolve(beforeCount - state.events.length);
      }

      case "count_events_by_title": {
        var countTitle = String((payload && payload.title) || "").trim().toLowerCase();
        var countCalendarId = payload && payload.calendarId;
        var countExcludeId = payload && payload.excludeId;
        var matchCount = state.events.filter(function (event) {
          return event.id !== countExcludeId
            && event.calendarId === countCalendarId
            && String(event.title || "").trim().toLowerCase() === countTitle;
        }).length;
        return Promise.resolve(matchCount);
      }

      case "bulk_update_descriptions": {
        var bulkTitle = String((payload && payload.title) || "").trim().toLowerCase();
        var bulkCalendarId = payload && payload.calendarId;
        var bulkExcludeId = payload && payload.excludeId;
        var bulkPrivate = (payload && payload.descriptionPrivate) || "";
        var bulkPublic = (payload && payload.descriptionPublic) || "";
        var bulkCount = 0;
        state.events.forEach(function (event) {
          if (event.id !== bulkExcludeId
            && event.calendarId === bulkCalendarId
            && String(event.title || "").trim().toLowerCase() === bulkTitle) {
            event.descriptionPrivate = bulkPrivate;
            event.descriptionPublic = bulkPublic;
            event.updated_at = toIso();
            bulkCount++;
          }
        });
        return Promise.resolve(bulkCount);
      }

      case "get_past_events_count": {
        var todayKey = (payload && payload.beforeDate) || dateKey(new Date());
        var count = state.events.filter(function (event) {
          return String(event.startDate) < todayKey;
        }).length;
        return Promise.resolve(count);
      }

      case "purge_past_events": {
        var todayKey = (payload && payload.beforeDate) || dateKey(new Date());
        var count = state.events.filter(function (event) {
          return String(event.startDate) < todayKey;
        }).length;

        state.events = state.events.filter(function (event) {
          return String(event.startDate) >= todayKey;
        });
        return Promise.resolve(count);
      }

      case "get_export_event_count": {
        var selectedIds = new Set((payload && payload.calendarIds) || []);
        var count = state.events.filter(function (event) {
          return selectedIds.has(event.calendarId);
        }).length;
        return Promise.resolve(count);
      }

      case "export_json":
        return Promise.resolve({ path: "/tmp/ordning-export.json" });

      case "preview_import_json":
        return Promise.resolve({
          path: "/tmp/import-sample.json",
          encrypted: false,
          summary: {
            calendarCount: 1,
            eventCount: 3,
            newEvents: 2,
            updatedEvents: 1,
            conflictEvents: 0
          }
        });

      case "import_json":
        return Promise.resolve({
          summary: {
            newEvents: 2,
            updatedEvents: 1,
            conflictEvents: 0
          }
        });

      default:
        console.warn("[tauri-mock] unhandled command:", command, payload);
        return Promise.resolve(null);
    }
  }

  window.__TAURI__ = {
    core: { invoke: invoke },
    process: {
      exit: function (code) {
        state.lastExitCode = code;
        return Promise.resolve();
      }
    }
  };
})();
