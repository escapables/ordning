import { t } from "./i18n/strings.js";
import { createConfirmDialog } from "./components/dialogs/confirm-dialog.js";
import { createEventModal } from "./components/event-form/event-modal.js";
import { createExportDialog } from "./components/export-dialog/export-dialog.js";
import { createImportDialog } from "./components/import-dialog/import-dialog.js";
import { createAppSession } from "./main/app-session.js";
import { installCloseGuard } from "./main/close-guard.js";
import { bootstrapApp } from "./main/bootstrap.js";
import { installContextMenuGuard } from "./main/context-menu-guard.js";
import { createEventMutationHandlers } from "./main/event-mutations.js";
import { invoke } from "./main/invoke.js";
import { createEventCopyPasteController } from "./main/event-copy-paste.js";
import { installKeyboardShortcuts } from "./main/keyboard-shortcuts.js";
import { renderShell } from "./main/shell-dom.js";
import { createSidebarController } from "./main/sidebar-controller.js";
import { mountSettingsDialog } from "./main/settings-dialog.js";
import { initializeSettings } from "./main/settings.js";
import { createToolbarController } from "./main/toolbar-controller.js";
import { createWeekViewController } from "./main/week-view-controller.js";
import { printWeek } from "./utils/print-week.js";
import { getWeekBounds, mapAllDayEvents, mapBackendEvents } from "./utils/week-view-events.js";
import { getState, loadCalendars } from "./state.js";

const appSession = createAppSession();

export async function renderAppShell() {
  appSession.reset();
  const shell = renderShell();
  if (!shell) return;
  const { app, sidebarList, sidebarMiniMonth, settingsButton, newEventButton, toolbarContainer, weekContainer } = shell;

  let weekViewController = null;

  const copyPasteController = createEventCopyPasteController({
    weekContainer,
    invoke,
    refresh: () => weekViewController.refreshAndRender(),
    t,
    clearEventSelection: (...args) => weekViewController.clearSelection(...args)
  });
  appSession.setTeardown("copyPaste", copyPasteController.dispose);

  const confirmDialog = createConfirmDialog();
  app.appendChild(confirmDialog.element);

  weekViewController = createWeekViewController({
    weekContainer,
    appSession,
    copyPasteController,
    onOpenEvent: (eventId, context) => eventModal.openEdit(eventId, context),
    onOpenCreateEvent: (prefill) => eventModal.openCreate(prefill),
    onDeleteEvent: (...args) => deleteEventById(...args),
    onDeleteMultipleEvents: (...args) => deleteMultipleEvents(...args),
    onUpdateTimedEventPosition: (...args) => updateTimedEventPosition(...args),
    onRenderState: ({ calendars, weekStart }) => {
      sidebarController.render(calendars, weekStart);
      toolbarController.render(weekStart);
    },
    onAfterStateRender: () => toolbarController.sync()
  });

  const { deleteEventById, deleteMultipleEvents, updateTimedEventPosition } = createEventMutationHandlers({
    invoke,
    confirmDialog,
    t,
    weekContainer,
    refreshAndRender: weekViewController.refreshAndRender,
    refreshCurrentWeekEvents: weekViewController.refreshCurrentWeekEvents,
    setPendingHighlightEvent: weekViewController.setPendingHighlightEvent,
    setPendingWeekViewRenderOptions: appSession.setPendingWeekViewRenderOptions
  });

  const eventModal = createEventModal({
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

  const toolbarController = createToolbarController({
    toolbarContainer,
    getWeekStart: weekViewController.getCurrentWeekStart,
    onPreviousWeek: weekViewController.goToPreviousWeek,
    onNextWeek: weekViewController.goToNextWeek,
    onToday: weekViewController.goToToday,
    onSearchSelect: weekViewController.focusSearchResult
  });
  appSession.setTeardown("manualSave", toolbarController.dispose);

  const sidebarController = createSidebarController({
    sidebarList,
    sidebarMiniMonth,
    newEventButton,
    confirm: confirmDialog.confirm,
    refreshAndRender: weekViewController.refreshAndRender,
    goToDate: weekViewController.goToDate,
    onOpenCreateEvent: eventModal.openCreate,
    onOpenExport: exportDialog.open,
    onOpenImport: importDialog.open
  });

  appSession.setTeardown("closeGuard", await installCloseGuard({
    invoke,
    t,
    choose: confirmDialog.choose,
    onDiscard: weekViewController.refreshAndRender
  }));
  appSession.setTeardown("contextMenuGuard", installContextMenuGuard(app));
  mountSettingsDialog({ app, settingsButton, invoke, renderAppShell });

  weekViewController.start();

  appSession.setKeydownHandler(
    installKeyboardShortcuts({ weekViewController, eventModal, deleteMultipleEvents, deleteEventById })
  );

  await weekViewController.refreshAndRender();
  await toolbarController.sync();
}
void bootstrapApp({
  initializeSettings: () => initializeSettings({ invoke }),
  renderAppShell
});
