(function () {
  "use strict";

  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) {
    return;
  }

  const baseInvoke = tauri.core.invoke.bind(tauri.core);
  const dirtyCommands = new Set([
    "create_calendar",
    "delete_calendar",
    "toggle_visibility",
    "create_event",
    "update_event",
    "delete_event",
    "purge_past_events",
    "set_settings"
  ]);
  const cleanCommands = new Set(["import_json"]);

  let dirty = false;

  tauri.core.invoke = function patchedInvoke(command, payload) {
    if (command === "has_unsaved_changes") {
      return Promise.resolve(dirty);
    }
    if (command === "persist_snapshot" || command === "discard_unsaved_changes") {
      dirty = false;
      return Promise.resolve(null);
    }

    return Promise.resolve(baseInvoke(command, payload)).then((result) => {
      if (dirtyCommands.has(command)) {
        dirty = true;
      } else if (cleanCommands.has(command)) {
        dirty = false;
      }
      return result;
    });
  };
})();
