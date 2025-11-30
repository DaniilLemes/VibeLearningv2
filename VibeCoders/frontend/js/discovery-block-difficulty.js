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

function renderDiscoveryBlockForDifficulty(level) {
  const normalized = (level || "").toUpperCase();
  const finalLevel = ["L", "M", "H"].includes(normalized) ? normalized : "M";

  const steps = DISCOVERY_BLOCK_BY_DIFFICULTY[finalLevel];
  if (!steps) return;

  const ol = document.getElementById("ij320g");
  if (!ol) {
    console.warn("discovery-block-difficulty: #ij320g not found");
    return;
  }

  // Clear current list
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
    renderDiscoveryBlockForDifficulty("M");
  });
})();
