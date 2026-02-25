import { getLocale, t, tDayShort } from "../../i18n/strings.js";
import { getStartOfWeek } from "../../utils/date-utils.js";

function monthLabel(date) {
  return new Intl.DateTimeFormat(getLocale(), {
    month: "long",
    year: "numeric"
  }).format(date);
}

function getMonthDays(displayedMonth) {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const start = getStartOfWeek(firstOfMonth, 1);

  const cells = [];
  const cursor = new Date(start);
  while (cells.length < 42) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    cells,
    monthStart: firstOfMonth,
    monthEnd: lastOfMonth
  };
}

function isSameDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function isSameWeek(left, right) {
  const leftWeek = getStartOfWeek(left, 1);
  const rightWeek = getStartOfWeek(right, 1);
  return isSameDate(leftWeek, rightWeek);
}

export function renderMiniMonth(options = {}) {
  const {
    currentWeekStart = getStartOfWeek(new Date(), 1),
    onSelectDay = () => {}
  } = options;

  const root = document.createElement("section");
  root.className = "mini-month";

  let displayedMonth = new Date(currentWeekStart);
  displayedMonth.setDate(1);

  function render() {
    root.innerHTML = "";

    const header = document.createElement("div");
    header.className = "mini-month__header";

    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "mini-month__nav";
    previous.textContent = "‹";
    previous.tabIndex = 2;
    previous.setAttribute("aria-label", t("miniMonthPrevious"));

    const title = document.createElement("div");
    title.className = "mini-month__title";
    title.textContent = monthLabel(displayedMonth);

    const next = document.createElement("button");
    next.type = "button";
    next.className = "mini-month__nav";
    next.textContent = "›";
    next.tabIndex = 2;
    next.setAttribute("aria-label", t("miniMonthNext"));

    previous.addEventListener("click", () => {
      displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
      render();
    });
    next.addEventListener("click", () => {
      displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
      render();
    });

    header.append(previous, title, next);

    const daysHeader = document.createElement("div");
    daysHeader.className = "mini-month__weekdays";
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      const weekdayCell = document.createElement("span");
      weekdayCell.className = "mini-month__weekday";
      weekdayCell.textContent = tDayShort(weekday % 7);
      daysHeader.appendChild(weekdayCell);
    }

    const grid = document.createElement("div");
    grid.className = "mini-month__grid";

    const today = new Date();
    const { cells, monthStart } = getMonthDays(displayedMonth);
    cells.forEach((cellDate) => {
      const day = document.createElement("button");
      day.type = "button";
      day.className = "mini-month__day";
      day.tabIndex = 2;
      day.textContent = String(cellDate.getDate());

      if (cellDate.getMonth() !== monthStart.getMonth()) {
        day.classList.add("mini-month__day--outside");
      }

      if (isSameDate(cellDate, today)) {
        day.classList.add("mini-month__day--today");
      }

      if (isSameWeek(cellDate, currentWeekStart)) {
        day.classList.add("mini-month__day--current-week");
      }

      day.addEventListener("click", () => {
        void onSelectDay(cellDate);
      });

      grid.appendChild(day);
    });

    root.append(header, daysHeader, grid);
  }

  render();
  return root;
}
