import { EEGService } from "./eegService.js";

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
  console.log("[UI] setTextDifficulty:", level);
  // TODO: тут переключаешь версии текста / упражнений
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
