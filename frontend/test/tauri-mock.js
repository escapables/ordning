// Tauri API mock for Playwright-based UI validation.
// Load as a classic <script> (or via addInitScript) BEFORE the ES module entry point.
// Provides window.__TAURI__.core.invoke() with mutable state for CRUD flows.
(function () {
  "use strict";

  function dateKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function weekMonday(ref) {
    var d = new Date(ref);
    d.setHours(0, 0, 0, 0);
    var day = d.getDay();
    var diff = (day - 1 + 7) % 7;
    d.setDate(d.getDate() - diff);
    return d;
  }

  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function toIso() {
    return new Date().toISOString();
  }

  function makeId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
  }

  function inRange(date, startDate, endDate) {
    return date >= startDate && date <= endDate;
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

  function toWeekEvent(event) {
    var calendar = calendarById(event.calendarId);
    return {
      id: event.id,
      date: event.startDate,
      start_time: event.startTime,
      end_time: event.endTime,
      title: event.title,
      color: calendar ? calendar.color : "#007aff"
    };
  }

  function toAllDayEvent(event) {
    var calendar = calendarById(event.calendarId);
    return {
      id: event.id,
      date: event.startDate,
      title: event.title,
      color: calendar ? calendar.color : "#007aff"
    };
  }

  function createWeekPayload(startDate, endDate) {
    var visibleIds = visibleCalendarIds();
    var inRangeEvents = state.events.filter(function (event) {
      return visibleIds.has(event.calendarId) && inRange(event.startDate, startDate, endDate);
    });

    var timed = [];
    var allDay = [];
    inRangeEvents.forEach(function (event) {
      if (event.allDay || !event.startTime || !event.endTime) {
        allDay.push(toAllDayEvent(event));
        return;
      }
      timed.push(toWeekEvent(event));
    });

    return { timed: timed, all_day: allDay };
  }

  function normalizeEventPayload(id, payload) {
    var nowIso = toIso();
    return {
      id: id || makeId("evt"),
      calendarId: payload.calendarId,
      title: payload.title || "",
      startDate: payload.startDate,
      endDate: payload.endDate,
      startTime: payload.startTime ?? null,
      endTime: payload.endTime ?? null,
      allDay: Boolean(payload.allDay),
      location: payload.location || "",
      descriptionPrivate: payload.descriptionPrivate || "",
      descriptionPublic: payload.descriptionPublic || "",
      updated_at: nowIso
    };
  }

  var now = new Date();
  var monday = weekMonday(now);
  var ts = toIso();
  var mon = dateKey(monday);
  var tue = dateKey(addDays(monday, 1));
  var wed = dateKey(addDays(monday, 2));
  var fri = dateKey(addDays(monday, 4));
  var today = dateKey(now);

  var state = {
    calendars: [
      {
        id: "cal-work",
        name: "Work",
        color: "#4a90d9",
        group: "default",
        visible: true,
        created_at: ts,
        updated_at: ts
      },
      {
        id: "cal-personal",
        name: "Personal",
        color: "#e06c75",
        group: "default",
        visible: true,
        created_at: ts,
        updated_at: ts
      }
    ],
    events: [
      {
        id: "evt-1",
        calendarId: "cal-work",
        title: "Sprint Planning",
        startDate: mon,
        endDate: mon,
        startTime: "09:00",
        endTime: "10:30",
        allDay: false,
        location: "",
        descriptionPrivate: "",
        descriptionPublic: "",
        updated_at: ts
      },
      {
        id: "evt-2",
        calendarId: "cal-work",
        title: "Design Review",
        startDate: tue,
        endDate: tue,
        startTime: "14:00",
        endTime: "15:00",
        allDay: false,
        location: "Room 4B",
        descriptionPrivate: "",
        descriptionPublic: "",
        updated_at: ts
      },
      {
        id: "evt-3",
        calendarId: "cal-work",
        title: "Team Standup",
        startDate: today,
        endDate: today,
        startTime: "10:00",
        endTime: "11:30",
        allDay: false,
        location: "",
        descriptionPrivate: "",
        descriptionPublic: "",
        updated_at: ts
      },
      {
        id: "evt-4",
        calendarId: "cal-personal",
        title: "Dentist",
        startDate: today,
        endDate: today,
        startTime: "15:00",
        endTime: "16:00",
        allDay: false,
        location: "Clinic",
        descriptionPrivate: "Bring insurance card",
        descriptionPublic: "",
        updated_at: ts
      },
      {
        id: "evt-5",
        calendarId: "cal-work",
        title: "1:1 with Manager",
        startDate: fri,
        endDate: fri,
        startTime: "11:00",
        endTime: "12:00",
        allDay: false,
        location: "",
        descriptionPrivate: "",
        descriptionPublic: "",
        updated_at: ts
      },
      {
        id: "evt-ad-1",
        calendarId: "cal-personal",
        title: "Company Offsite",
        startDate: wed,
        endDate: wed,
        startTime: null,
        endTime: null,
        allDay: true,
        location: "",
        descriptionPrivate: "",
        descriptionPublic: "",
        updated_at: ts
      }
    ]
  };

  function invoke(command, payload) {
    switch (command) {
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
        return Promise.resolve(createWeekPayload(startDate, endDate));
      }

      case "get_event": {
        var found = state.events.find(function (event) {
          return event.id === (payload && payload.id);
        });
        if (!found) {
          return Promise.reject("Event not found: " + (payload && payload.id));
        }
        return Promise.resolve({ ...found });
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
    core: { invoke: invoke }
  };
})();
