import { EEGService } from "./eegService.js";

// ==== Заглушки, сюда потом прикрутишь реальный UI ====
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

window.setProductDifficulty(difficultyLetter);
}

function showFocusModal() {
  console.log("[UI] showFocusModal");
  // TODO: показать модалку "сделай вдох/выдох, сфокусируйся", затем спрятать
}

function hideFocusModal() {
  console.log("[UI] hideFocusModal");
  // TODO: спрятать модалку, если она открыта
}
// =====================================================

function handleAdaptationAction(action, state) {
  // Базовые 4 типа:
  //  - "no_change"
  //  - "text_harder"
  //  - "text_easier"
  //  - "focus_modal"
  //
  // Плюс из твоей логики:
  //  - "easier_with_pause"
  //  - "continue_harder"
  //  - "continue" (дефолт)
  console.log("[EEG] Adaptation action:", action, "state:", state);

  // На всякий случай сначала прячем фокус-модалку,
  // а потом включаем, если нужно
  hideFocusModal();

  switch (action) {
    case "no_change":
    case "continue":
      // Ничего не трогаем, возможно просто обновляем индикаторы
      // current difficulty stays
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
      showFocusModal(); // можно использовать ту же модалку как "передышку"
      break;

    default:
      console.warn("[EEG] Unknown action from backend:", action);
      break;
  }
}

const eegService = new EEGService({
  baseUrl: "http://localhost:8000",
  pollIntervalMs: 1000, // можешь потом уменьшить до 300–500 мс
  onState: (state) => {
    // просто лог в реальном времени, плюс сюда можно повесить графики
    console.log("EEG state:", {
      stress: state.stress,
      concentration: state.concentration,
      fatigue: state.fatigue,
      flow: state.flow,
      overload: state.overload,
      action: state.action,
    });
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

// Gaze часть оставляем как есть
const ws = new WebSocket("ws://localhost:8080");

ws.onopen = () => {
  console.log("Connected to gaze relay");
};

ws.onmessage = (event) => {
  const point = JSON.parse(event.data);
  console.log("Gaze coords:", { x: point.x, y: point.y });
};

ws.onerror = (e) => {
  console.error("WS error:", e);
};

ws.onclose = () => {
  console.log("WS closed");
};
