import { getState } from "../state.js";
import { mapAllDayEvents, mapBackendEvents } from "../utils/week-view-events.js";
import { renderWeekGrid } from "../components/week-view/week-grid.js";

export function renderWeekSection(container, weekDates, options = {}) {
  const previous = container.querySelector(".week-view");
  if (previous) {
    previous.remove();
  }

  const mappedEvents = mapBackendEvents(getState().events);
  const mappedAllDayEvents = mapAllDayEvents(getState().allDayEvents);
  container.appendChild(renderWeekGrid(weekDates, mappedEvents, mappedAllDayEvents, {
    calendarsCount: getState().calendars.length,
    ...options
  }));
}
