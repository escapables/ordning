import { applyTemplateToFields } from "./event-template-search-apply.js";
import { createEventTemplateSearchDropdown } from "./event-template-search-dropdown.js";
import {
  collapseResults,
  formatResultSubtitle,
  getCalendarColor,
  MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS
} from "./event-template-search-formatters.js";

export function createEventTemplateSearch({
  invoke,
  showError,
  clearError,
  applyAllDayState,
  titleField,
  fields
}) {
  const { titleInput } = fields;

  let enabled = false;
  let debounceTimer = null;
  let requestSeq = 0;
  let selecting = false;

  const dropdown = createEventTemplateSearchDropdown({
    titleField,
    titleInput,
    getCalendarColor,
    formatResultSubtitle,
    isEnabled: () => enabled,
    onSelectResult: (result) => selectResult(result)
  });

  function reset() {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    requestSeq += 1;
    dropdown.hideDropdown();
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    if (!enabled) {
      reset();
    }
  }

  async function selectResult(result) {
    if (!result?.id || selecting) {
      return;
    }

    selecting = true;
    clearError();

    try {
      const templateEvent = await invoke("get_event", { id: result.id });
      applyTemplateToFields({
        result,
        templateEvent,
        fields,
        applyAllDayState
      });
      reset();
    } catch (error) {
      showError(String(error));
    } finally {
      selecting = false;
    }
  }

  async function runSearch(rawQuery) {
    if (!enabled) {
      return;
    }

    const query = String(rawQuery || "").trim();
    if (query.length < MIN_QUERY_LENGTH) {
      dropdown.hideDropdown();
      return;
    }

    const currentRequest = requestSeq + 1;
    requestSeq = currentRequest;

    let nextResults = [];
    try {
      nextResults = collapseResults(await invoke("search_events", { query }));
    } catch (_error) {
      dropdown.hideDropdown();
      return;
    }

    if (currentRequest !== requestSeq || titleInput.value.trim() !== query) {
      return;
    }

    dropdown.setResults(nextResults);
  }

  titleInput.addEventListener("input", () => {
    if (!enabled) {
      return;
    }

    clearError();

    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      void runSearch(titleInput.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  return {
    reset,
    setEnabled
  };
}
