// Texts for prioritization paragraph + RICE example by difficulty level
const PRIORITIZATION_BLOCK_BY_DIFFICULTY = {
  L: {
    paragraph:
      "Use a simple score to compare ideas. Look at how many users it helps, how big the benefit is, and how hard it is to build.",
    code: `Reach: 200 users / month
Impact: 1 (small)
Confidence: 0.6
Effort: 1 person-week

RICE = (200 * 1 * 0.6) / 1 = 120`
  },
  M: {
    paragraph:
      "Use RICE or ICE frameworks to compare ideas, considering impact, confidence, and effort. Transparency of criteria keeps the team aligned.",
    code: `Reach: 2,000 users / quarter
Impact: 2 (moderate)
Confidence: 0.7
Effort: 2 person-weeks

RICE = (2000 * 2 * 0.7) / 2 = 1400`
  },
  H: {
    paragraph:
      "Use structured frameworks like RICE or ICE to prioritize opportunities. Combine Reach, Impact, Confidence, and Effort into a comparable score to expose trade-offs and avoid opinion-driven decisions.",
    code: `Reach: 10,000 users / quarter
Impact: 3 (high)
Confidence: 0.8
Effort: 4 person-weeks

RICE = (10000 * 3 * 0.8) / 4 = 6000

# Use RICE to sort ideas, then pressure-test with constraints and dependencies.`
  }
};

/**
 * Render paragraph + RICE code example for a given difficulty
 * @param {"L"|"M"|"H"} level
 */
function renderPrioritizationBlockForDifficulty(level) {
  const normalized = (level || "").toUpperCase();
  const finalLevel = ["L", "M", "H"].includes(normalized) ? normalized : "M";

  const cfg = PRIORITIZATION_BLOCK_BY_DIFFICULTY[finalLevel];
  if (!cfg) return;

  const paragraphEl = document.getElementById("iz0ibc");
  const codeEl = document.getElementById("ix6d4j");

  if (!paragraphEl) {
    console.warn("prioritization-block-difficulty: #iz0ibc not found");
  } else {
    paragraphEl.textContent = cfg.paragraph;
  }

  if (!codeEl) {
    console.warn("prioritization-block-difficulty: #ix6d4j not found");
  } else {
    codeEl.textContent = cfg.code;
  }
}

// Wrap global setProductDifficulty so one call updates ALL blocks including this one
(function () {
  const prevSetProductDifficulty = window.setProductDifficulty;

  function setProductDifficultyWithPrioritization(level) {
    if (typeof prevSetProductDifficulty === "function") {
      prevSetProductDifficulty(level);
    }
    renderPrioritizationBlockForDifficulty(level);
  }

  window.setProductDifficulty = setProductDifficultyWithPrioritization;

  document.addEventListener("DOMContentLoaded", () => {
    renderPrioritizationBlockForDifficulty("M");
  });
})();
