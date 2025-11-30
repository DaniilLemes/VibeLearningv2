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

// ===== Scroll-based progress tracking for lecture sections =====
const sectionHeadings = Array.from(
  document.querySelectorAll(".lecture-content .heading-h2")
);
const lessonItems = Array.from(
  document.querySelectorAll(".lesson-list .lesson-item")
);
const progressPercentLabel = document.querySelector(".progress-percent");
const progressBar = document.querySelector(".progress-bar");

const lessonIcons = {
  completed: "https://api.iconify.design/lucide-check-circle-2.svg?color=%2316a34a",
  pending: "https://api.iconify.design/lucide-circle.svg?color=%2364748b",
};

function updateProgressUI(completed, total) {
  const safeTotal = total || 1; // avoid division by zero
  const percent = Math.round((completed / safeTotal) * 100);

  if (progressPercentLabel) {
    progressPercentLabel.textContent = `${percent}%`;
  }

  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
}

function setLessonCompleted(lessonItem, completed) {
  const icon = lessonItem.querySelector(".lesson-status-icon");

  if (!icon) return;

  lessonItem.classList.toggle("lesson-item--completed", completed);
  icon.src = completed ? lessonIcons.completed : lessonIcons.pending;
  icon.alt = completed ? "Completed section" : "Incomplete section";
}

function updateLessonsProgress() {
  const totalTrackable = Math.min(lessonItems.length, sectionHeadings.length);
  let completedCount = 0;

  for (let index = 0; index < totalTrackable; index++) {
    const heading = sectionHeadings[index];
    const lessonItem = lessonItems[index];

    if (!heading || !lessonItem) continue;

    const headingTop = heading.getBoundingClientRect().top;
    const isCompleted = headingTop < 0;

    setLessonCompleted(lessonItem, isCompleted);

    if (isCompleted) {
      completedCount += 1;
    }
  }

  updateProgressUI(completedCount, totalTrackable);
}

if (sectionHeadings.length && lessonItems.length) {
  window.addEventListener("scroll", updateLessonsProgress, { passive: true });
  updateLessonsProgress();
}
