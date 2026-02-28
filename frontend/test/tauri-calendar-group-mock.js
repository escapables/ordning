(function () {
  "use strict";

  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) {
    return;
  }

  const baseInvoke = tauri.core.invoke.bind(tauri.core);
  const calendarOverrides = new Map();

  function normalizeOptionalText(value) {
    const text = String(value || "").trim();
    return text ? text : null;
  }

  tauri.core.invoke = async function patchedInvoke(command, payload = {}) {
    if (command === "list_calendars") {
      const calendars = await baseInvoke(command, payload);
      return (calendars || []).map((calendar) => ({
        ...calendar,
        ...(calendarOverrides.get(calendar.id) || {})
      }));
    }

    if (command === "create_calendar") {
      const created = await baseInvoke(command, payload);
      const group = normalizeOptionalText(payload.group);
      if (group) {
        calendarOverrides.set(created?.id, { group });
      }
      return {
        ...(created ?? {}),
        ...(calendarOverrides.get(created?.id) || {})
      };
    }

    if (command === "update_calendar") {
      const calendars = await tauri.core.invoke("list_calendars");
      const existing = Array.isArray(calendars)
        ? calendars.find((calendar) => calendar.id === payload.id)
        : null;
      if (!existing) {
        return Promise.reject("calendar not found");
      }
      calendarOverrides.set(payload.id, {
        name: payload.name || existing.name,
        color: payload.color || existing.color,
        group: normalizeOptionalText(payload.group)
      });
      return {
        ...existing,
        ...calendarOverrides.get(payload.id)
      };
    }

    if (command === "delete_calendar") {
      calendarOverrides.delete(payload.id);
      return baseInvoke(command, payload);
    }

    return baseInvoke(command, payload);
  };
})();
