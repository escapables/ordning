const STRINGS = {
  sv: {
    appName: "Ordning",
    sidebarTitle: "Kalendrar",
    sidebarPlaceholder: "Platshållare för sidopanel",
    weekOfPrefix: "Vecka",
    daysShort: ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"]
  },
  en: {
    appName: "Ordning",
    sidebarTitle: "Calendars",
    sidebarPlaceholder: "Sidebar placeholder",
    weekOfPrefix: "Week of",
    daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
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
