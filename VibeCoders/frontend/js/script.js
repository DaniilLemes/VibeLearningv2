import { EEGService } from "./eegService.js";

const eegService = new EEGService({
  baseUrl: "http://localhost:8000",
  pollIntervalMs: 1000, // раз в секунду, можешь сделать 200–500 мс
  onState: (state) => {
    // просто лог в реальном времени
    console.log("EEG state:", state);

    // Пример: можно отдельно выводить:
    // console.log("stress:", state.stress, "concentration:", state.concentration);
  },
  onError: (err) => {
    console.warn("EEG error:", err.message);
  },
});

eegService.start();

// Если у тебя есть хук на закрытие урока / страницы:
window.addEventListener("beforeunload", () => {
  eegService.stop();
});


const ws = new WebSocket("ws://localhost:8080");

ws.onopen = () => {
  console.log("Connected to relay");
};

ws.onmessage = (event) => {
  const point = JSON.parse(event.data);

  // Если GazeX/GazeY уже в пикселях — это и есть координаты
  // Если 0..1 — это нормализованные, можно просто смотреть на них как на долю экрана
  console.log("Gaze coords:", {
    x: point.x,
    y: point.y,
  });
};

ws.onerror = (e) => {
  console.error("WS error:", e);
};

ws.onclose = () => {
  console.log("WS closed");
};



