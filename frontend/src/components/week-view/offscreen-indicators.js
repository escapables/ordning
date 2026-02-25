import { t } from "../../i18n/strings.js";

function getEventBounds(el) {
  const top = parseFloat(el.style.top) || 0;
  const height = parseFloat(el.style.height) || 0;
  return { top, bottom: top + height };
}

function countOffscreen(body) {
  const scrollTop = body.scrollTop;
  const visibleBottom = scrollTop + body.clientHeight;
  const events = body.querySelectorAll(".event-block");
  let above = 0;
  let below = 0;

  events.forEach((el) => {
    const { top, bottom } = getEventBounds(el);
    if (bottom <= scrollTop) {
      above += 1;
    } else if (top >= visibleBottom) {
      below += 1;
    }
  });

  return { above, below };
}

export function mountOffscreenIndicators(wrap, body) {
  const topEl = document.createElement("div");
  topEl.className = "offscreen-indicator offscreen-indicator--top";
  topEl.hidden = true;

  const bottomEl = document.createElement("div");
  bottomEl.className = "offscreen-indicator offscreen-indicator--bottom";
  bottomEl.hidden = true;

  wrap.appendChild(topEl);
  wrap.appendChild(bottomEl);

  function update() {
    const { above, below } = countOffscreen(body);

    topEl.hidden = above === 0;
    topEl.textContent = `\u2191 ${t("offscreenMore")}`;

    bottomEl.hidden = below === 0;
    bottomEl.textContent = `\u2193 ${t("offscreenMore")}`;
  }

  body.addEventListener("scroll", update, { passive: true });

  const ro = new ResizeObserver(update);
  ro.observe(body);

  requestAnimationFrame(update);
}
