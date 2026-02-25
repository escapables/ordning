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
    onToggleVisibility = () => {}
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

  const form = document.createElement("form");
  form.className = "calendar-create";

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 100;
  input.required = true;
  input.tabIndex = 2;
  input.placeholder = t("calendarCreatePlaceholder");
  input.className = "calendar-create__input";

  const colorGrid = document.createElement("div");
  colorGrid.className = "calendar-create__colors";
  let selectedColor = CALENDAR_COLORS[0];

  CALENDAR_COLORS.forEach((color, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "calendar-create__color";
    option.tabIndex = 2;
    option.style.backgroundColor = color;
    option.setAttribute("aria-label", `${t("calendarColorLabel")} ${color}`);

    if (index === 0) {
      option.classList.add("calendar-create__color--selected");
    }

    option.addEventListener("click", () => {
      selectedColor = color;
      colorGrid.querySelectorAll(".calendar-create__color").forEach((element) => {
        element.classList.remove("calendar-create__color--selected");
      });
      option.classList.add("calendar-create__color--selected");
    });
    colorGrid.appendChild(option);
  });

  const actions = document.createElement("div");
  actions.className = "calendar-create__actions";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "calendar-create__submit";
  submit.tabIndex = 2;
  submit.textContent = t("calendarCreateButton");

  actions.appendChild(submit);
  form.appendChild(input);
  form.appendChild(colorGrid);
  form.appendChild(actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await onCreate({
      name: input.value.trim(),
      color: selectedColor
    });
    input.value = "";
  });

  section.appendChild(form);
  return section;
}
