import { EEGService } from "./eegService.js";
import { updateAttentionSidebar } from "./attention-sidebar.js";

// ==== UI вспомогательные функции ====
const calmModal = document.getElementById("calm-modal");
const calmModalActionButton = calmModal?.querySelector(".calm-modal__action");
const calmModalDismissButton = calmModal?.querySelector(
  ".calm-modal__dismiss"
);
const calmModalCloseButton = calmModal?.querySelector(".calm-modal__close");
const calmModalBackdrop = calmModal?.querySelector(".calm-modal__backdrop");

function setTextDifficulty(level) {
  // level: "easy" | "normal" | "hard"
  let difficultyLetter;

  switch ((level || "").toLowerCase()) {
    case "easy":
      difficultyLetter = "L";
      break;
    case "normal":
      difficultyLetter = "M";
      break;
    case "hard":
      difficultyLetter = "H";
      break;
    default:
      difficultyLetter = "M"; // fallback
      console.warn("[UI] Unknown difficulty:", level, "→ using M");
      break;
  }

  if (typeof window.setProductDifficulty === "function") {
    window.setProductDifficulty(difficultyLetter);
  } else {
    console.warn("[UI] window.setProductDifficulty is not defined");
  }
}

function showFocusModal() {
  if (!calmModal) return;

  calmModal.classList.add("is-visible");
  calmModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function hideFocusModal() {
  if (!calmModal) return;

  calmModal.classList.remove("is-visible");
  calmModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

calmModalActionButton?.addEventListener("click", hideFocusModal);
calmModalDismissButton?.addEventListener("click", hideFocusModal);
calmModalCloseButton?.addEventListener("click", hideFocusModal);
calmModalBackdrop?.addEventListener("click", hideFocusModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && calmModal?.classList.contains("is-visible")) {
    hideFocusModal();
  }
});
// =====================================================

function handleAdaptationAction(action, state) {
  // Базовые 4 типа:
  //  - "no_change"
  //  - "text_harder"
  //  - "text_easier"
  //  - "focus_modal"
  //
  // Плюс:
  //  - "easier_with_pause"
  //  - "continue_harder"
  //  - "continue" (дефолт)
  console.log("[EEG] Adaptation action:", action, "state:", state);

  switch (action) {
    case "no_change":
    case "continue":
      // ничего не делаем с текстом
      break;

    case "text_harder":
    case "continue_harder":
      setTextDifficulty("hard");
      break;

    case "text_easier":
      setTextDifficulty("easy");
      break;

    case "focus_modal":
      showFocusModal();
      break;

    case "easier_with_pause":
      setTextDifficulty("easy");
      showFocusModal();
      break;

    default:
      console.warn("[EEG] Unknown action from backend:", action);
      break;
  }
}
console.log("[DEBUG] EEGService created, starting...");

// === NEW: храним последний стейт от EEG ===
let lastEEGState = null;

// Небольший хелпер: достать проценты концентрации из стейта
function getConcentrationPercent(state) {
  if (!state || typeof state.concentration !== "number") return null;
  let conc = state.concentration;
  if (conc <= 1) conc = conc * 100;
  const percent = Math.max(0, Math.min(100, Math.round(conc)));

  console.log("[DEBUG] EEG concentration percent:", percent);
  return percent;
}

const eegService = new EEGService({
  baseUrl: "http://localhost:8000",
  pollIntervalMs: 1000,
  onState: (state) => {
    // 1) Лог (можно потом убрать)
    console.log("EEG state:", {
      stress: state.stress,
      concentration: state.concentration,
      fatigue: state.fatigue,
      flow: state.flow,
      overload: state.overload,
      action: state.action,
    });

    // NEW: кешируем последний стейт
    lastEEGState = state;

    // 2) Обновляем UI концентрации (бар, проценты и т.п.)
    updateAttentionSidebar(state);

    // 3) (опционально) можно ещё и здесь крутить сложность по concentration_level
    // if (state.concentration_level) {
    //   const levelMap = { L: "easy", M: "normal", H: "hard" };
    //   const uiLevel = levelMap[state.concentration_level] || "normal";
    //   setTextDifficulty(uiLevel);
    // }
  },
  onAction: (action, state) => {
    handleAdaptationAction(action, state);
  },
  onError: (err) => {
    console.warn("EEG error:", err.message);
  },
});

eegService.start();

window.addEventListener("beforeunload", () => {
  eegService.stop();
});

// ================= Gaze часть =================
const ws = new WebSocket("ws://localhost:8080");

ws.onopen = () => {
  console.log("Connected to gaze relay");
};

function elementFromGazePoint(point) {
  if (!point) return null;

  let { x, y } = point;
  console.log("[DEBUG] raw gaze:", x, y);

  let clientX;
  let clientY;

  // Вариант 1: нормализованные координаты 0..1
  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
    clientX = x * window.innerWidth;
    clientY = y * window.innerHeight;
  } else {
    // Вариант 2: уже пиксели (например, относительные к окну)
    clientX = x;
    clientY = y;
  }

  console.log(
    "[DEBUG] computed client coords:",
    clientX,
    clientY,
    "| viewport:",
    window.innerWidth,
    window.innerHeight
  );

  // Если точка точно вне вьюпорта — заранее скажем
  if (
    clientX < 0 ||
    clientX > window.innerWidth ||
    clientY < 0 ||
    clientY > window.innerHeight
  ) {
    console.warn("[DEBUG] gaze point outside viewport, elementFromPoint → null");
    return null;
  }

  const el = document.elementFromPoint(clientX, clientY);
  console.log("[DEBUG] elementFromPoint result:", el);
  return el;
}


// NEW: проверка, что мы сейчас смотрим на discovery-блок
function isGazeOnDiscoveryBlock(el) {
  if (!el) return false;
  const discoveryContainer = document.getElementById("ij320g"); // <ol> из discovery-block
  if (!discoveryContainer) {
    console.warn("[DEBUG] Discovery container #ij320g not found");
    return false;
  }

  const result = el === discoveryContainer || !!el.closest("#ij320g");
  // можно залогать, чтобы видеть, что реально под взглядом
  console.log(
    "[DEBUG] isGazeOnDiscoveryBlock:",
    result,
    "| el:",
    el,
    "| closest:",
    el && el.closest && el.closest("#ij320g")
  );
  return result;
}

// Проверка, что мы сейчас смотрим на metrics-блок (paragraph или Tip)
function isGazeOnMetricsBlock(el) {
  if (!el) return false;

  const paragraphEl = document.getElementById("imtlk6");
  const tipBoxEl = document.getElementById("i6px19");

  if (!paragraphEl && !tipBoxEl) {
    console.warn("[DEBUG] Metrics block elements not found (#imtlk6 / #i6px19)");
    return false;
  }

  const container =
    paragraphEl?.closest(".lecture-content") ||
    tipBoxEl?.closest(".lecture-content") ||
    paragraphEl ||
    tipBoxEl;

  const result =
    (paragraphEl && (el === paragraphEl || !!el.closest("#imtlk6"))) ||
    (tipBoxEl && (el === tipBoxEl || !!el.closest("#i6px19")));

  console.log("[DEBUG] isGazeOnMetricsBlock:", result, "| el:", el);

  return result;
}



// NEW: простая логика подсветки discovery по gaze + концентрации
function updateDiscoveryHighlightFromGaze(el) {
  if (typeof window.setDiscoveryAttentionState !== "function") {
    console.warn("[DEBUG] setDiscoveryAttentionState not defined yet");
    return;
  }

  if (!isGazeOnDiscoveryBlock(el)) {
    // можно раскомментировать, если хочешь видеть, когда взгляд НЕ на блоке
    // console.log("[DEBUG] Gaze not on discovery block");
    return;
  }

  const percent = getConcentrationPercent(lastEEGState);
  if (percent == null) {
    console.warn("[DEBUG] No EEG percent yet (lastEEGState is null?)");
    return;
  }

  const LOW_THRESHOLD = 50;  // ниже — считаем "низкая концентрация"
  const OK_THRESHOLD = 60;   // выше — явно норм/высокая

  console.log(
    "[DEBUG] Discovery highlight check → percent:",
    percent,
    "LOW_THRESHOLD:",
    LOW_THRESHOLD,
    "OK_THRESHOLD:",
    OK_THRESHOLD
  );

  if (percent < LOW_THRESHOLD) {
    console.log("[DEBUG] → setDiscoveryAttentionState('low')");
    window.setDiscoveryAttentionState("low");
  } else if (percent >= OK_THRESHOLD) {
    console.log("[DEBUG] → setDiscoveryAttentionState('ok')");
    window.setDiscoveryAttentionState("ok");
  } else {
    console.log("[DEBUG] → between thresholds, no change");
  }
}

function updateMetricsHighlightFromGaze(el) {
  if (typeof window.setMetricsAttentionState !== "function") {
    console.warn("[DEBUG] setMetricsAttentionState not defined yet");
    return;
  }

  if (!isGazeOnMetricsBlock(el)) {
    return;
  }

  const percent = getConcentrationPercent(lastEEGState);
  if (percent == null) {
    console.warn("[DEBUG] No EEG percent yet (lastEEGState is null?)");
    return;
  }

  const LOW_THRESHOLD = 50;  // ниже — считаем "низкая концентрация"
  const OK_THRESHOLD = 60;   // выше — явно норм/высокая

  console.log(
    "[DEBUG] Metrics highlight check → percent:",
    percent,
    "LOW_THRESHOLD:",
    LOW_THRESHOLD,
    "OK_THRESHOLD:",
    OK_THRESHOLD
  );

  if (percent < LOW_THRESHOLD) {
    console.log("[DEBUG] Metrics → setMetricsAttentionState('low')");
    window.setMetricsAttentionState("low");
  } else if (percent >= OK_THRESHOLD) {
    console.log("[DEBUG] Metrics → setMetricsAttentionState('ok')");
    window.setMetricsAttentionState("ok");
  } else {
    console.log("[DEBUG] Metrics → between thresholds, no change");
  }
}



ws.onmessage = (event) => {
  const point = JSON.parse(event.data); // { x: ..., y: ... }
  const el = elementFromGazePoint(point);

  console.log("[DEBUG] Gaze:", point, "→ element:", el);

  updateDiscoveryHighlightFromGaze(el);
  updateMetricsHighlightFromGaze(el);
};

ws.onerror = (e) => {
  console.error("WS error:", e);
};

ws.onclose = () => {
  console.log("WS closed");
};
