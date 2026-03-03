import { positionDropdown } from "./position-dropdown.js";

const REOPEN_GUARD_MS = 100;
const VIEWPORT_PADDING = 8;

export function createSelectPicker({
  name,
  items = [],
  className = "",
  searchable = false,
  onChange
} = {}) {
  const container = document.createElement("div");
  container.className = `picker picker--select${className ? ` ${className}` : ""}`;

  const select = document.createElement("select");
  select.name = name;
  select.style.cssText = "position:absolute;opacity:0;pointer-events:none;width:0;height:0";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "event-modal__input picker__trigger";
  const triggerLabel = document.createElement("span");
  triggerLabel.className = "picker__trigger-label";
  trigger.appendChild(triggerLabel);

  container.append(select, trigger);

  let dropdown = null;
  let lastCloseTime = 0;

  function populateOptions(newItems) {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
    newItems.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
  }

  populateOptions(items);

  function syncDisplay() {
    const selected = select.options[select.selectedIndex];
    triggerLabel.textContent = selected ? selected.textContent : "";
  }

  syncDisplay();

  function closeDropdown() {
    if (!dropdown) {
      return;
    }
    dropdown.remove();
    dropdown = null;
    lastCloseTime = Date.now();
    document.removeEventListener("pointerdown", onOutsideClick, true);
    document.removeEventListener("keydown", onEscape);
  }

  function openDropdown() {
    if (dropdown || trigger.disabled) {
      return;
    }
    dropdown = document.createElement("div");
    dropdown.className = "picker__dropdown picker__dropdown--select";

    let searchInput = null;
    if (searchable) {
      searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "picker__search-input";
      searchInput.autocomplete = "off";
      dropdown.appendChild(searchInput);
    }

    const list = document.createElement("div");
    list.className = "picker__select-list";
    dropdown.appendChild(list);

    function renderItems(filter) {
      while (list.firstChild) {
        list.removeChild(list.firstChild);
      }
      const lowerFilter = filter ? filter.toLowerCase() : "";
      Array.from(select.options).forEach((option) => {
        if (lowerFilter && !option.textContent.toLowerCase().includes(lowerFilter)) {
          return;
        }
        const item = document.createElement("button");
        item.type = "button";
        item.className = "picker__select-item";
        if (option.value === select.value) {
          item.classList.add("picker__select-item--selected");
        }
        item.textContent = option.textContent;
        item.addEventListener("click", (clickEvent) => {
          clickEvent.stopPropagation();
          select.value = option.value;
          syncDisplay();
          closeDropdown();
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        list.appendChild(item);
      });
    }

    renderItems("");

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        renderItems(searchInput.value);
      });
    }

    positionDropdown(dropdown, trigger);
    const dropRect = dropdown.getBoundingClientRect();
    dropdown.style.maxHeight = `${window.innerHeight - dropRect.top - VIEWPORT_PADDING}px`;

    document.addEventListener("pointerdown", onOutsideClick, true);
    document.addEventListener("keydown", onEscape);

    if (searchInput) {
      searchInput.focus();
    }
  }

  function onOutsideClick(pointerEvent) {
    if (!container.contains(pointerEvent.target)
      && (!dropdown || !dropdown.contains(pointerEvent.target))) {
      closeDropdown();
    }
  }

  function onEscape(keyEvent) {
    if (keyEvent.key === "Escape") {
      keyEvent.stopPropagation();
      closeDropdown();
    }
  }

  trigger.addEventListener("click", () => {
    if (!dropdown && Date.now() - lastCloseTime > REOPEN_GUARD_MS) {
      openDropdown();
    }
  });

  select.addEventListener("change", () => {
    syncDisplay();
    if (typeof onChange === "function") {
      onChange(select.value);
    }
  });

  function setItems(newItems) {
    const previousValue = select.value;
    populateOptions(newItems);
    if (previousValue && select.querySelector(`option[value="${CSS.escape(previousValue)}"]`)) {
      select.value = previousValue;
    }
    syncDisplay();
  }

  function close() {
    closeDropdown();
  }

  return { container, select, trigger, setItems, syncDisplay, close };
}
