import {
  applyAnchorOffset,
  resolveCopyAnchorOffset,
  resolveSlotFromPoint
} from "./event-copy-paste-geometry.js";
import {
  canPasteCopiedEvent,
  getSelectedTimedEvent,
  pasteCopiedEventAtPrefill,
  pasteCopiedEventAtResolvedSlot,
  prepareCopiedTimedEvent,
  readEventData
} from "./event-copy-paste-actions.js";
import {
  clearPreviewElements,
  renderPastePreview
} from "./event-copy-paste-preview.js";

export function createEventCopyPasteController(options = {}) {
  const {
    weekContainer,
    invoke,
    refresh = async () => {},
    t,
    clearEventSelection = () => {}
  } = options;

  const state = {
    active: false,
    sourceEvent: null,
    anchorOffsetMinutes: 0,
    eventColor: "#007aff",
    previews: [],
    lastPointer: null,
    lastSlot: null,
    lastResolvedSlot: null,
    pasteInFlight: false
  };

  function clearPreview() {
    state.previews = clearPreviewElements(state.previews);
  }

  function clear() {
    clearPreview();
    state.active = false;
    state.sourceEvent = null;
    state.anchorOffsetMinutes = 0;
    state.lastSlot = null;
    state.lastResolvedSlot = null;
  }

  function renderPreview(slot) {
    clearPreview();
    state.lastSlot = slot;

    const { previews, resolvedSlot } = renderPastePreview({
      weekContainer,
      sourceEvent: state.active ? state.sourceEvent : null,
      slot,
      anchorOffsetMinutes: state.anchorOffsetMinutes,
      eventColor: state.eventColor
    });

    state.lastResolvedSlot = resolvedSlot;
    state.previews = previews;
    return previews.length > 0;
  }

  function updatePreview(clientX, clientY) {
    state.lastPointer = { clientX, clientY };
    if (!state.active) {
      return false;
    }

    return renderPreview(resolveSlotFromPoint(weekContainer, clientX, clientY));
  }

  async function copyEvent(eventData, sourceElement = null) {
    try {
      const prepared = await prepareCopiedTimedEvent({
        eventData,
        sourceElement,
        invoke,
        t,
        weekContainer
      });
      if (!prepared) {
        clear();
        return false;
      }

      state.active = true;
      state.sourceEvent = prepared.sourceEvent;
      state.anchorOffsetMinutes = prepared.anchorOffsetMinutes;
      state.eventColor = prepared.eventColor;

      if (state.lastPointer) {
        updatePreview(state.lastPointer.clientX, state.lastPointer.clientY);
      } else {
        clearPreview();
      }

      return true;
    } catch (error) {
      clear();
      window.alert(String(error));
      console.error("Failed to copy event for paste mode", error);
      return false;
    }
  }

  async function pasteAtSlot(slot) {
    const resolvedSlot = applyAnchorOffset(slot, state.anchorOffsetMinutes);
    if (!state.active || !resolvedSlot || state.pasteInFlight) {
      return false;
    }

    state.pasteInFlight = true;
    const sourceEvent = state.sourceEvent;
    clear();

    try {
      const pasted = await pasteCopiedEventAtResolvedSlot({
        invoke,
        refresh,
        resolvedSlot
      });
      if (!pasted && sourceEvent) {
        state.active = true;
        state.sourceEvent = sourceEvent;
        state.anchorOffsetMinutes = resolveCopyAnchorOffset(sourceEvent);
        renderPreview(slot);
      }
      return pasted;
    } catch (error) {
      if (sourceEvent) {
        state.active = true;
        state.sourceEvent = sourceEvent;
        state.anchorOffsetMinutes = resolveCopyAnchorOffset(sourceEvent);
        renderPreview(slot);
      }
      window.alert(String(error));
      console.error("Failed to paste copied event", error);
      return false;
    } finally {
      state.pasteInFlight = false;
    }
  }

  async function copySelectedEvent() {
    const eventElement = getSelectedTimedEvent(weekContainer);
    if (!(eventElement instanceof HTMLElement)) {
      return false;
    }
    return copyEvent(readEventData(eventElement), eventElement);
  }

  async function pasteAtCurrentPointer() {
    if (!state.lastSlot) {
      return false;
    }
    return pasteAtSlot(state.lastSlot);
  }

  function pasteAtPrefill(prefill = {}) {
    if (!prefill?.date || !prefill?.startTime) {
      return false;
    }
    clear();
    return pasteCopiedEventAtPrefill({ invoke, refresh, prefill });
  }

  function handlePointerMove(pointerEvent) {
    if (state.pasteInFlight) {
      return;
    }

    state.lastPointer = {
      clientX: pointerEvent.clientX,
      clientY: pointerEvent.clientY
    };

    if (state.active) {
      renderPreview(resolveSlotFromPoint(weekContainer, pointerEvent.clientX, pointerEvent.clientY));
    }
  }

  function handlePointerLeave() {
    state.lastPointer = null;
    state.lastSlot = null;
    state.lastResolvedSlot = null;
    if (state.active) {
      clearPreview();
    }
  }

  function handleClick(clickEvent) {
    const target = clickEvent.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (state.active && !target.closest(".event-block") && !target.closest(".all-day-event")) {
      const slot = resolveSlotFromPoint(weekContainer, clickEvent.clientX, clickEvent.clientY);
      if (slot) {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        void pasteAtSlot(slot);
        return;
      }
    }

    if (target.closest(".event-block") || target.closest(".all-day-event")) {
      return;
    }

    if (target.closest(".day-column") || target.closest(".all-day-bar__day")) {
      clearEventSelection();
    }
  }

  weekContainer.addEventListener("pointermove", handlePointerMove);
  weekContainer.addEventListener("pointerleave", handlePointerLeave);
  weekContainer.addEventListener("click", handleClick, true);

  return {
    canPaste: () => canPasteCopiedEvent(),
    clear,
    copyEvent,
    copySelectedEvent,
    pasteAtCurrentPointer,
    pasteAtPrefill,
    dispose() {
      clear();
      weekContainer.removeEventListener("pointermove", handlePointerMove);
      weekContainer.removeEventListener("pointerleave", handlePointerLeave);
      weekContainer.removeEventListener("click", handleClick, true);
    }
  };
}
