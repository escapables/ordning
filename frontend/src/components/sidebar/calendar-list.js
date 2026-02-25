import { t } from "../../i18n/strings.js";

const CALENDAR_COLORS = [
  "#007aff",
  "#34c759",
  "#ff3b30",
  "#ff9500",
  "#af52de",
  "#5ac8fa",
  "#ff2d55",
  "#8e8e93"
];

function pickDefaultColor(calendars) {
  const usedColors = new Set(
    calendars.map((calendar) => String(calendar.color || "").trim().toLowerCase())
  );
  const firstUnusedColor = CALENDAR_COLORS.find((color) => !usedColors.has(color.toLowerCase()));
  if (firstUnusedColor) {
    return firstUnusedColor;
  }

  const randomIndex = Math.floor(Math.random() * CALENDAR_COLORS.length);
  return CALENDAR_COLORS[randomIndex];
}

function buildGroups(calendars) {
  const groups = new Map();
  calendars.forEach((calendar) => {
    const group = calendar.group?.trim() || t("calendarGroupUngrouped");
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push(calendar);
  });
  return groups;
}

export function renderCalendarList(calendars, handlers) {
  const {
    onCreate = () => {},
    onDelete = () => {},
    onToggleVisibility = () => {},
    onImport = () => {},
    onExport = () => {}
  } = handlers;

  const section = document.createElement("section");
  section.className = "calendar-list";

  const groups = buildGroups(calendars);
  groups.forEach((groupCalendars, groupName) => {
    const group = document.createElement("div");
    group.className = "calendar-list__group";

    const header = document.createElement("h3");
    header.className = "calendar-list__group-title";
    header.textContent = groupName;
    group.appendChild(header);

    groupCalendars.forEach((calendar) => {
      const row = document.createElement("div");
      row.className = "calendar-list__item";

      const visibilityInput = document.createElement("input");
      visibilityInput.className = "calendar-list__checkbox";
      visibilityInput.type = "checkbox";
      visibilityInput.tabIndex = 2;
      visibilityInput.checked = Boolean(calendar.visible);
      visibilityInput.addEventListener("change", () => {
        onToggleVisibility(calendar.id);
      });

      const dot = document.createElement("span");
      dot.className = "calendar-list__dot";
      dot.style.backgroundColor = calendar.color;

      const name = document.createElement("span");
      name.className = "calendar-list__name";
      name.textContent = calendar.name;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "calendar-list__delete";
      deleteButton.tabIndex = 2;
      deleteButton.textContent = t("calendarDeleteButton");
      deleteButton.addEventListener("click", () => {
        const confirmed = window.confirm(t("calendarDeleteConfirm"));
        if (!confirmed) {
          return;
        }
        onDelete(calendar);
      });

      row.appendChild(visibilityInput);
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(deleteButton);
      group.appendChild(row);
    });

    section.appendChild(group);
  });

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "calendar-list__add";
  addButton.tabIndex = 2;
  addButton.textContent = "+";
  addButton.setAttribute("aria-label", t("calendarCreateOpenButton"));

  const dialog = document.createElement("dialog");
  dialog.className = "calendar-create-dialog";

  const form = document.createElement("form");
  form.className = "calendar-create-dialog__form";
  form.method = "dialog";

  const title = document.createElement("h3");
  title.className = "calendar-create-dialog__title";
  title.textContent = t("calendarCreateDialogTitle");

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 100;
  input.required = true;
  input.tabIndex = 2;
  input.placeholder = t("calendarCreatePlaceholder");
  input.className = "calendar-create-dialog__input";

  const colorGrid = document.createElement("div");
  colorGrid.className = "calendar-create-dialog__colors";
  let selectedColor = pickDefaultColor(calendars);

  CALENDAR_COLORS.forEach((color) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "calendar-create-dialog__color";
    option.tabIndex = 2;
    option.style.backgroundColor = color;
    option.dataset.color = color;
    option.setAttribute("aria-label", `${t("calendarColorLabel")} ${color}`);

    if (color === selectedColor) {
      option.classList.add("calendar-create-dialog__color--selected");
    }

    option.addEventListener("click", () => {
      selectedColor = color;
      colorGrid.querySelectorAll(".calendar-create-dialog__color").forEach((element) => {
        element.classList.remove("calendar-create-dialog__color--selected");
      });
      option.classList.add("calendar-create-dialog__color--selected");
    });
    colorGrid.appendChild(option);
  });

  const actions = document.createElement("div");
  actions.className = "calendar-create-dialog__actions";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "calendar-create-dialog__btn";
  cancel.textContent = t("eventFormCancel");

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "calendar-create-dialog__btn calendar-create-dialog__btn--primary";
  submit.tabIndex = 2;
  submit.textContent = t("calendarCreateButton");

  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(title);
  form.appendChild(input);
  form.appendChild(colorGrid);
  form.appendChild(actions);
  dialog.appendChild(form);

  addButton.addEventListener("click", () => {
    input.value = "";
    selectedColor = pickDefaultColor(calendars);
    colorGrid.querySelectorAll(".calendar-create-dialog__color").forEach((element) => {
      const color = element.dataset.color || "";
      element.classList.toggle(
        "calendar-create-dialog__color--selected",
        color.toLowerCase() === selectedColor.toLowerCase()
      );
    });
    dialog.showModal();
    input.focus();
  });

  cancel.addEventListener("click", () => {
    dialog.close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }

    await onCreate({
      name,
      color: selectedColor
    });
    dialog.close();
  });

  const ioRow = document.createElement("div");
  ioRow.className = "calendar-list__io";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className = "calendar-list__io-btn";
  exportButton.tabIndex = 2;
  exportButton.textContent = t("exportButton");
  exportButton.addEventListener("click", onExport);

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "calendar-list__io-btn";
  importButton.tabIndex = 2;
  importButton.textContent = t("importButton");
  importButton.addEventListener("click", onImport);

  ioRow.append(exportButton, importButton);

  section.appendChild(addButton);
  section.appendChild(ioRow);
  section.appendChild(dialog);
  return section;
}
