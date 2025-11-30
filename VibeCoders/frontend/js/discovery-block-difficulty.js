// discovery-block-difficulty.js

// Texts for the ordered list by difficulty level
const DISCOVERY_BLOCK_BY_DIFFICULTY = {
  L: [
    "Guess what problem the user might have.",
    "Talk to a few users and listen to their stories.",
    "Check your guesses with simple numbers or quick tests.",
    "Group users by simple types and what they want to achieve."
  ],
  M: [
    "Form hypotheses about the user problem.",
    "Conduct qualitative interviews to uncover insights.",
    "Validate hypotheses with quantitative data.",
    "Identify user segments and their jobs-to-be-done."
  ],
  H: [
    "Form structured hypotheses about user problems and root causes.",
    "Run in-depth qualitative research (interviews, field studies) to uncover patterns and mental models.",
    "Validate and size opportunities using quantitative data, experiments, and behavioral analytics.",
    "Define precise user segments and jobs-to-be-done to guide positioning and roadmap."
  ]
};

function getDiscoveryListEl() {
  const ol = document.getElementById("ij320g");
  if (!ol) {
    console.warn("discovery-block-difficulty: #ij320g not found");
  }
  return ol;
}

function renderDiscoveryBlockForDifficulty(level) {
  const normalized = (level || "").toUpperCase();
  const finalLevel = ["L", "M", "H"].includes(normalized) ? normalized : "M";

  const steps = DISCOVERY_BLOCK_BY_DIFFICULTY[finalLevel];
  if (!steps) return;

  const ol = getDiscoveryListEl();
  if (!ol) return;

  // ⚠️ ВАЖНО: не трогаем классы/атрибуты самого <ol>,
  // только содержимое → подсветка останется
  ol.innerHTML = "";

  // Rebuild list items
  steps.forEach((text, index) => {
    const li = document.createElement("li");
    li.textContent = text;
    li.classList.add("ordered-list-item"); // optional, for styling
    li.id = `discovery-step-${finalLevel}-${index}`;
    ol.appendChild(li);
  });
}

/**
 * Поставить/убрать нежно-голубую подсветку для discovery-блока.
 *
 * state: "low"   → пользователь читал с низкой концентрацией, подсветить
 *        "ok"    → прочитал нормально/высоко, убрать подсветку
 *        "clear" → alias для "ok"
 */
function setDiscoveryAttentionState(state) {
  const ol = getDiscoveryListEl();
  if (!ol) return;

  const normalized = String(state || "").toLowerCase();

  if (normalized === "low") {
    ol.classList.add("attention-low");
    ol.dataset.attention = "low";
  } else {
    // "ok", "clear", что угодно другое — убираем подсветку
    ol.classList.remove("attention-low");
    ol.dataset.attention = "ok";
  }
}

// Экспортируем в глобал, чтобы можно было дергать из EEG/гейз-логики
window.setDiscoveryAttentionState = setDiscoveryAttentionState;

// Wrap global setProductDifficulty again so one call updates ALL blocks
(function () {
  const prevSetProductDifficulty = window.setProductDifficulty;

  function setProductDifficultyWithDiscovery(level) {
    if (typeof prevSetProductDifficulty === "function") {
      prevSetProductDifficulty(level);
    }
    renderDiscoveryBlockForDifficulty(level);
  }

  window.setProductDifficulty = setProductDifficultyWithDiscovery;

  document.addEventListener("DOMContentLoaded", () => {
    // дефолтная сложность
    renderDiscoveryBlockForDifficulty("M");

    // если хочешь стартовое состояние подсветки, можно тут:
    // setDiscoveryAttentionState("ok");
  });
})();
