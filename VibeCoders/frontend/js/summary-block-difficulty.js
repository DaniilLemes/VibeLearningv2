// Texts for the summary paragraph by difficulty level
const SUMMARY_BLOCK_BY_DIFFICULTY = {
  L: {
    paragraph:
      "The product manager makes sure the team builds things that really help users. Listen to users, check simple results, and slowly make the product better."
  },
  M: {
    paragraph:
      "The product manager finds and validates value, then delivers it. Focus on user needs, measure outcomes, and iteratively improve the product."
  },
  H: {
    paragraph:
      "The product manager systematically discovers valuable opportunities, validates them with evidence, and orchestrates delivery. Focus on deep user needs, define clear outcome metrics, and drive continuous iteration across the product lifecycle."
  }
};

/**
 * Render summary paragraph for a given difficulty
 * @param {"L"|"M"|"H"} level
 */
function renderSummaryBlockForDifficulty(level) {
  const normalized = (level || "").toUpperCase();
  const finalLevel = ["L", "M", "H"].includes(normalized) ? normalized : "M";

  const cfg = SUMMARY_BLOCK_BY_DIFFICULTY[finalLevel];
  if (!cfg) return;

  const paragraphEl = document.getElementById("iuw9sa");
  if (!paragraphEl) {
    console.warn("summary-block-difficulty: #iuw9sa not found");
    return;
  }

  paragraphEl.textContent = cfg.paragraph;
}

// Wrap global setProductDifficulty so this summary updates too
(function () {
  const prevSetProductDifficulty = window.setProductDifficulty;

  function setProductDifficultyWithSummary(level) {
    if (typeof prevSetProductDifficulty === "function") {
      prevSetProductDifficulty(level);
    }
    renderSummaryBlockForDifficulty(level);
  }

  window.setProductDifficulty = setProductDifficultyWithSummary;

  document.addEventListener("DOMContentLoaded", () => {
    renderSummaryBlockForDifficulty("M");
  });
})();
