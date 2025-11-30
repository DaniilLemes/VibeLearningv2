export class EEGService {
  /**
   * @param {Object} options
   * @param {string} options.baseUrl - базовый URL до API, например "http://localhost:8000"
   * @param {number} [options.pollIntervalMs=1000] - интервал между запросами, мс
   * @param {(state: any) => void} [options.onState] - коллбэк с новым состоянием
   * @param {(err: Error) => void} [options.onError] - коллбэк на ошибку
   */
  constructor({ baseUrl, pollIntervalMs = 1000, onState, onError }) {
    this.baseUrl = baseUrl.replace(/\/+$/, ""); // срежем хвостовой /
    this.pollIntervalMs = pollIntervalMs;
    this.onState = onState;
    this.onError = onError;

    this._timerId = null;
    this._stopped = true;
  }

  start() {
    if (!this._stopped) return;
    this._stopped = false;
    this._scheduleNextPoll(0); // сразу первый запрос
  }

  stop() {
    this._stopped = true;
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  _scheduleNextPoll(delay) {
    if (this._stopped) return;
    this._timerId = setTimeout(() => this._pollOnce(), delay);
  }

  async _pollOnce() {
    if (this._stopped) return;

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/state`, {
        method: "GET",
        cache: "no-cache",
      });

      if (res.status === 503) {
        // EEG ещё не готов — не считаем это фатальной ошибкой
        const err = new Error("EEG not ready (503)");
        if (this.onError) this.onError(err);
      } else if (!res.ok) {
        const err = new Error(`EEG API error: ${res.status} ${res.statusText}`);
        if (this.onError) this.onError(err);
      } else {
        const state = await res.json();
        if (this.onState) this.onState(state);
      }
    } catch (e) {
      if (this.onError) this.onError(e);
    } finally {
      // планируем следующий запрос
      this._scheduleNextPoll(this.pollIntervalMs);
    }
  }
}
