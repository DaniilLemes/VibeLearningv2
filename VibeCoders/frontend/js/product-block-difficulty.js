// Тексты по уровням сложности
const PRODUCT_BLOCK_BY_DIFFICULTY = {
  L: [
    "Explain the product in simple words.",
    "Focus on basic user needs and benefits.",
    "Keep tasks short and easy to follow.",
    "Use clear language and avoid jargon."
  ],
  M: [
    // твой оригинальный текст
    "Define product vision and shape the strategy.",
    "Understand user needs through interviews, surveys, and data analysis.",
    "Prioritize tasks based on value and complexity.",
    "Communicate with stakeholders and keep the team aligned."
  ],
  H: [
    "Craft a long-term product vision aligned with business objectives.",
    "Synthesize qualitative and quantitative insights to uncover deep user problems.",
    "Model impact vs. effort to drive portfolio-level prioritization.",
    "Facilitate cross-functional alignment and manage strategic trade-offs."
  ]
};

let currentDifficulty = "M";

/**
 * Внутренняя функция: перерисовать список под нужный уровень
 */
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
    // если у тебя был класс — добавь его
    li.classList.add("unordered-list-item");
    li.id = `product-block-${level}-${index}`;
    ul.appendChild(li);
  });
}

/**
 * Публичная функция:
 * вызывать её из любого места, где у тебя есть уровень сложности
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

// Авто-рендер при загрузке страницы (дефолт — M)
document.addEventListener("DOMContentLoaded", () => {
  renderProductBlockForDifficulty(currentDifficulty);
});

// Делаем функцию доступной глобально
window.setProductDifficulty = setProductDifficulty;
