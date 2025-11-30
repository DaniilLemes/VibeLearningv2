const PRODUCT_BLOCK_BY_DIFFICULTY = {
  L: [
    "Vision: Explain the product simply (what it is and why it helps).",
    "Insight: Focus on basic user problems and the main benefits.",
    "Prioritize: Make tasks short and easy to start.",
    "Lead: Use simple, clear words; no technical talk."
  ],
  M: [
    "Vision: Define what the product is and where it's going (the strategy).",
    "Insight: Figure out what users need through talking to them and looking at data.",
    "Prioritize: Rank tasks by how much value they bring versus how hard they are to build.",
    "Lead: Keep company partners updated and the team working together."
  ],
  H: [
    "Vision: Set the long-term company direction for the product.",
    "Insight: Find hidden user problems using all available data.",
    "Prioritize: Choose the highest-impact projects across the entire product line.",
    "Lead: Handle tough decisions and keep all teams aligned on the goal."
  ]
};

let currentDifficulty = "M";

function renderProductBlockForDifficulty(level) {
  const ul = document.getElementById("icvhqn");
  if (!ul) {
    console.warn("product-block-difficulty: element #icvhqn not found");
    return;
  }

  const items = PRODUCT_BLOCK_BY_DIFFICULTY[level];
  if (!items) {
    console.warn(
      `product-block-difficulty: unknown level "${level}", expected L/M/H`
    );
    return;
  }

  ul.innerHTML = "";

  items.forEach((text, index) => {
    const li = document.createElement("li");
    li.textContent = text;
    li.classList.add("unordered-list-item");
    li.id = `product-block-${level}-${index}`;
    ul.appendChild(li);
  });
}

/**
 * @param {"L"|"M"|"H"} level
 */
function setProductDifficulty(level) {
  const normalized = (level || "").toUpperCase();
  if (!["L", "M", "H"].includes(normalized)) {
    console.warn(
      `setProductDifficulty: invalid level "${level}", falling back to "M"`
    );
    currentDifficulty = "M";
  } else {
    currentDifficulty = normalized;
  }

  renderProductBlockForDifficulty(currentDifficulty);
}

document.addEventListener("DOMContentLoaded", () => {
  renderProductBlockForDifficulty(currentDifficulty);
});

window.setProductDifficulty = setProductDifficulty;
