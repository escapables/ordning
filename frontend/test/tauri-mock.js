// Tauri API mock for Playwright-based UI validation.
// Load as a classic <script> (or via addInitScript) BEFORE the ES module entry point.
// Provides window.__TAURI__.core.invoke() with sample data so the frontend
// renders without a running Tauri backend.
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
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

  var now = new Date();
  var ts = now.toISOString();
  var monday = weekMonday(now);

  // ---------------------------------------------------------------------------
  // Sample calendars
  // ---------------------------------------------------------------------------
  var calendars = [
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
  ];

  // ---------------------------------------------------------------------------
  // Sample events — spread across current week, today always has events
  // ---------------------------------------------------------------------------
  var today = dateKey(now);
  var mon = dateKey(monday);
  var tue = dateKey(addDays(monday, 1));
  var wed = dateKey(addDays(monday, 2));
  var thu = dateKey(addDays(monday, 3));
  var fri = dateKey(addDays(monday, 4));

  var timedEvents = [
    {
      id: "evt-1",
      date: mon,
      start_time: "09:00",
      end_time: "10:30",
      title: "Sprint Planning",
      color: "#4a90d9"
    },
    {
      id: "evt-2",
      date: tue,
      start_time: "14:00",
      end_time: "15:00",
      title: "Design Review",
      color: "#4a90d9"
    },
    {
      id: "evt-3",
      date: today,
      start_time: "10:00",
      end_time: "11:30",
      title: "Team Standup",
      color: "#4a90d9"
    },
    {
      id: "evt-4",
      date: today,
      start_time: "15:00",
      end_time: "16:00",
      title: "Dentist",
      color: "#e06c75"
    },
    {
      id: "evt-5",
      date: fri,
      start_time: "11:00",
      end_time: "12:00",
      title: "1:1 with Manager",
      color: "#4a90d9"
    }
  ];

  var allDayEvents = [
    {
      id: "evt-ad-1",
      date: wed,
      title: "Company Offsite",
      color: "#e06c75"
    }
  ];

  // Full event objects (camelCase) for get_event lookups
  var eventDetails = {
    "evt-1": {
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
      descriptionPublic: ""
    },
    "evt-2": {
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
      descriptionPublic: ""
    },
    "evt-3": {
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
      descriptionPublic: ""
    },
    "evt-4": {
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
      descriptionPublic: ""
    },
    "evt-5": {
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
      descriptionPublic: ""
    },
    "evt-ad-1": {
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
      descriptionPublic: ""
    }
  };

  // ---------------------------------------------------------------------------
  // invoke() dispatcher
  // ---------------------------------------------------------------------------
  function invoke(command, payload) {
    switch (command) {
      case "list_calendars":
        return Promise.resolve(calendars);

      case "get_week_events":
        return Promise.resolve({ timed: timedEvents, all_day: allDayEvents });

      case "get_event":
        var evt = eventDetails[payload && payload.id];
        if (evt) return Promise.resolve(evt);
        return Promise.reject("Event not found: " + (payload && payload.id));

      case "create_calendar":
        return Promise.resolve({ id: "cal-new-" + Date.now() });

      case "delete_calendar":
        return Promise.resolve(null);

      case "toggle_visibility":
        return Promise.resolve(null);

      case "create_event":
        return Promise.resolve({ id: "evt-new-" + Date.now() });

      case "update_event":
        return Promise.resolve(null);

      case "delete_event":
        return Promise.resolve(null);

      case "get_export_event_count":
        return Promise.resolve(6);

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

  // ---------------------------------------------------------------------------
  // Install global
  // ---------------------------------------------------------------------------
  window.__TAURI__ = {
    core: { invoke: invoke }
  };
})();
