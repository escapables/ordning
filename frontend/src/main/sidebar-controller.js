import { t } from "../i18n/strings.js";
import { renderCalendarList } from "../components/sidebar/calendar-list.js";
import { renderMiniMonth } from "../components/sidebar/mini-month.js";
import { purgePastEventsFlow } from "../utils/ui-actions.js";

import { invoke } from "./invoke.js";

function restoreCalendarScroll(sidebarList, previousScrollTop) {
  const nextCalendarGroups = sidebarList.querySelector(".calendar-list__groups");
  if (nextCalendarGroups instanceof HTMLElement && previousScrollTop !== null) {
    nextCalendarGroups.scrollTop = previousScrollTop;
  }
}

export function createSidebarController(options = {}) {
  const {
    sidebarList,
    sidebarMiniMonth,
    newEventButton,
    confirm = async () => true,
    refreshAndRender = async () => {},
    goToDate = async () => {},
    onOpenCreateEvent = () => {},
    onOpenExport = () => {},
    onOpenImport = () => {}
  } = options;

  let lastRenderedCalendarsJson = null;

  if (newEventButton instanceof HTMLElement) {
    newEventButton.tabIndex = 2;
    newEventButton.addEventListener("click", () => {
      onOpenCreateEvent();
    });
  }

  return {
    render(calendars, weekStart) {
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
              await refreshAndRender();
            },
            onConfirmDelete: () => confirm(t("calendarDeleteConfirm")),
            onDelete: async (calendar) => {
              try {
                await invoke("delete_calendar", { id: calendar.id });
                await refreshAndRender();
              } catch (error) {
                window.alert(t("calendarDeleteError"));
                console.error("Failed to delete calendar", error);
              }
            },
            onToggleVisibility: async (calendarId) => {
              try {
                await invoke("toggle_visibility", { id: calendarId });
                await refreshAndRender();
              } catch (error) {
                window.alert(t("calendarVisibilityError"));
                console.error("Failed to toggle calendar visibility", error);
              }
            },
            onExport: () => {
              onOpenExport();
            },
            onImport: () => {
              onOpenImport();
            },
            onPurgePast: async () => {
              try {
                await purgePastEventsFlow({
                  invoke,
                  confirm,
                  refresh: refreshAndRender,
                  t
                });
              } catch (error) {
                window.alert(t("purgePastError"));
                console.error("Failed to purge past events", error);
              }
            }
          })
        );

        restoreCalendarScroll(sidebarList, previousCalendarScrollTop);
      }

      sidebarMiniMonth.replaceChildren(
        renderMiniMonth({
          currentWeekStart: weekStart,
          onSelectDay: async (date) => {
            await goToDate(date);
          }
        })
      );
    }
  };
}
