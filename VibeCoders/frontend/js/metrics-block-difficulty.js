// metrics-block-difficulty.js

// Texts for paragraph + tip by difficulty level
const METRICS_BLOCK_BY_DIFFICULTY = {
  L: {
    paragraph:
      "Focus on what helps users the most. Use a few simple numbers to see if things get better or worse.",
    tip:
      "Pick one main number to watch, like how many users come back. Make sure your work helps this number grow."
  },
  M: {
    paragraph:
      "Focus on user value. Metrics help measure progress and guide decisions. Separate metrics into product (activation, retention, engagement) and business (revenue, margin).",
    tip:
      "Start with a North Star Metric: one key metric that reflects the value users receive. All initiatives should move this metric."
  },
  H: {
    paragraph:
      "Anchor decisions in user value. Design a metrics hierarchy that links product indicators (activation, retention, engagement, NPS) with business outcomes (revenue, margin, LTV, CAC). Use these to run experiments and guide portfolio bets.",
    tip:
      "Define a North Star Metric tightly coupled to long-term value (e.g., weekly active teams, completed key workflows). Align all roadmaps and experiments to move this metric while monitoring guardrail metrics."
  }
};


function getMetricsBlockEls() {
  const paragraphEl = document.getElementById("imtlk6");
  const tipBoxEl = document.getElementById("i6px19");
  const tipTextEl = document.getElementById("inl04k");
  if (!paragraphEl) {
    console.warn("metrics-block-difficulty: #imtlk6 not found");
  }
  if (!tipBoxEl) {
    console.warn("metrics-block-difficulty: #i6px19 not found");
  }
  if (!tipTextEl) {
    console.warn("metrics-block-difficulty: #inl04k not found");
  }

  return { paragraphEl, tipBoxEl, tipTextEl };
}

/**
 * Render paragraph + tip for a given difficulty level
 * @param {"L"|"M"|"H"} level
 */
function renderMetricsBlockForDifficulty(level) {
  const normalized = (level || "").toUpperCase();
  const finalLevel = ["L", "M", "H"].includes(normalized) ? normalized : "M";

  const config = METRICS_BLOCK_BY_DIFFICULTY[finalLevel];
  if (!config) return;

  const { paragraphEl, tipTextEl } = getMetricsBlockEls();

  if (paragraphEl) {
    paragraphEl.textContent = config.paragraph;
  }

  if (tipTextEl) {
    tipTextEl.textContent = config.tip;
  }
}


function setMetricsAttentionState(state) {
  const { paragraphEl, tipBoxEl } = getMetricsBlockEls();
  if (!paragraphEl && !tipBoxEl) return;

  const normalized = String(state || "").toLowerCase();
  const shouldHighlight = normalized === "low";

  const els = [paragraphEl, tipBoxEl].filter(Boolean);

  els.forEach((el) => {
    if (shouldHighlight) {
      el.classList.add("attention-low");
      el.dataset.attention = "low";
    } else {
      el.classList.remove("attention-low");
      el.dataset.attention = "ok";
    }
  });
}

window.setMetricsAttentionState = setMetricsAttentionState;

// Wrap existing global setProductDifficulty so **one call** updates both blocks
(function () {
  const originalSetProductDifficulty = window.setProductDifficulty;

  function setProductDifficultyWithMetrics(level) {
    // Call original (changes other blocks: product, discovery, etc.)
    if (typeof originalSetProductDifficulty === "function") {
      originalSetProductDifficulty(level);
    }

    // Then update metrics paragraph + tip
    renderMetricsBlockForDifficulty(level);
  }

  // Replace global function with extended version
  window.setProductDifficulty = setProductDifficultyWithMetrics;

  // Initial render on page load (default M)
  document.addEventListener("DOMContentLoaded", () => {
    renderMetricsBlockForDifficulty("M");
    // setMetricsAttentionState("ok"); // если хочешь явно сбросить подсветку
  });
})();
