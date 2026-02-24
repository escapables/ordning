const state = {
  calendars: [],
  events: [],
  allDayEvents: [],
  lang: "sv",
  currentWeekStart: null
};

const listeners = new Set();

function notify() {
  listeners.forEach((listener) => {
    listener(getState());
  });
}

export function getState() {
  return {
    calendars: [...state.calendars],
    events: [...state.events],
    allDayEvents: [...state.allDayEvents],
    lang: state.lang,
    currentWeekStart: state.currentWeekStart ? new Date(state.currentWeekStart) : null
  };
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCalendars(calendars) {
  state.calendars = calendars;
  notify();
}

export function setEvents(events) {
  state.events = events;
  notify();
}

export function setAllDayEvents(events) {
  state.allDayEvents = events;
  notify();
}

export function setCurrentWeekStart(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return;
  }

  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const nextValue = normalized.getTime();
  const currentValue = state.currentWeekStart?.getTime?.();

  if (currentValue === nextValue) {
    return;
  }

  state.currentWeekStart = normalized;
  notify();
}

async function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }

  return invokeFn(command, payload);
}

export async function loadCalendars() {
  try {
    const calendars = await invoke("list_calendars");
    setCalendars(calendars);
  } catch (error) {
    console.error("Failed to load calendars", error);
  }
}

export async function loadWeekEvents(startDate, endDate) {
  try {
    const payload = await invoke("get_week_events", {
      startDate,
      endDate
    });
    setEvents(payload?.timed ?? []);
    setAllDayEvents(payload?.all_day ?? []);
  } catch (error) {
    console.error("Failed to load week events", error);
  }
}
