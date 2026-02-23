const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function isSameDate(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

function getMinutesSinceMidnight(now) {
  return now.getHours() * MINUTES_PER_HOUR + now.getMinutes() + now.getSeconds() / MINUTES_PER_HOUR;
}

export function mountTimeIndicator(container, dates, pixelsPerHour) {
  const line = document.createElement("div");
  line.className = "time-indicator";
  container.appendChild(line);

  let intervalId = 0;
  let timeoutId = 0;

  function update() {
    const todayIndex = dates.findIndex((date) => isSameDate(date, new Date()));
    if (todayIndex < 0) {
      line.style.display = "none";
      return;
    }

    const now = new Date();
    const minutes = getMinutesSinceMidnight(now);
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
