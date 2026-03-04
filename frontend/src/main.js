import { t } from "./i18n/strings.js";
import { createConfirmDialog } from "./components/dialogs/confirm-dialog.js";
import { createEventModal } from "./components/event-form/event-modal.js";
import { createExportDialog } from "./components/export-dialog/export-dialog.js";
import { createImportDialog } from "./components/import-dialog/import-dialog.js";
import { renderCalendarList } from "./components/sidebar/calendar-list.js";
import { renderMiniMonth } from "./components/sidebar/mini-month.js";
import { createAppSession } from "./main/app-session.js";
import { installCloseGuard } from "./main/close-guard.js";
import { bootstrapApp } from "./main/bootstrap.js";
import { createEventMutationHandlers } from "./main/event-mutations.js";
import { invoke } from "./main/invoke.js";
import { createEventCopyPasteController } from "./main/event-copy-paste.js";
import { renderShell } from "./main/shell-dom.js";
import { mountSettingsDialog } from "./main/settings-dialog.js";
import { initializeSettings } from "./main/settings.js";
import { createToolbarController } from "./main/toolbar-controller.js";
import { createWeekViewController } from "./main/week-view-controller.js";
import { setupKeyboardHandler } from "./utils/keyboard-handler.js";
import { printWeek } from "./utils/print-week.js";
import { getWeekBounds, mapAllDayEvents, mapBackendEvents } from "./utils/week-view-events.js";
import { purgePastEventsFlow } from "./utils/ui-actions.js";
import { getState, loadCalendars } from "./state.js";

const appSession = createAppSession();

export async function renderAppShell() {
  appSession.reset();
  const shell = renderShell();
  if (!shell) {
    return;
  }
  const {
    app,
    sidebarList,
    sidebarMiniMonth,
    settingsButton,
    newEventButton,
    toolbarContainer,
    weekContainer
  } = shell;

  let weekViewController = null;
  let toolbarController = null;
  let renderSidebarSection = () => {};
  let eventModal = null;
  let deleteEventById = async () => {};
  let deleteMultipleEvents = async () => {};
  let updateTimedEventPosition = async () => {};

  const copyPasteController = createEventCopyPasteController({
    weekContainer,
    invoke,
    refresh: async () => {
      await weekViewController.refreshAndRender();
    },
    t,
    clearEventSelection: (...args) => {
      weekViewController.clearSelection(...args);
    }
  });
  appSession.setTeardown("copyPaste", copyPasteController.dispose);

  const confirmDialog = createConfirmDialog();
  app.appendChild(confirmDialog.element);

  weekViewController = createWeekViewController({
    weekContainer,
    appSession,
    copyPasteController,
    onOpenEvent: (eventId, context) => {
      eventModal.openEdit(eventId, context);
    },
    onOpenCreateEvent: (prefill) => {
      eventModal.openCreate(prefill);
    },
    onDeleteEvent: (...args) => deleteEventById(...args),
    onDeleteMultipleEvents: (...args) => deleteMultipleEvents(...args),
    onUpdateTimedEventPosition: (...args) => updateTimedEventPosition(...args),
    onRenderState: ({ calendars, weekStart }) => {
      renderSidebarSection(calendars, weekStart);
      toolbarController.render(weekStart);
    },
    onAfterStateRender: () => toolbarController.sync()
  });

  ({ deleteEventById, deleteMultipleEvents, updateTimedEventPosition } = createEventMutationHandlers({
    invoke,
    confirmDialog,
    t,
    weekContainer,
    refreshAndRender: weekViewController.refreshAndRender,
    refreshCurrentWeekEvents: weekViewController.refreshCurrentWeekEvents,
    setPendingHighlightEvent: weekViewController.setPendingHighlightEvent,
    setPendingWeekViewRenderOptions: appSession.setPendingWeekViewRenderOptions
  }));

  eventModal = createEventModal({
    confirmDialog,
    onPersist: weekViewController.refreshAndRender,
    onEnsureCalendars: loadCalendars,
    onDelete: deleteEventById,
    onFocusCalendarCreate: () => {
      const openCreateDialogButton = app.querySelector(".calendar-list__add");
      if (openCreateDialogButton instanceof HTMLElement) {
        openCreateDialogButton.click();
      }
    }
  });
  app.appendChild(eventModal.element);

  const exportDialog = createExportDialog({
    onPrint: () => {
      const { weekDates } = getWeekBounds(weekViewController.getCurrentWeekStart());
      printWeek({
        weekDates,
        events: mapBackendEvents(getState().events),
        allDayEvents: mapAllDayEvents(getState().allDayEvents)
      });
    }
  });
  app.appendChild(exportDialog.element);

  const importDialog = createImportDialog({
    onImported: weekViewController.refreshAndRender
  });
  app.appendChild(importDialog.element);

  toolbarController = createToolbarController({
    toolbarContainer,
    getWeekStart: () => weekViewController.getCurrentWeekStart(),
    onPreviousWeek: () => weekViewController.goToPreviousWeek(),
    onNextWeek: () => weekViewController.goToNextWeek(),
    onToday: () => weekViewController.goToToday(),
    onSearchSelect: (result) => weekViewController.focusSearchResult(result)
  });
  appSession.setTeardown("manualSave", toolbarController.dispose);

  appSession.setTeardown("closeGuard", await installCloseGuard({
    invoke,
    t,
    choose: confirmDialog.choose,
    onDiscard: weekViewController.refreshAndRender
  }));
  mountSettingsDialog({ app, settingsButton, invoke, renderAppShell });

  let lastRenderedCalendarsJson = null;
  renderSidebarSection = (calendars, weekStart) => {
    const calendarsJson = JSON.stringify(calendars);
    if (calendarsJson !== lastRenderedCalendarsJson) {
      const previousCalendarGroups = sidebarList.querySelector(".calendar-list__groups");
      const previousCalendarScrollTop = previousCalendarGroups instanceof HTMLElement
        ? previousCalendarGroups.scrollTop
        : null;
      lastRenderedCalendarsJson = calendarsJson;

      sidebarList.replaceChildren(
        renderCalendarList(calendars, {
          onCreate: async ({ id, name, color, group }) => {
            if (!name) {
              return;
            }
            await invoke(id ? "update_calendar" : "create_calendar", {
              ...(id ? { id } : {}),
              name,
              color,
              group
            });
            await weekViewController.refreshAndRender();
          },
          onConfirmDelete: () => confirmDialog.confirm(t("calendarDeleteConfirm")),
          onDelete: async (calendar) => {
            try {
              await invoke("delete_calendar", { id: calendar.id });
              await weekViewController.refreshAndRender();
            } catch (error) {
              window.alert(t("calendarDeleteError"));
              console.error("Failed to delete calendar", error);
            }
          },
          onToggleVisibility: async (calendarId) => {
            try {
              await invoke("toggle_visibility", { id: calendarId });
              await weekViewController.refreshAndRender();
            } catch (error) {
              window.alert(t("calendarVisibilityError"));
              console.error("Failed to toggle calendar visibility", error);
            }
          },
          onExport: () => {
            exportDialog.open();
          },
          onImport: () => {
            importDialog.open();
          },
          onPurgePast: async () => {
            try {
              await purgePastEventsFlow({
                invoke,
                confirm: confirmDialog.confirm,
                refresh: weekViewController.refreshAndRender,
                t
              });
            } catch (error) {
              window.alert(t("purgePastError"));
              console.error("Failed to purge past events", error);
            }
          }
        })
      );

      const nextCalendarGroups = sidebarList.querySelector(".calendar-list__groups");
      if (nextCalendarGroups instanceof HTMLElement && previousCalendarScrollTop !== null) {
        nextCalendarGroups.scrollTop = previousCalendarScrollTop;
      }
    }

    sidebarMiniMonth.replaceChildren(
      renderMiniMonth({
        currentWeekStart: weekStart,
        onSelectDay: async (date) => {
          await weekViewController.goToDate(date);
        }
      })
    );
  };

  app.addEventListener(
    "contextmenu",
    (contextMenuEvent) => {
      const target = contextMenuEvent.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".context-menu")) {
        return;
      }
      if (target.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      if (target.closest(".day-column") || target.closest(".all-day-event")) {
        return;
      }
      contextMenuEvent.preventDefault();
    },
    true
  );
  if (newEventButton instanceof HTMLElement) {
    newEventButton.tabIndex = 2;
    newEventButton.addEventListener("click", () => {
      eventModal.openCreate();
    });
  }

  weekViewController.start();

  const nextKeydownHandler = setupKeyboardHandler({
    closeOpenDialogs: () => {
      document.querySelectorAll("dialog[open]").forEach((dialogElement) => {
        dialogElement.close();
      });
    },
    clearEventSelection: () => {
      weekViewController.clearSelection({ blurFocusedEvent: true });
    },
    cancelPasteMode: () => {
      weekViewController.cancelPasteMode();
    },
    copySelectedEvent: () => weekViewController.copySelectedEvent(),
    pasteCopiedEvent: () => weekViewController.pasteAtCurrentPointer(),
    goToPreviousWeek: () => weekViewController.goToPreviousWeek(),
    goToNextWeek: () => weekViewController.goToNextWeek(),
    goToToday: () => weekViewController.goToToday(),
    openCreateEvent: () => {
      eventModal.openCreate();
    },
    hasOpenDialog: () => Boolean(document.querySelector("dialog[open]")),
    getSelectedEventTargets: () => weekViewController.getSelectedEventTargets(),
    deleteMultipleEvents,
    getDeleteEventId: () => weekViewController.getDeleteEventTarget(),
    deleteEventById,
    onDeleteError: () => {}
  });
  document.addEventListener("keydown", nextKeydownHandler);
  appSession.setKeydownHandler(nextKeydownHandler);

  await weekViewController.refreshAndRender();
  await toolbarController.sync();
}
void bootstrapApp({
  initializeSettings: () => initializeSettings({ invoke }),
  renderAppShell
});
