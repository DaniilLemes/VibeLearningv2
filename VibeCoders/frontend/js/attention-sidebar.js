// attention-sidebar.js

let rootEl;
let percentEl;
let knobEl;
let markerEl;

function initRefs() {
  if (rootEl) return;

  rootEl = document.getElementById("iabRoot");
  percentEl = document.getElementById("iabPercent");
  knobEl = document.getElementById("iabKnob");
  markerEl = document.getElementById("iabMarker");

  if (!rootEl || !percentEl) {
    console.warn("[AttentionSidebar] #iabRoot or #iabPercent not found");
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Обновляет UI концентрации.
 * Ожидает:
 *   state.concentration       0–1 или 0–100
 *   state.concentration_level "L" | "M" | "H" (опционально)
 */
export function updateAttentionSidebar(state) {
  if (!state) return;

  initRefs();
  if (!rootEl || !percentEl) return;

  let conc = state.concentration;

  if (typeof conc !== "number" || Number.isNaN(conc)) {
    console.warn("[AttentionSidebar] Invalid concentration:", conc);
    return;
  }

  // Если приходит 0–1 — переводим в проценты.
  if (conc <= 1) {
    conc = conc * 100;
  }

  const percent = clamp(Math.round(conc), 0, 100);

  // Обновляем CSS-переменную, от которой должен зависеть бар
  rootEl.style.setProperty("--iab-level", String(percent));

  // Если хочешь оставить отдельный текст:
  percentEl.textContent = `${percent}%`;

  // Определяем L/M/H (если бэк не прислал)
  let level = state.concentration_level;
  if (!level) {
    if (percent >= 75) level = "H";
    else if (percent >= 50) level = "M";
    else level = "L";
  }

  level = String(level).toUpperCase();
  rootEl.dataset.level = level;

  // считаем позицию сверху (0% = низ, 100% = верх)
  const topPos = (100 - percent) + "%";

  // Обновляем синий кружок
  if (knobEl) {
    knobEl.textContent = `${percent}%`; // цифра внутри
    knobEl.style.top = topPos;
  }

  // Обновляем маркер вдоль линии
  if (markerEl) {
    markerEl.style.top = topPos;
  }
}
