export function positionDropdown(dropdown, anchor) {
  const portal = anchor.closest("dialog") || document.body;
  portal.appendChild(dropdown);

  const anchorRect = anchor.getBoundingClientRect();
  const portalRect = portal.getBoundingClientRect();

  dropdown.style.position = "absolute";
  dropdown.style.left = `${anchorRect.left - portalRect.left}px`;
  dropdown.style.top = `${anchorRect.bottom - portalRect.top + 6}px`;
  dropdown.style.minWidth = `${anchorRect.width}px`;
}
