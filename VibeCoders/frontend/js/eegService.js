// eegService.js

/**
 * Simple polling service for EEG Adaptive State API.
 *
 * Usage:
 *   const eeg = new EEGService({
 *     baseUrl: "http://localhost:8000",
 *     pollIntervalMs: 1000,
 *     onState: (state) => {
 *       console.log("EEG state:", state);
 *     },
 *   });
 *
 *   eeg.start();
 *   // later: eeg.stop();
 */

export class EEGService {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl] - Base URL of the FastAPI server
   * @param {number} [options.pollIntervalMs] - Polling interval in ms
   * @param {(state: any) => void} [options.onState] - Callback on new state
   * @param {(error: any) => void} [options.onError] - Optional error callback
   */
  constructor({
    baseUrl = "http://localhost:8000",
    pollIntervalMs = 1000,
    onState = null,
    onError = null,
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.pollIntervalMs = pollIntervalMs;
    this.onState = onState;
    this.onError = onError;

    this._timerId = null;
    this._isRunning = false;
    this._abortController = null;
  }

  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._scheduleNextPoll(0);
  }

  stop() {
    this._isRunning = false;
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  _scheduleNextPoll(delayMs) {
    if (!this._isRunning) return;
    this._timerId = setTimeout(() => this._pollOnce(), delayMs);
  }

  async _pollOnce() {
    if (!this._isRunning) return;

    this._abortController = new AbortController();
    const url = `${this.baseUrl}/api/v1/state`;

    try {
      const res = await fetch(url, {
        method: "GET",
        signal: this._abortController.signal,
      });

      if (!res.ok) {
        // e.g. 503 when EEG not ready
        const errorPayload = await res.json().catch(() => ({}));
        const error = new Error(
          `EEG API error ${res.status}: ${errorPayload.detail || res.statusText}`
        );
        if (this.onError) this.onError(error);
        // Back off slightly on errors
        this._scheduleNextPoll(this.pollIntervalMs);
        return;
      }

      const state = await res.json();

      // Optional external callback
      if (this.onState) {
        this.onState(state);
      }

      // Internal router: different actions -> different behaviour
      this._handleAction(state.action, state);
    } catch (err) {
      if (err.name === "AbortError") {
        // stopped manually
      } else if (this.onError) {
        this.onError(err);
      }
    } finally {
      this._abortController = null;
      this._scheduleNextPoll(this.pollIntervalMs);
    }
  }

  /**
   * Central place where the EEG "action" is parsed.
   * Fill the switch cases with your behaviour.
   *
   * @param {string} action
   * @param {any} state - full EEG state
   */
  _handleAction(action, state) {
    switch (action) {
      case "waiting_for_data":
        // TODO: show loading spinner / keep UI idle
        break;

      case "increase_difficulty":
        // TODO: e.g. load harder exercise / next level
        break;

      case "decrease_difficulty":
        // TODO: e.g. simplify content / give hints
        break;

      case "give_break":
        // TODO: show break screen / pause lesson
        break;

      case "repeat_section":
        // TODO: re-show current/previous section
        break;

      case "boost_engagement":
        // TODO: add gamification, mini-task, animation, etc.
        break;

      // Add your custom actions here:
      // case "your_custom_action":
      //   break;

      default:
        // Unknown / no-op
        break;
    }
  }
}
