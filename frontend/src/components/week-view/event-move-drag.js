import { createEventMoveDragSession } from "./event-move-drag-session.js";

export function createEventMovePointerDownHandler(column, pixelsPerHour, handlers = {}) {
  const {
    onEventMove = async () => {},
    onEventResize = async () => {}
  } = handlers;

  return createEventMoveDragSession({
    column,
    pixelsPerHour,
    onEventMove,
    onEventResize
  });
}
