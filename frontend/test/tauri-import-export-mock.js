(function () {
  "use strict";

  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) {
    return;
  }

  const baseInvoke = tauri.core.invoke.bind(tauri.core);
  const calendars = new Map();
  const events = new Map();
  const virtualFiles = new Map();
  const launchDirectory = "/tmp/ordning-launch";
  let exportCounter = 0;
  let lastPath = "";

  window.__ORDNING_DIALOG_DEFAULTS = {
    exportDefaultPath: null,
    importDefaultPath: null,
    launchDirectory
  };

  const toDate = (value) => {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDate = (value) => {
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  };

  const addDays = (dateKey, days) => {
    const date = toDate(dateKey);
    date.setDate(date.getDate() + days);
    return formatDate(date);
  };

  const isWrappedClock = (startTime, endTime) =>
    String(endTime ?? "").localeCompare(String(startTime ?? "")) <= 0;

  const resolveVirtualFile = (file, password) => {
    if (!file) {
      throw "read import file: not found";
    }

    if (file.format !== "ordning-encrypted-1") {
      return file;
    }

    if (!password) {
      throw "password is required for encrypted import";
    }

    if (password !== file.__password) {
      throw "failed to decrypt import file: invalid password or corrupted encrypted data";
    }

    return file.__snapshot;
  };

  tauri.core.invoke = function patchedInvoke(command, payload = {}) {
    if (command === "create_calendar") {
      return Promise.resolve(baseInvoke(command, payload)).then((created) => {
        if (created?.id) {
          calendars.set(created.id, created);
        }
        return created;
      });
    }

    if (command === "create_event") {
      return Promise.resolve(baseInvoke(command, payload)).then((created) => {
        const eventId = created?.id;
        if (eventId && payload?.event?.calendarId) {
          events.set(eventId, {
            id: eventId,
            calendarId: payload.event.calendarId,
            title: payload.event.title ?? "",
            startDate: payload.event.startDate,
            endDate: payload.event.endDate,
            startTime: payload.event.startTime,
            endTime: payload.event.endTime,
            allDay: Boolean(payload.event.allDay),
            descriptionPrivate: payload.event.descriptionPrivate ?? "",
            descriptionPublic: payload.event.descriptionPublic ?? "",
            location: payload.event.location ?? ""
          });
        }
        return created;
      });
    }

    if (command === "update_event") {
      const eventId = payload?.id;
      const existing = eventId ? events.get(eventId) : null;
      const nextEvent = payload?.event;
      return Promise.resolve(baseInvoke(command, payload)).then((result) => {
        if (eventId && existing && nextEvent) {
          events.set(eventId, {
            ...existing,
            calendarId: nextEvent.calendarId,
            title: nextEvent.title ?? "",
            startDate: nextEvent.startDate,
            endDate: nextEvent.endDate,
            startTime: nextEvent.startTime,
            endTime: nextEvent.endTime,
            allDay: Boolean(nextEvent.allDay),
            descriptionPrivate: nextEvent.descriptionPrivate ?? "",
            descriptionPublic: nextEvent.descriptionPublic ?? "",
            location: nextEvent.location ?? ""
          });
        }
        return result;
      });
    }

    if (command === "delete_event") {
      const eventId = payload?.id;
      return Promise.resolve(baseInvoke(command, payload)).then((result) => {
        if (eventId) {
          events.delete(eventId);
        }
        return result;
      });
    }

    if (command === "get_launch_directory") {
      return Promise.resolve(launchDirectory);
    }

    if (command === "export_json") {
      window.__ORDNING_DIALOG_DEFAULTS.exportDefaultPath = payload?.defaultPath ?? null;
      const selectedIds = new Set(payload?.calendarIds ?? []);
      const exportEvents = [...events.values()].filter((event) =>
        selectedIds.has(event.calendarId)
      );
      const password = payload?.password;
      if (typeof password === "string" && !password.trim()) {
        return Promise.reject("export password is required");
      }
      exportCounter += 1;
      const path = `/tmp/ordning-export-${exportCounter}.json`;
      const serialized = {
        calendars: [...calendars.values()].filter((calendar) =>
          selectedIds.has(calendar.id)
        ),
        events: exportEvents.map((event) => ({
          ...event
        }))
      };
      virtualFiles.set(
        path,
        typeof password === "string"
          ? {
              format: "ordning-encrypted-1",
              __password: password,
              __snapshot: serialized
            }
          : serialized
      );
      lastPath = path;
      return Promise.resolve({
        path,
        calendarCount: serialized.calendars.length,
        eventCount: serialized.events.length
      });
    }

    if (command === "preview_import_json") {
      window.__ORDNING_DIALOG_DEFAULTS.importDefaultPath = payload?.defaultPath ?? null;
      let snapshot;
      try {
        snapshot = resolveVirtualFile(virtualFiles.get(lastPath), payload?.password);
      } catch (error) {
        return Promise.reject(error);
      }

      return Promise.resolve({
        path: lastPath,
        summary: {
          calendarCount: snapshot.calendars.length,
          eventCount: snapshot.events.length,
          newEvents: snapshot.events.length,
          updatedEvents: 0,
          conflictEvents: 0
        }
      });
    }

    if (command === "import_json") {
      let snapshot;
      try {
        snapshot = resolveVirtualFile(
          virtualFiles.get(payload?.path ?? ""),
          payload?.password
        );
      } catch (error) {
        return Promise.reject(error);
      }

      return Promise.all(
        snapshot.events.map((event) => {
          const startDate = event.startDate;
          const endDate =
            event.endDate
            ?? (isWrappedClock(event.startTime, event.endTime)
              ? addDays(startDate, 1)
              : startDate);
          return tauri.core.invoke("create_event", {
            event: {
              calendarId: event.calendarId,
              title: event.title,
              startDate,
              endDate,
              startTime: event.startTime,
              endTime: event.endTime,
              allDay: Boolean(event.allDay),
              descriptionPrivate: event.descriptionPrivate ?? "",
              descriptionPublic: event.descriptionPublic ?? "",
              location: event.location ?? ""
            }
          });
        })
      ).then(() => ({
        path: payload?.path ?? "",
        summary: {
          newEvents: snapshot.events.length,
          updatedEvents: 0,
          conflictEvents: 0
        }
      }));
    }

    return baseInvoke(command, payload);
  };
})();
