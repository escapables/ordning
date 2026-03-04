function shouldAllowNativeContextMenu(target) {
  if (!(target instanceof Element)) {
    return true;
  }

  return Boolean(
    target.closest(".context-menu")
    || target.closest("input, textarea, select, [contenteditable='true']")
    || target.closest(".day-column")
    || target.closest(".all-day-event")
  );
}

export function installContextMenuGuard(app) {
  const handleContextMenu = (contextMenuEvent) => {
    if (shouldAllowNativeContextMenu(contextMenuEvent.target)) {
      return;
    }
    contextMenuEvent.preventDefault();
  };

  app.addEventListener("contextmenu", handleContextMenu, true);
  return () => app.removeEventListener("contextmenu", handleContextMenu, true);
}
