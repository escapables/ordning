import { t } from "../i18n/strings.js";

export function renderShell() {
  const app = document.querySelector("#app");
  if (!app) {
    return null;
  }

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__header">
          <button type="button" class="sidebar__new-event-btn">${t("newEventButton")}</button>
          <button type="button" class="sidebar__settings-btn" aria-label="${t("settingsButtonAria")}">&#9881;</button>
        </div>
        <div class="sidebar__mini-month"></div>
        <div class="sidebar__calendar-list"></div>
      </aside>
      <main class="main-content">
        <div class="main-toolbar-container"></div>
        <div class="week-view-container"></div>
      </main>
    </div>
  `;
  document.title = t("appName");

  const sidebarList = app.querySelector(".sidebar__calendar-list");
  const sidebarMiniMonth = app.querySelector(".sidebar__mini-month");
  const settingsButton = app.querySelector(".sidebar__settings-btn");
  const newEventButton = app.querySelector(".sidebar__new-event-btn");
  const toolbarContainer = app.querySelector(".main-toolbar-container");
  const weekContainer = app.querySelector(".week-view-container");

  if (!sidebarList || !sidebarMiniMonth || !settingsButton || !newEventButton || !toolbarContainer || !weekContainer) {
    return null;
  }

  return {
    app,
    sidebarList,
    sidebarMiniMonth,
    settingsButton,
    newEventButton,
    toolbarContainer,
    weekContainer
  };
}
