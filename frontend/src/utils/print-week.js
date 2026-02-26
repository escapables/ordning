import { getLocale, t, tDayShort } from "../i18n/strings.js";
import { buildDayTimedSegments } from "./event-segments.js";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const SAFE_CONTENT_HEIGHT_MM = 268;
const PAGE_PADDING_MM = 6;
const PAGE_BOTTOM_SAFETY_MM = 2;
const TIME_GUTTER_MM = 12;
const HEADER_HEIGHT_MM = 14;
const DAY_HEADER_HEIGHT_MM = 8;
const ALL_DAY_ROW_HEIGHT_MM = 10;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const MIN_EVENT_DURATION = 15;

function formatDayNumber(date) {
  return new Intl.DateTimeFormat(getLocale(), {
    day: "numeric",
    month: "numeric"
  }).format(date);
}

function formatDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseMinutes(timeValue) {
  const [hours, minutes] = String(timeValue ?? "00:00").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return Math.max(0, Math.min(MINUTES_PER_DAY, hours * MINUTES_PER_HOUR + minutes));
}

function normalizeEvents(events) {
  return events
    .map((event) => {
      const startMinutes = parseMinutes(event.startTime);
      const endMinutes = Math.max(startMinutes + MIN_EVENT_DURATION, parseMinutes(event.endTime));
      const computedStart = Number.isFinite(event.startMinutes) ? event.startMinutes : startMinutes;
      const computedEnd = Number.isFinite(event.endMinutes) ? event.endMinutes : endMinutes;
      return {
        ...event,
        startMinutes: computedStart,
        endMinutes: Math.max(computedEnd, computedStart + MIN_EVENT_DURATION)
      };
    })
    .sort((left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes);
}

function splitGroups(events) {
  const groups = [];
  let group = [];
  let maxEnd = 0;
  events.forEach((event) => {
    if (group.length === 0) {
      group = [event];
      maxEnd = event.endMinutes;
      return;
    }
    if (event.startMinutes < maxEnd) {
      group.push(event);
      maxEnd = Math.max(maxEnd, event.endMinutes);
      return;
    }
    groups.push(group);
    group = [event];
    maxEnd = event.endMinutes;
  });
  if (group.length > 0) {
    groups.push(group);
  }
  return groups;
}

function assignColumns(group) {
  const active = [];
  let maxColumns = 1;
  group.forEach((event) => {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].endMinutes <= event.startMinutes) {
        active.splice(index, 1);
      }
    }
    const used = new Set(active.map((entry) => entry.column));
    let column = 0;
    while (used.has(column)) {
      column += 1;
    }
    event.column = column;
    active.push({ endMinutes: event.endMinutes, column });
    maxColumns = Math.max(maxColumns, column + 1);
  });
  group.forEach((event) => {
    event.totalColumns = maxColumns;
  });
}

function layoutEvents(events) {
  const normalized = normalizeEvents(events);
  splitGroups(normalized).forEach(assignColumns);
  return normalized;
}

function buildDocumentTitle(weekDates) {
  const start = weekDates[0];
  const end = weekDates[weekDates.length - 1];
  const formatter = new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric"
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function printWeek({ weekDates = [], events = [], allDayEvents = [] } = {}) {
  if (weekDates.length !== 7) {
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;
  if (!printWindow) {
    iframe.remove();
    return;
  }

  const printDocument = printWindow.document;
  const gridWidth = PAGE_WIDTH_MM - PAGE_PADDING_MM * 2;
  const contentLeft = PAGE_PADDING_MM;
  const contentTop = PAGE_PADDING_MM;
  const calendarLeft = contentLeft + TIME_GUTTER_MM;
  const calendarWidth = gridWidth - TIME_GUTTER_MM;
  const dayColumnWidth = calendarWidth / 7;
  const timedGridTop = contentTop + HEADER_HEIGHT_MM + DAY_HEADER_HEIGHT_MM + ALL_DAY_ROW_HEIGHT_MM;
  const timedGridHeight = SAFE_CONTENT_HEIGHT_MM - timedGridTop - PAGE_PADDING_MM - PAGE_BOTTOM_SAFETY_MM;
  const pixelsPerHour = timedGridHeight / HOURS_PER_DAY;

  const eventsByDate = buildDayTimedSegments(weekDates, events);
  const allDayByDate = new Map(weekDates.map((date) => [formatDateKey(date), []]));
  allDayEvents.forEach((event) => {
    const dayEvents = allDayByDate.get(event.date);
    if (dayEvents) {
      dayEvents.push(event);
    }
  });

  printDocument.open();
  printDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>${t("appName")}</title></head><body></body></html>`);
  printDocument.close();

  const style = printDocument.createElement("style");
  style.textContent = `
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: "Segoe UI", sans-serif; }
  `;
  printDocument.head.appendChild(style);

  const page = printDocument.createElement("div");
  page.style.width = `${PAGE_WIDTH_MM}mm`;
  page.style.height = `${SAFE_CONTENT_HEIGHT_MM}mm`;
  page.style.boxSizing = "border-box";
  page.style.position = "relative";
  page.style.overflow = "hidden";
  page.style.pageBreakInside = "avoid";
  page.style.breakInside = "avoid";

  const title = printDocument.createElement("h1");
  title.textContent = `${t("appName")} · ${buildDocumentTitle(weekDates)}`;
  title.style.position = "absolute";
  title.style.left = `${contentLeft}mm`;
  title.style.top = `${contentTop}mm`;
  title.style.width = `${gridWidth}mm`;
  title.style.margin = "0";
  title.style.height = `${HEADER_HEIGHT_MM}mm`;
  title.style.fontSize = "16pt";
  title.style.lineHeight = `${HEADER_HEIGHT_MM}mm`;
  page.appendChild(title);

  weekDates.forEach((date, index) => {
    const left = calendarLeft + dayColumnWidth * index;
    const dayHeader = printDocument.createElement("div");
    dayHeader.textContent = `${tDayShort(date.getDay())} ${formatDayNumber(date)}`;
    dayHeader.style.position = "absolute";
    dayHeader.style.left = `${left}mm`;
    dayHeader.style.top = `${contentTop + HEADER_HEIGHT_MM}mm`;
    dayHeader.style.width = `${dayColumnWidth}mm`;
    dayHeader.style.height = `${DAY_HEADER_HEIGHT_MM}mm`;
    dayHeader.style.fontSize = "9pt";
    dayHeader.style.fontWeight = "700";
    dayHeader.style.display = "flex";
    dayHeader.style.alignItems = "center";
    dayHeader.style.justifyContent = "center";
    dayHeader.style.border = "1px solid #000";
    dayHeader.style.borderRightWidth = index === 6 ? "1px" : "0";
    page.appendChild(dayHeader);

    const allDayCell = printDocument.createElement("div");
    allDayCell.style.position = "absolute";
    allDayCell.style.left = `${left}mm`;
    allDayCell.style.top = `${contentTop + HEADER_HEIGHT_MM + DAY_HEADER_HEIGHT_MM}mm`;
    allDayCell.style.width = `${dayColumnWidth}mm`;
    allDayCell.style.height = `${ALL_DAY_ROW_HEIGHT_MM}mm`;
    allDayCell.style.border = "1px solid #000";
    allDayCell.style.borderTopWidth = "0";
    allDayCell.style.borderRightWidth = index === 6 ? "1px" : "0";
    allDayCell.style.fontSize = "7pt";
    allDayCell.style.padding = "1.2mm";
    allDayCell.style.boxSizing = "border-box";
    allDayCell.style.overflow = "hidden";
      allDayCell.textContent = (allDayByDate.get(formatDateKey(date)) ?? [])
      .map((event) => event.title)
      .join(", ");
    page.appendChild(allDayCell);

    const dayCell = printDocument.createElement("div");
    dayCell.style.position = "absolute";
    dayCell.style.left = `${left}mm`;
    dayCell.style.top = `${timedGridTop}mm`;
    dayCell.style.width = `${dayColumnWidth}mm`;
    dayCell.style.height = `${timedGridHeight}mm`;
    dayCell.style.border = "1px solid #000";
    dayCell.style.borderTopWidth = "0";
    dayCell.style.borderRightWidth = index === 6 ? "1px" : "0";
    dayCell.style.boxSizing = "border-box";
    dayCell.style.overflow = "hidden";
    page.appendChild(dayCell);

    const dayEvents = layoutEvents(eventsByDate.get(formatDateKey(date)) ?? []);
    dayEvents.forEach((event) => {
      const eventNode = printDocument.createElement("div");
      const eventColor = event.color ?? "#4a90d9";
      const top = (event.startMinutes / MINUTES_PER_HOUR) * pixelsPerHour;
      const height = Math.max(3, ((event.endMinutes - event.startMinutes) / MINUTES_PER_HOUR) * pixelsPerHour);
      const widthPercent = 100 / (event.totalColumns || 1);
      const leftPercent = (event.column || 0) * widthPercent;
      eventNode.style.position = "absolute";
      eventNode.style.left = `${leftPercent}%`;
      eventNode.style.width = `${widthPercent}%`;
      eventNode.style.top = `${top}mm`;
      eventNode.style.height = `${height}mm`;
      eventNode.style.boxSizing = "border-box";
      eventNode.style.background = `color-mix(in srgb, ${eventColor} 15%, #fff)`;
      eventNode.style.border = `1px solid color-mix(in srgb, ${eventColor} 25%, transparent)`;
      eventNode.style.borderLeft = `1px solid ${eventColor}`;
      eventNode.style.color = `color-mix(in srgb, ${eventColor} 90%, #1c1c1e)`;
      eventNode.style.fontSize = "6.5pt";
      eventNode.style.padding = "1mm";
      eventNode.style.overflow = "hidden";
      eventNode.style.lineHeight = "1.1";
      const displayStart = event.displayStartTime ?? event.startTime;
      const displayEnd = event.displayEndTime ?? event.endTime;
      eventNode.textContent = `${event.title} ${displayStart}-${displayEnd}`;
      dayCell.appendChild(eventNode);
    });
  });

  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    const y = timedGridTop + hour * pixelsPerHour;
    const row = printDocument.createElement("div");
    row.style.position = "absolute";
    row.style.left = `${calendarLeft}mm`;
    row.style.top = `${y}mm`;
    row.style.width = `${calendarWidth}mm`;
    row.style.borderTop = "1px solid rgba(0, 0, 0, 0.15)";
    page.appendChild(row);

    const hourLabel = printDocument.createElement("div");
    hourLabel.textContent = `${String(hour).padStart(2, "0")}:00`;
    hourLabel.style.position = "absolute";
    hourLabel.style.left = `${contentLeft}mm`;
    hourLabel.style.top = `${Math.max(timedGridTop, y - 2.2)}mm`;
    hourLabel.style.width = `${TIME_GUTTER_MM - 1}mm`;
    hourLabel.style.height = "4.4mm";
    hourLabel.style.fontSize = "6.5pt";
    hourLabel.style.lineHeight = "4.4mm";
    hourLabel.style.textAlign = "right";
    hourLabel.style.paddingRight = "0.8mm";
    hourLabel.style.color = "#555";
    page.appendChild(hourLabel);
  }

  const gutterSeparator = printDocument.createElement("div");
  gutterSeparator.style.position = "absolute";
  gutterSeparator.style.left = `${calendarLeft}mm`;
  gutterSeparator.style.top = `${timedGridTop}mm`;
  gutterSeparator.style.width = "0";
  gutterSeparator.style.height = `${timedGridHeight}mm`;
  gutterSeparator.style.borderLeft = "1px solid rgba(0, 0, 0, 0.28)";
  page.appendChild(gutterSeparator);

  printDocument.body.appendChild(page);

  const cleanup = () => {
    iframe.remove();
  };

  printWindow.addEventListener("afterprint", cleanup, { once: true });
  const mockedPrint = window.print;
  if (typeof mockedPrint === "function") {
    try {
      printWindow.print = mockedPrint;
    } catch (_error) {
      // Ignore assignment failure in browsers that lock print.
    }
  }
  printWindow.focus();
  printWindow.print();
  window.setTimeout(cleanup, 500);
}
