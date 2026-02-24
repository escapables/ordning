const STRINGS = {
  sv: {
    appName: "Ordning",
    sidebarTitle: "Kalendrar",
    sidebarPlaceholder: "Inga kalendrar ännu",
    newEventButton: "Nytt event",
    exportButton: "Exportera",
    importButton: "Importera",
    todayButton: "Idag",
    toolbarPreviousWeek: "Föregående vecka",
    toolbarNextWeek: "Nästa vecka",
    calendarGroupUngrouped: "Mina kalendrar",
    calendarCreatePlaceholder: "Nytt kalendernamn",
    calendarCreateButton: "Lägg till kalender",
    calendarDeleteButton: "Ta bort",
    calendarDeleteConfirm: "Ta bort kalendern och alla dess event?",
    calendarDeleteError: "Kalendern kunde inte tas bort.",
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
    eventFormPrivateDescriptionTooltip: "Privat — exkluderas från publika exporter",
    eventFormPublicDescription: "Publik beskrivning",
    eventFormDelete: "Ta bort",
    eventFormCancel: "Avbryt",
    eventFormSave: "Spara",
    eventFormDeleteConfirm: "Ta bort det här eventet?",
    exportDialogTitle: "Exportera kalender",
    exportModeLabel: "Exportläge",
    exportModeFull: "Full export",
    exportModePublic: "Publik export",
    exportCalendarsLabel: "Kalendrar",
    exportPreviewCount: "{count} event kommer exporteras.",
    exportPreviewNone: "Välj minst en kalender.",
    exportCalendarRequired: "Välj minst en kalender.",
    exportCancel: "Avbryt",
    exportConfirm: "Exportera",
    exportSuccessMessage: "Export klar: {path}",
    importDialogTitle: "Importera kalender",
    importStrategyLabel: "Importstrategi",
    importStrategyMerge: "Slå ihop",
    importStrategyReplace: "Ersätt allt",
    importPickFile: "Välj fil",
    importNoFileSelected: "Ingen fil vald.",
    importSummaryCalendars: "Kalendrar i fil: {count}",
    importSummaryEvents: "Event i fil: {count}",
    importSummaryNew: "Nya event: {count}",
    importSummaryUpdated: "Uppdaterade event: {count}",
    importSummaryConflicts: "Konflikter: {count}",
    importCancel: "Avbryt",
    importConfirm: "Importera",
    importSuccessMessage:
      "Import klar. Nya: {new}, uppdaterade: {updated}, konflikter: {conflicts}"
  },
  en: {
    appName: "Ordning",
    sidebarTitle: "Calendars",
    sidebarPlaceholder: "No calendars yet",
    newEventButton: "New event",
    exportButton: "Export",
    importButton: "Import",
    todayButton: "Today",
    toolbarPreviousWeek: "Previous week",
    toolbarNextWeek: "Next week",
    calendarGroupUngrouped: "My calendars",
    calendarCreatePlaceholder: "New calendar name",
    calendarCreateButton: "Add calendar",
    calendarDeleteButton: "Delete",
    calendarDeleteConfirm: "Delete this calendar and all its events?",
    calendarDeleteError: "Failed to delete calendar.",
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
    eventFormPrivateDescriptionTooltip: "Private — excluded from public exports",
    eventFormPublicDescription: "Public description",
    eventFormDelete: "Delete",
    eventFormCancel: "Cancel",
    eventFormSave: "Save",
    eventFormDeleteConfirm: "Delete this event?",
    exportDialogTitle: "Export Calendar",
    exportModeLabel: "Export mode",
    exportModeFull: "Full export",
    exportModePublic: "Public export",
    exportCalendarsLabel: "Calendars",
    exportPreviewCount: "{count} events will be exported.",
    exportPreviewNone: "Select at least one calendar.",
    exportCalendarRequired: "Select at least one calendar.",
    exportCancel: "Cancel",
    exportConfirm: "Export",
    exportSuccessMessage: "Export complete: {path}",
    importDialogTitle: "Import Calendar",
    importStrategyLabel: "Import strategy",
    importStrategyMerge: "Merge",
    importStrategyReplace: "Replace all",
    importPickFile: "Choose file",
    importNoFileSelected: "No file selected.",
    importSummaryCalendars: "Calendars in file: {count}",
    importSummaryEvents: "Events in file: {count}",
    importSummaryNew: "New events: {count}",
    importSummaryUpdated: "Updated events: {count}",
    importSummaryConflicts: "Conflicts: {count}",
    importCancel: "Cancel",
    importConfirm: "Import",
    importSuccessMessage:
      "Import complete. New: {new}, updated: {updated}, conflicts: {conflicts}"
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
