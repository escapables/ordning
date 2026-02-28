// Shared seed data for the Playwright Tauri mock.
(function () {
  "use strict";

  window.__createOrdningTauriMockState = function (dates) {
    var ts = dates.ts;

    return {
      settings: {
        lang: "sv",
        timezone: "Europe/Stockholm"
      },
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
          color: "#14b8a6",
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
          startDate: dates.mon,
          endDate: dates.mon,
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
          startDate: dates.tue,
          endDate: dates.tue,
          startTime: "14:00",
          endTime: "15:00",
          allDay: false,
          location: "Room 4B",
          descriptionPrivate: "",
          descriptionPublic: "",
          updated_at: ts
        },
        {
          id: "evt-design-template",
          calendarId: "cal-personal",
          title: "Design Workshop",
          startDate: dates.fri,
          endDate: dates.fri,
          startTime: "13:15",
          endTime: "15:00",
          allDay: false,
          location: "Studio",
          descriptionPrivate: "Bring sketches",
          descriptionPublic: "Review mockups",
          updated_at: ts
        },
        {
          id: "evt-design-template-2",
          calendarId: "cal-personal",
          title: "Design Workshop",
          startDate: dates.fri,
          endDate: dates.fri,
          startTime: "15:30",
          endTime: "16:15",
          allDay: false,
          location: "Studio",
          descriptionPrivate: "Bring sketches",
          descriptionPublic: "Review mockups",
          updated_at: ts
        },
        {
          id: "evt-design-pairing",
          calendarId: "cal-work",
          title: "Design Pairing",
          startDate: dates.wed,
          endDate: dates.wed,
          startTime: "10:30",
          endTime: "11:00",
          allDay: false,
          location: "",
          descriptionPrivate: "",
          descriptionPublic: "Pair on components",
          updated_at: ts
        },
        {
          id: "evt-night",
          calendarId: "cal-work",
          title: "Night Deploy",
          startDate: dates.mon,
          endDate: dates.mon,
          startTime: "22:00",
          endTime: "02:00",
          allDay: false,
          location: "",
          descriptionPrivate: "",
          descriptionPublic: "",
          updated_at: ts
        },
        {
          id: "evt-6",
          calendarId: "cal-personal",
          title: "Parallel Sync",
          startDate: dates.mon,
          endDate: dates.mon,
          startTime: "09:15",
          endTime: "10:00",
          allDay: false,
          location: "",
          descriptionPrivate: "",
          descriptionPublic: "",
          updated_at: ts
        },
        {
          id: "evt-7",
          calendarId: "cal-work",
          title: "Ops Check-in",
          startDate: dates.mon,
          endDate: dates.mon,
          startTime: "09:30",
          endTime: "10:15",
          allDay: false,
          location: "",
          descriptionPrivate: "",
          descriptionPublic: "",
          updated_at: ts
        },
        {
          id: "evt-3",
          calendarId: "cal-work",
          title: "Team Standup",
          startDate: dates.today,
          endDate: dates.today,
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
          startDate: dates.today,
          endDate: dates.today,
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
          startDate: dates.fri,
          endDate: dates.fri,
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
          startDate: dates.wed,
          endDate: dates.wed,
          startTime: null,
          endTime: null,
          allDay: true,
          location: "",
          descriptionPrivate: "",
          descriptionPublic: "",
          updated_at: ts
        },
        {
          id: "evt-past-1",
          calendarId: "cal-work",
          title: "Archived Planning",
          startDate: dates.past,
          endDate: dates.past,
          startTime: "08:00",
          endTime: "09:00",
          allDay: false,
          location: "",
          descriptionPrivate: "",
          descriptionPublic: "",
          updated_at: ts
        }
      ]
    };
  };
})();
