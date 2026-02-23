import { invoke } from "@tauri-apps/api/core";

const state = {
  calendars: [],
  events: [],
  lang: "sv"
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
    lang: state.lang
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
    const events = await invoke("get_week_events", {
      startDate,
      endDate
    });
    setEvents(events);
  } catch (error) {
    console.error("Failed to load week events", error);
  }
}
