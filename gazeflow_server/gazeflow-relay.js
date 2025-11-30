// gazeflow-relay.js
// Node-сервер:
// 1) Подключается по WebSocket к локальному GazeFlow/GazePointer (UPSTREAM_URL)
// 2) Слушает данные взгляда
// 3) Рассылает всем браузерам только точку { x, y }

const http = require("http");
const WebSocket = require("ws");

// ===== НАСТРОЙКИ =====
const RELAY_PORT = 8080;                     // порт, на котором слушаем браузер
const UPSTREAM_URL = "ws://127.0.0.1:43333"; // GazeFlow/GazePointer WebSocket
const APP_KEY = "AppKeyTrial";         // <-- сюда твой реальный AppKey

const RECONNECT_BASE_DELAY = 1000;   // 1 сек
const RECONNECT_MAX_DELAY = 10000;   // не больше 10 сек
// =====================

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("GazeFlow relay server is running\n");
});

// WebSocket-сервер для браузера
const wss = new WebSocket.Server({ server });

let lastPoint = null;           // последняя точка взгляда
let upstream = null;            // WebSocket к GazeFlow/GazePointer
let upstreamAuthorized = false; // прошла ли авторизация по APP_KEY
let reconnectDelay = RECONNECT_BASE_DELAY;
let reconnectTimer = null;

// рассылаем всем подключённым клиентам
function broadcastPoint(point) {
  lastPoint = point;
  const payload = JSON.stringify(point);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// планируем переподключение к upstream с экспоненциальным backoff
function scheduleReconnect(reason) {
  if (reconnectTimer) {
    return; // уже запланировано
  }

  console.warn(
    `Upstream reconnect scheduled in ${reconnectDelay} ms` +
      (reason ? ` (reason: ${reason})` : "")
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectUpstream();
  }, reconnectDelay);

  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY);
}

// подключаемся к GazeFlow / GazePointer как WS-клиент
function connectUpstream() {
  console.log("Connecting to upstream:", UPSTREAM_URL);

  // на всякий случай закроем старое подключение
  if (upstream && upstream.readyState === WebSocket.OPEN) {
    try {
      upstream.close();
    } catch (_) {}
  }

  upstreamAuthorized = false;

  upstream = new WebSocket(UPSTREAM_URL);

  upstream.on("open", () => {
    console.log("Upstream connected, sending AppKey");
    reconnectDelay = RECONNECT_BASE_DELAY; // успешное соединение — сбрасываем backoff
    upstream.send(APP_KEY);
  });

  upstream.on("message", (data) => {
    const msg = data.toString();

    // первое сообщение — статус авторизации
    if (!upstreamAuthorized) {
      console.log("Upstream auth response:", msg);
      upstreamAuthorized = msg.startsWith("ok");

      if (!upstreamAuthorized) {
        console.error("Authorization failed. Check APP_KEY or server config.");
        // Если авторизация не прошла — закрываем соединение и пробуем переподключиться позже
        try {
          upstream.close();
        } catch (_) {}
        scheduleReconnect("auth_failed");
      }
      return;
    }

    // дальше идут JSON-данные с GazeX/GazeY/etc
    let raw;
    try {
      raw = JSON.parse(msg);
    } catch (e) {
      console.error("Cannot parse upstream JSON:", e.message || e, msg);
      return;
    }

    // берём только точку, где человек смотрит
    if (typeof raw.GazeX !== "number" || typeof raw.GazeY !== "number") {
      // если формат неожиданный — просто логируем
      console.warn("Upstream message without numeric GazeX/GazeY:", raw);
      return;
    }

    const point = {
      x: raw.GazeX,
      y: raw.GazeY,
    };

    broadcastPoint(point);
  });

  upstream.on("close", (code, reason) => {
    console.warn(
      `Upstream connection closed. code=${code}, reason=${reason?.toString()}`
    );
    // если не запланирован reconnect — запланируем
    scheduleReconnect("close");
  });

  upstream.on("error", (err) => {
    console.error("Upstream error:", err.message);
    // сам по себе error не всегда вызывает close, поэтому на всякий случай
    if (!reconnectTimer) {
      scheduleReconnect("error");
    }
  });
}

// браузерные клиенты подключаются к нашему relay
wss.on("connection", (ws) => {
  console.log("Browser client connected");

  // отдать последнюю точку сразу при подключении, если есть
  if (lastPoint) {
    ws.send(JSON.stringify(lastPoint));
  }

  ws.on("close", () => {
    console.log("Browser client disconnected");
  });
});

// стартуем relay-сервер и подключаемся к upstream
server.listen(RELAY_PORT, () => {
  console.log(`Relay server listening on http://localhost:${RELAY_PORT}`);
  connectUpstream();
});
