function normalizeHandler(handler) {
  return typeof handler === "function" ? handler : null;
}

export function createAppSession() {
  let unsubscribeState = null;
  let keydownHandler = null;
  let pendingWeekViewRenderOptions = null;
  const teardowns = {
    zoomGuards: null,
    pinchZoom: null,
    closeGuard: null,
    manualSave: null,
    copyPaste: null
  };

  const runTeardown = (name) => {
    if (!teardowns[name]) {
      return;
    }
    teardowns[name]();
    teardowns[name] = null;
  };

  return {
    reset() {
      if (unsubscribeState) {
        unsubscribeState();
        unsubscribeState = null;
      }
      if (keydownHandler) {
        document.removeEventListener("keydown", keydownHandler);
        keydownHandler = null;
      }
      runTeardown("pinchZoom");
      runTeardown("zoomGuards");
      runTeardown("closeGuard");
      runTeardown("manualSave");
      runTeardown("copyPaste");
    },
    setUnsubscribeState(handler) {
      unsubscribeState = normalizeHandler(handler);
    },
    setKeydownHandler(handler) {
      keydownHandler = normalizeHandler(handler);
    },
    setTeardown(name, handler) {
      if (!(name in teardowns)) {
        throw new Error(`Unknown app session teardown: ${name}`);
      }
      teardowns[name] = normalizeHandler(handler);
    },
    setPendingWeekViewRenderOptions(value) {
      pendingWeekViewRenderOptions = value;
    },
    consumePendingWeekViewRenderOptions() {
      const currentOptions = pendingWeekViewRenderOptions;
      if (pendingWeekViewRenderOptions?.remainingRenders > 1) {
        pendingWeekViewRenderOptions.remainingRenders -= 1;
      } else {
        pendingWeekViewRenderOptions = null;
      }
      return currentOptions;
    }
  };
}
