export const DEFAULT_PIXELS_PER_HOUR = 42;
const MIN_PIXELS_PER_HOUR = 42;
const MAX_PIXELS_PER_HOUR = 168;

function resolveZoomStep(deltaY) {
  return deltaY < 0 ? 1.1 : (1 / 1.1);
}

function resolveCurrentScrollTop(body) {
  const requested = Number(body.dataset.requestedScrollTop);
  if (body.scrollTop <= 0 && Number.isFinite(requested) && requested > 0) {
    return requested;
  }
  return body.scrollTop;
}

function computeAnchoredScrollTop(body, clientY, currentPixelsPerHour, nextPixelsPerHour) {
  const rect = body.getBoundingClientRect();
  const rawOffset = Number.isFinite(clientY) ? clientY - rect.top : Number.NaN;
  const pointerOffset =
    Number.isFinite(rawOffset) && rawOffset >= 0 && rawOffset <= body.clientHeight
      ? rawOffset
      : body.clientHeight / 2;
  const scaledContentOffset = (resolveCurrentScrollTop(body) + pointerOffset)
    * (nextPixelsPerHour / currentPixelsPerHour);
  return Math.max(0, scaledContentOffset - pointerOffset);
}

export function clampPixelsPerHour(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_PIXELS_PER_HOUR;
  }
  return Math.max(MIN_PIXELS_PER_HOUR, Math.min(MAX_PIXELS_PER_HOUR, numeric));
}

export function attachWeekZoom(body, pixelsPerHour, onZoomChange = () => {}) {
  body.addEventListener("wheel", (wheelEvent) => {
    if (!wheelEvent.ctrlKey) {
      return;
    }
    wheelEvent.preventDefault();
    const nextPixelsPerHour = clampPixelsPerHour(
      Math.round(pixelsPerHour * resolveZoomStep(wheelEvent.deltaY))
    );
    if (nextPixelsPerHour === pixelsPerHour) {
      return;
    }
    const preserveScrollTop = computeAnchoredScrollTop(
      body,
      wheelEvent.clientY,
      pixelsPerHour,
      nextPixelsPerHour
    );
    body.dataset.requestedScrollTop = String(preserveScrollTop);
    onZoomChange({
      pixelsPerHour: nextPixelsPerHour,
      preserveScrollTop
    });
  }, { passive: false });
}

/**
 * Install global guards that prevent the WebView/browser from zooming the
 * entire page.  Returns a teardown function that removes all listeners.
 */
export function installZoomGuards() {
  const wheelGuard = (wheelEvent) => {
    if (!wheelEvent.ctrlKey) {
      return;
    }
    wheelEvent.preventDefault();
  };
  window.addEventListener("wheel", wheelGuard, { passive: false, capture: true });

  const gestureGuard = (gestureEvent) => {
    gestureEvent.preventDefault();
  };
  window.addEventListener("gesturestart", gestureGuard, { passive: false, capture: true });
  window.addEventListener("gesturechange", gestureGuard, { passive: false, capture: true });
  window.addEventListener("gestureend", gestureGuard, { passive: false, capture: true });

  return () => {
    window.removeEventListener("wheel", wheelGuard, { passive: false, capture: true });
    window.removeEventListener("gesturestart", gestureGuard, { passive: false, capture: true });
    window.removeEventListener("gesturechange", gestureGuard, { passive: false, capture: true });
    window.removeEventListener("gestureend", gestureGuard, { passive: false, capture: true });
  };
}

// GDK touchpad gesture phases (matches GdkTouchpadGesturePhase enum)
const GDK_PHASE_BEGIN = 0;
const GDK_PHASE_UPDATE = 1;

/**
 * Listen for __pinch custom events dispatched by the Rust backend when
 * WebKitGTK intercepts touchpad pinch gestures.  Translates the cumulative
 * gesture scale into calendar-grid zoom changes.
 * Returns a teardown function.
 */
export function installPinchZoom({ getBody, getPixelsPerHour, onZoomChange }) {
  let basePPH = null;

  const handler = (event) => {
    const { phase, scale, x, y } = event.detail;
    if (phase === GDK_PHASE_BEGIN) {
      basePPH = getPixelsPerHour();
      return;
    }
    if (phase !== GDK_PHASE_UPDATE || basePPH === null) {
      basePPH = null;
      return;
    }
    const nextPPH = clampPixelsPerHour(Math.round(basePPH * scale));
    const currentPPH = getPixelsPerHour();
    if (nextPPH === currentPPH) {
      return;
    }
    const body = getBody();
    if (!body) {
      return;
    }
    const preserveScrollTop = computeAnchoredScrollTop(body, y, currentPPH, nextPPH);
    body.dataset.requestedScrollTop = String(preserveScrollTop);
    onZoomChange({ pixelsPerHour: nextPPH, preserveScrollTop });
  };
  document.addEventListener("__pinch", handler);
  return () => {
    document.removeEventListener("__pinch", handler);
  };
}
