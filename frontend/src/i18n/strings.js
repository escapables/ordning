const STRINGS = {
  sv: {
    appName: "Ordning",
    sidebarTitle: "Kalendrar",
    sidebarPlaceholder: "Inga kalendrar ännu",
    newEventButton: "Nytt event",
    calendarGroupUngrouped: "Mina kalendrar",
    calendarCreatePlaceholder: "Nytt kalendernamn",
    calendarCreateButton: "Lägg till kalender",
    calendarDeleteButton: "Ta bort",
    calendarDeleteConfirm: "Ta bort kalendern och alla dess event?",
    calendarColorLabel: "Kalenderfärg",
    calendarVisibilityError: "Minst en kalender måste vara synlig.",
    weekOfPrefix: "Vecka",
    daysShort: ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"],
    eventFormCreateHeading: "Nytt event",
    eventFormEditHeading: "Redigera event",
    eventFormTitle: "Titel",
    eventFormCalendar: "Kalender",
    eventFormCalendarRequired: "Välj en kalender.",
    eventFormNoCalendars: "Skapa en kalender först.",
    eventFormStartDate: "Startdatum",
    eventFormEndDate: "Slutdatum",
    eventFormStartTime: "Starttid",
    eventFormEndTime: "Sluttid",
    eventFormAllDay: "Heldag",
    eventFormLocation: "Plats",
    eventFormPrivateDescription: "Privat beskrivning",
    eventFormPublicDescription: "Publik beskrivning",
    eventFormDelete: "Ta bort",
    eventFormCancel: "Avbryt",
    eventFormSave: "Spara",
    eventFormDeleteConfirm: "Ta bort det här eventet?"
  },
  en: {
    appName: "Ordning",
    sidebarTitle: "Calendars",
    sidebarPlaceholder: "No calendars yet",
    newEventButton: "New event",
    calendarGroupUngrouped: "My calendars",
    calendarCreatePlaceholder: "New calendar name",
    calendarCreateButton: "Add calendar",
    calendarDeleteButton: "Delete",
    calendarDeleteConfirm: "Delete this calendar and all its events?",
    calendarColorLabel: "Calendar color",
    calendarVisibilityError: "At least one calendar must remain visible.",
    weekOfPrefix: "Week of",
    daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    eventFormCreateHeading: "New event",
    eventFormEditHeading: "Edit event",
    eventFormTitle: "Title",
    eventFormCalendar: "Calendar",
    eventFormCalendarRequired: "Select a calendar.",
    eventFormNoCalendars: "Create a calendar first.",
    eventFormStartDate: "Start date",
    eventFormEndDate: "End date",
    eventFormStartTime: "Start time",
    eventFormEndTime: "End time",
    eventFormAllDay: "All day",
    eventFormLocation: "Location",
    eventFormPrivateDescription: "Private description",
    eventFormPublicDescription: "Public description",
    eventFormDelete: "Delete",
    eventFormCancel: "Cancel",
    eventFormSave: "Save",
    eventFormDeleteConfirm: "Delete this event?"
  }
};

const LOCALES = {
  sv: "sv-SE",
  en: "en-US"
};

let currentLang = "sv";

export function setLang(lang) {
  if (STRINGS[lang]) {
    currentLang = lang;
  }
}

export function getLang() {
  return currentLang;
}

export function getLocale() {
  return LOCALES[currentLang] ?? LOCALES.sv;
}

export function t(key) {
  const value = STRINGS[currentLang]?.[key];
  if (value !== undefined) {
    return value;
  }

  const fallback = STRINGS.sv?.[key];
  return fallback !== undefined ? fallback : key;
}

export function tDayShort(dayIndex) {
  const days = STRINGS[currentLang]?.daysShort ?? STRINGS.sv.daysShort;
  return days[dayIndex] ?? "";
}
