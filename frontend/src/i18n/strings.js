const STRINGS = {
  sv: {
    appName: "Ordning",
    sidebarTitle: "Kalendrar",
    sidebarPlaceholder: "Platshållare för sidopanel",
    newEventButton: "Nytt event",
    weekOfPrefix: "Vecka",
    daysShort: ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"],
    eventFormCreateHeading: "Nytt event",
    eventFormEditHeading: "Redigera event",
    eventFormTitle: "Titel",
    eventFormCalendar: "Kalender",
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
    sidebarPlaceholder: "Sidebar placeholder",
    newEventButton: "New event",
    weekOfPrefix: "Week of",
    daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    eventFormCreateHeading: "New event",
    eventFormEditHeading: "Edit event",
    eventFormTitle: "Title",
    eventFormCalendar: "Calendar",
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
