import { scrollWeekBodyToEventStart } from "../utils/week-view-events.js";

export function createEventHighlightHelpers({ weekContainer, getState }) {
  const clearEventSelection = ({ blurFocusedEvent = false } = {}) => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      (activeElement.classList.contains("event-block") || activeElement.classList.contains("all-day-event")) &&
      (blurFocusedEvent || activeElement.classList.contains("event-block--selected"))
    ) {
      activeElement.blur();
    }

    weekContainer.querySelectorAll(".event-block--selected").forEach((block) => {
      block.classList.remove("event-block--selected");
    });
  };

  const highlightEventBlock = ({ eventId, skipScroll = false } = {}) => {
    if (!eventId) {
      return false;
    }

    const block = weekContainer.querySelector(
      `.event-block[data-event-id="${eventId}"], .all-day-event[data-event-id="${eventId}"]`
    );
    if (!(block instanceof HTMLElement)) {
      return false;
    }

    const stateSnapshot = getState();
    const targetEvent = stateSnapshot.events.find((event) => event.id === eventId)
      ?? stateSnapshot.allDayEvents.find((event) => event.id === eventId);

    if (!skipScroll) {
      scrollWeekBodyToEventStart(weekContainer, targetEvent);
    }

    block.classList.remove("event-block--highlighted");
    // Force class re-apply when selecting the same event repeatedly.
    void block.offsetWidth;
    block.classList.add("event-block--highlighted");
    window.setTimeout(() => {
      block.classList.remove("event-block--highlighted");
    }, 1800);
    block.focus({ preventScroll: true });

    if (!skipScroll) {
      block.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
    }

    return true;
  };

  return { clearEventSelection, highlightEventBlock };
}
