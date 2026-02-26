import { getLocale, t } from "../../i18n/strings.js";
import { createEventSearch } from "../search/search.js";
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
    const endLabel = `${endDate.getDate()}, ${endDate.getFullYear()}`;
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
    onPrint = () => {},
    onSearch = async () => [],
    onSearchSelect = () => {}
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

  const printButton = document.createElement("button");
  printButton.type = "button";
  printButton.className = "main-toolbar__today-btn main-toolbar__print-btn";
  printButton.tabIndex = 1;
  printButton.textContent = t("printButton");
  printButton.addEventListener("click", onPrint);

  nav.append(previousButton, nextButton, todayButton, printButton);

  const title = document.createElement("h1");
  title.className = "main-toolbar__title";
  title.textContent = formatToolbarTitle(weekStart);

  const search = document.createElement("div");
  search.className = "main-toolbar__search";
  search.appendChild(
    createEventSearch({
      onSearch,
      onSelect: onSearchSelect
    })
  );

  toolbar.append(nav, title, search);
  return toolbar;
}
