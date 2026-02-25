import { getLocale, t } from "../../i18n/strings.js";

const SEARCH_DEBOUNCE_MS = 300;

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatSearchDate(dateKey) {
  const date = parseDateKey(dateKey);
  return new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export function createEventSearch(options = {}) {
  const {
    onSearch = async () => [],
    onSelect = () => {}
  } = options;

  const root = document.createElement("div");
  root.className = "toolbar-search";

  const input = document.createElement("input");
  input.className = "toolbar-search__input";
  input.type = "search";
  input.placeholder = t("searchPlaceholder");
  input.setAttribute("aria-label", t("searchPlaceholder"));
  input.tabIndex = 1;

  const dropdown = document.createElement("div");
  dropdown.className = "toolbar-search__dropdown";
  dropdown.hidden = true;

  let debounceTimer = null;
  let requestSeq = 0;

  function hideDropdown() {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
  }

  function showNoResults() {
    dropdown.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "toolbar-search__empty";
    empty.textContent = t("searchNoResults");
    dropdown.appendChild(empty);
    dropdown.hidden = false;
  }

  function showResults(results) {
    dropdown.innerHTML = "";
    const list = document.createElement("div");
    list.className = "toolbar-search__list";

    results.forEach((result) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "toolbar-search__item";

      const title = document.createElement("span");
      title.className = "toolbar-search__item-title";
      title.textContent = result.title;

      const subtitle = document.createElement("span");
      subtitle.className = "toolbar-search__item-subtitle";
      const location = result.location ? ` • ${result.location}` : "";
      subtitle.textContent = `${formatSearchDate(result.start_date)}${location}`;

      item.append(title, subtitle);
      item.addEventListener("click", () => {
        input.value = "";
        hideDropdown();
        onSelect(result);
      });

      list.appendChild(item);
    });

    dropdown.appendChild(list);
    dropdown.hidden = false;
  }

  async function runSearch(rawQuery) {
    const query = rawQuery.trim();
    if (!query) {
      hideDropdown();
      return;
    }

    const currentRequest = requestSeq + 1;
    requestSeq = currentRequest;
    let results = [];
    try {
      results = await onSearch(query);
    } catch (_error) {
      hideDropdown();
      return;
    }

    if (currentRequest !== requestSeq || input.value.trim() !== query) {
      return;
    }

    if (!Array.isArray(results) || results.length === 0) {
      showNoResults();
      return;
    }

    showResults(results);
  }

  input.addEventListener("input", () => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      void runSearch(input.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key === "Escape") {
      hideDropdown();
    }
  });

  root.addEventListener("focusout", () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (!active || !root.contains(active)) {
        hideDropdown();
      }
    }, 0);
  });

  root.append(input, dropdown);
  return root;
}
