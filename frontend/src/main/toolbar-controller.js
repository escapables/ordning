import { renderToolbar } from "../components/toolbar/toolbar.js";

import { invoke } from "./invoke.js";
import { createManualSaveController } from "./manual-save.js";

function normalizeSearchSelect(handler) {
  return typeof handler === "function" ? handler : async () => {};
}

export function createToolbarController(options = {}) {
  const {
    toolbarContainer,
    getWeekStart = () => new Date(),
    onPreviousWeek = async () => {},
    onNextWeek = async () => {},
    onToday = async () => {},
    onSearchSelect
  } = options;

  const handleSearchSelect = normalizeSearchSelect(onSearchSelect);
  const saveController = createManualSaveController({
    invoke,
    onChange: () => {
      render(getWeekStart());
    }
  });

  function render(weekStart = getWeekStart()) {
    toolbarContainer.replaceChildren(
      renderToolbar({
        weekStart,
        onPreviousWeek,
        onNextWeek,
        onToday,
        ...saveController.getToolbarProps(),
        onSearch: async (query) => invoke("search_events", { query }),
        onSearchSelect: async (result) => {
          if (!result?.id || !result?.start_date) {
            return;
          }
          await handleSearchSelect(result);
        }
      })
    );
  }

  return {
    dispose: saveController.dispose,
    render,
    sync: () => saveController.sync()
  };
}
