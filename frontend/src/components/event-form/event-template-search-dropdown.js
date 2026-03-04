import { t } from "../../i18n/strings.js";

export function createEventTemplateSearchDropdown({
  titleField,
  titleInput,
  getCalendarColor,
  formatResultSubtitle,
  isEnabled,
  onSelectResult
}) {
  const dropdown = document.createElement("div");
  dropdown.className = "event-modal__template-dropdown";
  dropdown.hidden = true;

  const anchor = document.createElement("div");
  anchor.className = "event-modal__search-anchor";

  titleField.classList.add("event-modal__field--search");
  titleField.removeChild(titleInput);
  anchor.append(titleInput, dropdown);
  titleField.appendChild(anchor);

  let results = [];
  let activeIndex = -1;

  function hideDropdown() {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
    results = [];
    activeIndex = -1;
  }

  function renderResults() {
    dropdown.innerHTML = "";

    if (results.length === 0) {
      const empty = document.createElement("div");
      empty.className = "event-modal__template-empty";
      empty.textContent = t("eventFormTemplateNoResults");
      dropdown.appendChild(empty);
      dropdown.hidden = false;
      return;
    }

    const list = document.createElement("div");
    list.className = "event-modal__template-list";

    results.forEach((result, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "event-modal__template-item";
      item.setAttribute("aria-selected", activeIndex === index ? "true" : "false");
      item.classList.toggle("event-modal__template-item--active", activeIndex === index);

      const topRow = document.createElement("div");
      topRow.className = "event-modal__template-item-top";

      const titleGroup = document.createElement("div");
      titleGroup.className = "event-modal__template-item-main";

      const dot = document.createElement("span");
      dot.className = "event-modal__template-dot";
      dot.style.color = getCalendarColor(result.calendar_id);
      dot.textContent = "\u25CF";

      const title = document.createElement("span");
      title.className = "event-modal__template-item-title";
      title.textContent = result.title;

      titleGroup.append(dot, title);
      topRow.append(titleGroup);
      item.append(topRow);

      const subtitle = document.createElement("span");
      subtitle.className = "event-modal__template-item-subtitle";
      subtitle.textContent = formatResultSubtitle(result);
      item.append(subtitle);

      item.addEventListener("click", () => {
        void onSelectResult(result);
      });

      list.appendChild(item);
    });

    dropdown.appendChild(list);
    dropdown.hidden = false;
  }

  function setResults(nextResults) {
    results = Array.isArray(nextResults) ? nextResults : [];
    activeIndex = -1;
    renderResults();
  }

  titleInput.addEventListener("keydown", (keyboardEvent) => {
    if (!isEnabled()) {
      return;
    }

    if (keyboardEvent.key === "ArrowDown") {
      if (results.length === 0) {
        return;
      }

      keyboardEvent.preventDefault();
      activeIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % results.length;
      renderResults();
      return;
    }

    if (keyboardEvent.key === "ArrowUp") {
      if (results.length === 0) {
        return;
      }

      keyboardEvent.preventDefault();
      activeIndex = activeIndex < 0 ? results.length - 1 : (activeIndex - 1 + results.length) % results.length;
      renderResults();
      return;
    }

    if (keyboardEvent.key === "Enter" && !dropdown.hidden && results.length > 0) {
      keyboardEvent.preventDefault();
      void onSelectResult(results[activeIndex < 0 ? 0 : activeIndex]);
      return;
    }

    if (keyboardEvent.key === "Escape") {
      hideDropdown();
      return;
    }

    if (keyboardEvent.key === "Tab") {
      hideDropdown();
    }
  });

  anchor.addEventListener("focusout", () => {
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (!activeElement || !anchor.contains(activeElement)) {
        hideDropdown();
      }
    }, 0);
  });

  document.addEventListener(
    "pointerdown",
    (pointerEvent) => {
      if (!isEnabled() || dropdown.hidden) {
        return;
      }

      const target = pointerEvent.target;
      if (target instanceof Node && anchor.contains(target)) {
        return;
      }

      hideDropdown();
    },
    true
  );

  return {
    hideDropdown,
    setResults
  };
}
