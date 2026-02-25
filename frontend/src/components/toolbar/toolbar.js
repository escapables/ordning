import { getLocale, t } from "../../i18n/strings.js";
import { getEndOfWeek } from "../../utils/date-utils.js";

function getIsoWeekNumber(date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(
    firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7)
  );

  const millisPerWeek = 7 * 24 * 60 * 60 * 1000;
  return 1 + Math.round((target - firstThursday) / millisPerWeek);
}

function formatWeekRange(startDate, endDate) {
  const locale = getLocale();
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();

  if (sameMonth) {
    const startLabel = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric"
    }).format(startDate);
    const endLabel = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      year: "numeric"
    }).format(endDate);
    return `${startLabel} - ${endLabel}`;
  }

  if (sameYear) {
    const startLabel = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric"
    }).format(startDate);
    const endLabel = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(endDate);
    return `${startLabel} - ${endLabel}`;
  }

  const startLabel = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(startDate);
  const endLabel = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(endDate);
  return `${startLabel} - ${endLabel}`;
}

function formatToolbarTitle(weekStart) {
  const weekNumber = getIsoWeekNumber(weekStart);
  const weekEnd = getEndOfWeek(weekStart, 1);
  return `v${weekNumber} · ${formatWeekRange(weekStart, weekEnd)}`;
}

export function renderToolbar(options) {
  const {
    weekStart,
    onPreviousWeek = () => {},
    onNextWeek = () => {},
    onToday = () => {},
    onImport = () => {},
    onExport = () => {}
  } = options;

  const toolbar = document.createElement("header");
  toolbar.className = "main-toolbar";

  const nav = document.createElement("div");
  nav.className = "main-toolbar__nav";

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "main-toolbar__icon-btn";
  previousButton.setAttribute("aria-label", t("toolbarPreviousWeek"));
  previousButton.tabIndex = 1;
  previousButton.textContent = "‹";
  previousButton.addEventListener("click", onPreviousWeek);

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "main-toolbar__icon-btn";
  nextButton.setAttribute("aria-label", t("toolbarNextWeek"));
  nextButton.tabIndex = 1;
  nextButton.textContent = "›";
  nextButton.addEventListener("click", onNextWeek);

  const todayButton = document.createElement("button");
  todayButton.type = "button";
  todayButton.className = "main-toolbar__today-btn";
  todayButton.tabIndex = 1;
  todayButton.textContent = t("todayButton");
  todayButton.addEventListener("click", onToday);

  nav.append(previousButton, nextButton, todayButton);

  const title = document.createElement("h1");
  title.className = "main-toolbar__title";
  title.textContent = formatToolbarTitle(weekStart);

  const actions = document.createElement("div");
  actions.className = "main-toolbar__actions";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className = "main-toolbar__btn";
  exportButton.tabIndex = 1;
  exportButton.innerHTML = `<span aria-hidden="true">↑</span><span>${t("exportButton")}</span>`;
  exportButton.addEventListener("click", onExport);

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "main-toolbar__btn";
  importButton.tabIndex = 1;
  importButton.innerHTML = `<span aria-hidden="true">↓</span><span>${t("importButton")}</span>`;
  importButton.addEventListener("click", onImport);

  actions.append(exportButton, importButton);
  toolbar.append(nav, title, actions);
  return toolbar;
}
