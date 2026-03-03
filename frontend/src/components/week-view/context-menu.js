import { t } from "../../i18n/strings.js";

function openContextMenu(event, items) {
  event.preventDefault();
  event.stopPropagation();

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.role = "menu";

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "context-menu__item";
    if (item.danger) {
      button.classList.add("context-menu__item--danger");
    }
    button.textContent = item.label;
    button.addEventListener("click", () => {
      close();
      void item.action();
    });
    menu.appendChild(button);
  });

  const close = () => {
    menu.remove();
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", close);
  };

  const onDocumentClick = (clickEvent) => {
    if (menu.contains(clickEvent.target)) {
      return;
    }
    close();
  };

  const onKeyDown = (keyboardEvent) => {
    if (keyboardEvent.key === "Escape") {
      close();
    }
  };

  const openedAt = Date.now();
  const onScroll = () => {
    if (Date.now() - openedAt < 200) {
      return;
    }
    close();
  };

  document.body.appendChild(menu);
  const x = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8);
  const y = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;

  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", close);
}

export function openEventContextMenu(event, detail, handlers = {}) {
  const {
    onOpen = () => {},
    onDelete = () => {},
    onCopy = () => {}
  } = handlers;

  openContextMenu(event, [
    { label: t("contextMenuOpen"), action: () => onOpen(detail.id) },
    { label: t("contextMenuDelete"), danger: true, action: () => onDelete(detail) },
    { label: t("contextMenuCopy"), action: () => onCopy(detail) }
  ]);
}

export function openSlotContextMenu(event, detail, handlers = {}) {
  const {
    onCreate = () => {},
    onPaste = () => {},
    canPaste = () => false
  } = handlers;
  const items = [{ label: t("contextMenuNewEvent"), action: () => onCreate(detail) }];
  if (canPaste()) {
    items.push({ label: t("contextMenuPaste"), action: () => onPaste(detail) });
  }

  openContextMenu(event, items);
}
