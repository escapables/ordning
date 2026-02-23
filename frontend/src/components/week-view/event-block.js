const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MIN_EVENT_HEIGHT = 18;

function parseTimeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

function normalizeEvents(events) {
  return events
    .map((event) => {
      const startMinutes = parseTimeToMinutes(event.startTime);
      const endMinutes = parseTimeToMinutes(event.endTime);

      return {
        ...event,
        startMinutes,
        endMinutes: Math.max(endMinutes, startMinutes + 15)
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
}

function splitIntoOverlapGroups(events) {
  const groups = [];
  let group = [];
  let groupMaxEnd = 0;

  events.forEach((event) => {
    if (group.length === 0) {
      group = [event];
      groupMaxEnd = event.endMinutes;
      return;
    }

    if (event.startMinutes < groupMaxEnd) {
      group.push(event);
      groupMaxEnd = Math.max(groupMaxEnd, event.endMinutes);
      return;
    }

    groups.push(group);
    group = [event];
    groupMaxEnd = event.endMinutes;
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

    const usedColumns = new Set(active.map((entry) => entry.column));
    let column = 0;
    while (usedColumns.has(column)) {
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
  const groups = splitIntoOverlapGroups(normalized);

  groups.forEach(assignColumns);
  return normalized;
}

function createEventElement(event, pixelsPerMinute, onEventClick) {
  const element = document.createElement("article");
  element.className = "event-block";
  element.style.top = `${event.startMinutes * pixelsPerMinute}px`;

  const rawHeight = (event.endMinutes - event.startMinutes) * pixelsPerMinute;
  element.style.height = `${Math.max(rawHeight, MIN_EVENT_HEIGHT)}px`;

  const widthPercent = 100 / event.totalColumns;
  element.style.width = `calc(${widthPercent}% - 4px)`;
  element.style.left = `calc(${event.column * widthPercent}% + 2px)`;
  element.style.backgroundColor = event.color;
  element.style.borderColor = event.color;

  const title = document.createElement("div");
  title.className = "event-block__title";
  title.textContent = event.title;

  const time = document.createElement("div");
  time.className = "event-block__time";
  time.textContent = `${event.startTime} - ${event.endTime}`;

  element.appendChild(title);
  element.appendChild(time);
  element.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    onEventClick(event.id);
  });

  return element;
}

export function renderEventBlocks(events, pixelsPerHour, onEventClick = () => {}) {
  const layer = document.createElement("div");
  layer.className = "event-layer";

  const pixelsPerMinute = pixelsPerHour / MINUTES_PER_HOUR;
  const laidOutEvents = layoutEvents(events).filter(
    (event) => event.startMinutes < MINUTES_PER_DAY && event.endMinutes > 0
  );

  laidOutEvents.forEach((event) => {
    layer.appendChild(createEventElement(event, pixelsPerMinute, onEventClick));
  });

  return layer;
}
