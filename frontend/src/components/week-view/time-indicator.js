const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function formatDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function getZonedDateTime(timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  const minutes =
    Number(value("hour")) * MINUTES_PER_HOUR
    + Number(value("minute"))
    + Number(value("second")) / MINUTES_PER_HOUR;
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    minutes
  };
}

export function mountTimeIndicator(container, dates, pixelsPerHour, timezone = "UTC") {
  const line = document.createElement("div");
  line.className = "time-indicator";
  container.appendChild(line);

  let intervalId = 0;
  let timeoutId = 0;

  function update() {
    const zonedNow = getZonedDateTime(timezone);
    const todayIndex = dates.findIndex((date) => formatDateKey(date) === zonedNow.dateKey);
    if (todayIndex < 0) {
      line.style.display = "none";
      return;
    }

    const minutes = zonedNow.minutes;
    if (minutes < 0 || minutes > MINUTES_PER_DAY) {
      line.style.display = "none";
      return;
    }

    line.style.display = "block";
    line.style.top = `${(minutes / MINUTES_PER_HOUR) * pixelsPerHour}px`;
    line.style.left = `calc(var(--time-column-width) + (${todayIndex} * ((100% - var(--time-column-width)) / 7)))`;
    line.style.width = "calc((100% - var(--time-column-width)) / 7)";
  }

  update();

  const now = new Date();
  const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  timeoutId = window.setTimeout(() => {
    update();
    intervalId = window.setInterval(update, 60 * 1000);
  }, Math.max(delay, 0));

  return () => {
    window.clearTimeout(timeoutId);
    window.clearInterval(intervalId);
  };
}
