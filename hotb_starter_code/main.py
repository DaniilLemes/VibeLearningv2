"""
Realtime EEG loop with BrainAccess device + adaptive state & time-locked levels.

Логика:
    - каждые STATE_STEP_SEC секунд считаем окно EEG (STATE_WINDOW_SEC)
    - EEGStateModel даёт непрерывные stress / conc / fatigue ∈ [0,1]
    - сглаживаем по времени
    - для каждого параметра считаем моментальный уровень L/M/H (по порогам 0.45 / 0.55)
    - как только уровень меняется -> фиксируем его минимум на LOCK_SEC секунд
    - по (S, C, F) берём action из ADAPTATION_MATRIX + flow/overload
"""

import os
import time
import signal
from dataclasses import dataclass
from eeg_preprocessing import preprocess_window_for_state

import matplotlib
matplotlib.use("TKAgg", force=True)
import matplotlib.pyplot as plt

from brainaccess.utils import acquisition
from brainaccess.core.eeg_manager import EEGManager

from eeg_state_model import EEGStateModel, EEGState
from adaptation_logic import (
    ADAPTATION_MATRIX,
    compute_flow,
    compute_overload,
    smooth,
    Level,
    AdaptationDecision,
    to_level,
)


# Electrode locations (adjust if you change cap/halo)
halo = {
    0: "Fp1",
    1: "Fp2",
    2: "O1",
    3: "O2",
}

cap = {
    0: "F3",
    1: "F4",
    2: "C3",
    3: "C4",
    4: "P3",
    5: "P4",
    6: "O1",
    7: "O2",
}

DEVICE_NAME = "BA HALO 081"
SFREQ = 250             # sampling frequency
STATE_WINDOW_SEC = 3.0  # длина окна для анализа состояния (по времени)
STATE_STEP_SEC = 1.0    # период цикла (сек)
LOCK_SEC = 10.0         # минимум 10 секунд удержания уровня


@dataclass
class LevelLock:
    """
    Локер для уровня L/M/H.

    - instant_level вычисляем каждый шаг по threshold'ам
    - если instant_level != current_level и прошло >= lock_sec
        -> меняем уровень и обновляем last_change_time
    - иначе -> держим старый current_level
    """
    current_level: Level = "M"
    last_change_time: float = 0.0
    lock_sec: float = LOCK_SEC

    def update(self, value: float, now: float) -> Level:
        # моментальный уровень по текущему значению
        instant_level = to_level(value, low=0.45, high=0.55)  # high=0.55 как ты хотел

        # первая инициализация — сразу принимаем текущее
        if self.last_change_time == 0.0:
            self.current_level = instant_level
            self.last_change_time = now
            return self.current_level

        # если такой же уровень — просто обновляем, без изменений таймера
        if instant_level == self.current_level:
            return self.current_level

        # если другой уровень, но "замок" ещё не истёк — игнорируем
        if now - self.last_change_time < self.lock_sec:
            return self.current_level

        # замок истёк -> принимаем новый уровень и обновляем таймер
        self.current_level = instant_level
        self.last_change_time = now
        return self.current_level


def main() -> None:
    os.makedirs("data", exist_ok=True)

    eeg = acquisition.EEG()
    state_model = EEGStateModel()  # внутри — адаптивная нормализация под человека

    stop_flag = False

    def handle_sigint(sig, frame):
        nonlocal stop_flag
        print("\n[!] Caught Ctrl+C, stopping acquisition loop...")
        stop_flag = True

    signal.signal(signal.SIGINT, handle_sigint)

    with EEGManager() as mgr:
        eeg.setup(mgr, device_name=DEVICE_NAME, cap=halo, sfreq=SFREQ)

        eeg.start_acquisition()
        print("Acquisition started (press Ctrl+C to stop)...")

        annotation = 1
        last_annot_time = time.time()

        # сглаженное состояние
        smoothed_state: EEGState | None = None

        # локи для уровней S / C / F
        stress_lock = LevelLock()
        conc_lock = LevelLock()
        fatigue_lock = LevelLock()

        # Дадим устройству время на первые сэмплы
        time.sleep(1.0)

        # ---- Realtime loop ----
        while not stop_flag:
            loop_start = time.time()
            now = loop_start

            # Аннотация раз в секунду (по желанию)
            if now - last_annot_time >= 1.0:
                print(f"Sending annotation {annotation} to the device")
                try:
                    eeg.annotate(str(annotation))
                except Exception as e:
                    print(f"[WARN] annotate failed: {e}")
                annotation += 1
                last_annot_time = now

            # Обновляем MNE-объект из буфера brainaccess
            try:
                eeg.get_mne()
            except IndexError:
                print("[WARN] No data in buffer yet, waiting...")
                time.sleep(STATE_STEP_SEC)
                continue

            mne_raw = eeg.data.mne_raw

            if mne_raw is None or mne_raw.n_times == 0:
                print("[WARN] mne_raw is empty, waiting...")
            else:
                tmin_all = float(mne_raw.times[0])      # обычно 0.0
                tmax_all = float(mne_raw.times[-1])     # последний допустимый момент
                rec_sec = tmax_all - tmin_all

                if rec_sec < STATE_WINDOW_SEC:
                    print(
                        f"[INFO] Not enough data for window yet "
                        f"({rec_sec:.1f}s recorded, need {STATE_WINDOW_SEC:.1f}s)..."
                    )
                else:
                    # ---- Берём последнее окно по времени ----
                    tmax = tmax_all
                    tmin = max(tmin_all, tmax - STATE_WINDOW_SEC)

                    raw_window = mne_raw.copy().crop(
                        tmin=tmin,
                        tmax=tmax,
                    )

                    # ---- Препроцессинг: фильтрация + отбрасывание жёстких артефактов ----
                    clean_window = preprocess_window_for_state(
                        raw_window,
                        reject_noisy=False,  # <--- ВАЖНО: временно отключаем отбрасывание
                        peak_to_peak_uV=250.0,  # пока не важно
                        l_freq=1.0,
                        h_freq=40.0,
                        notch_freqs=(50.0,),
                    )

                    # ---- Оценка состояния уже на очищенном сигнале ----
                    raw_state = state_model.estimate_from_raw_window(clean_window)

                    # ---- Сглаживаем по времени ----
                    if smoothed_state is None:
                        smoothed_state = raw_state
                    else:
                        alpha = 0.9  # сильное сглаживание
                        smoothed_state = EEGState(
                            stress=smooth(smoothed_state.stress, raw_state.stress, alpha),
                            concentration=smooth(smoothed_state.concentration, raw_state.concentration, alpha),
                            fatigue=smooth(smoothed_state.fatigue, raw_state.fatigue, alpha),
                        )

                    # ---- Лочим уровни на минимум 10 секунд ----
                    stress_level = stress_lock.update(smoothed_state.stress, now)
                    conc_level = conc_lock.update(smoothed_state.concentration, now)
                    fatigue_level = fatigue_lock.update(smoothed_state.fatigue, now)

                    # ---- Flow / overload + действие по матрице ----
                    flow = compute_flow(
                        smoothed_state.concentration,
                        smoothed_state.stress,
                        smoothed_state.fatigue,
                    )
                    overload = compute_overload(
                        smoothed_state.concentration,
                        smoothed_state.stress,
                        smoothed_state.fatigue,
                    )

                    key = (stress_level, conc_level, fatigue_level)
                    action = ADAPTATION_MATRIX.get(key, "continue")

                    overload_threshold = 0.75
                    flow_threshold = 0.65

                    # защита от перегруза
                    if overload > overload_threshold:
                        if not (
                            "pause" in action
                            or "rest" in action
                            or action.startswith("easier_")
                        ):
                            action = "easier_with_pause"
                    # хороший поток — можно чуть усложнить
                    elif flow > flow_threshold and action.startswith("continue"):
                        action = "continue_harder"

                    decision = AdaptationDecision(
                        stress_level=stress_level,
                        concentration_level=conc_level,
                        fatigue_level=fatigue_level,
                        action=action,
                        flow=flow,
                        overload=overload,
                    )

                    # ---- Лог ----
                    print(
                        f"[STATE]  stress={smoothed_state.stress:.2f}  "
                        f"conc={smoothed_state.concentration:.2f}  "
                        f"fatigue={smoothed_state.fatigue:.2f}"
                    )
                    print(
                        f"[LEVEL]  S={stress_level}  C={conc_level}  F={fatigue_level}"
                    )
                    print(
                        f"[ADAPT]  action={decision.action}  "
                        f"(flow={decision.flow:.2f}, overload={decision.overload:.2f})"
                    )
                    print("-" * 60)

            # Держим период цикла примерно STATE_STEP_SEC
            elapsed = time.time() - loop_start
            sleep_time = max(0.0, STATE_STEP_SEC - elapsed)
            time.sleep(sleep_time)

        # ---- После выхода из цикла ----
        print("Stopping acquisition...")
        eeg.stop_acquisition()
        mgr.disconnect()

    # Полная запись (если есть что сохранять)
    mne_raw = eeg.data.mne_raw
    if mne_raw is not None and mne_raw.n_times > 0:
        print(f"MNE Raw object: {mne_raw}")
        data, times = mne_raw.get_data(return_times=True)
        print(f"Final data shape: {data.shape}")

        fname = f'./data/{time.strftime("%Y%m%d_%H%M")}-raw.fif'
        print(f"Saving raw data to {fname}")
        eeg.data.save(fname)

        eeg.close()

        # Визуалка — опционально
        mne_raw.apply_function(lambda x: x * 10**-6)
        mne_raw.filter(1.0, 40.0).plot(scalings="auto", verbose=False)
        plt.show()
    else:
        print("No raw data available, nothing to save/plot.")
        eeg.close()


if __name__ == "__main__":
    main()
