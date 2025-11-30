"""
Realtime EEG loop with BrainAccess device + adaptive state & time-locked levels.

Logic:
    - every STATE_STEP_SEC sec count window EEG (STATE_WINDOW_SEC)
    - EEGStateModel gives stress / conc / fatigue ∈ [0,1]
    - normalizing
    - for each parameter count moment L/M/H ( 0.45 / 0.55)
    - level changes -> fix om min LOCK_SEC sec
    - acc to (S, C, F) choose action from ADAPTATION_MATRIX + flow/overload
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
SFREQ = 250
STATE_WINDOW_SEC = 3.0
STATE_STEP_SEC = 1.0
LOCK_SEC = 10.0


@dataclass
class LevelLock:
    """
    Локер для уровня L/M/H.

    - instant_level with threshold'ам
    - if instant_level != current_level and finished >= lock_sec
        -> change level and reload last_change_time
    - otherwise -> old current_level
    """
    current_level: Level = "M"
    last_change_time: float = 0.0
    lock_sec: float = LOCK_SEC

    def update(self, value: float, now: float) -> Level:
        instant_level = to_level(value, low=0.45, high=0.55)  # high=0.55 как ты хотел

        # first initiation -> receive current
        if self.last_change_time == 0.0:
            self.current_level = instant_level
            self.last_change_time = now
            return self.current_level

        # same level -> reload without reloading the timer
        if instant_level == self.current_level:
            return self.current_level

        # if another level, but the lock is ok -> ignore
        if now - self.last_change_time < self.lock_sec:
            return self.current_level

        # lock exp. -> new lock
        self.current_level = instant_level
        self.last_change_time = now
        return self.current_level


def main() -> None:
    os.makedirs("data", exist_ok=True)

    eeg = acquisition.EEG()
    state_model = EEGStateModel()  # adaptive normalization for this particular person

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

        smoothed_state: EEGState | None = None

        # locks for S / C / F
        stress_lock = LevelLock()
        conc_lock = LevelLock()
        fatigue_lock = LevelLock()

        # first samples
        time.sleep(1.0)

        # ---- Realtime loop ----
        while not stop_flag:
            loop_start = time.time()
            now = loop_start

            # Annotation once a second
            if now - last_annot_time >= 1.0:
                print(f"Sending annotation {annotation} to the device")
                try:
                    eeg.annotate(str(annotation))
                except Exception as e:
                    print(f"[WARN] annotate failed: {e}")
                annotation += 1
                last_annot_time = now

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
                tmin_all = float(mne_raw.times[0])      # usually 0.0
                tmax_all = float(mne_raw.times[-1])     # last acc. moment
                rec_sec = tmax_all - tmin_all

                if rec_sec < STATE_WINDOW_SEC:
                    print(
                        f"[INFO] Not enough data for window yet "
                        f"({rec_sec:.1f}s recorded, need {STATE_WINDOW_SEC:.1f}s)..."
                    )
                else:
                    # ---- last window ----
                    tmax = tmax_all
                    tmin = max(tmin_all, tmax - STATE_WINDOW_SEC)

                    raw_window = mne_raw.copy().crop(
                        tmin=tmin,
                        tmax=tmax,
                    )

                    # ---- Preprocessing: filtration + cleaning of artefacts ----
                    clean_window = preprocess_window_for_state(
                        raw_window,
                        reject_noisy=False,  # <--- imp: temp turn off rejection
                        peak_to_peak_uV=250.0,  # пока не важно
                        l_freq=1.0,
                        h_freq=40.0,
                        notch_freqs=(50.0,),
                    )

                    # ---- State evaluation on the clean channel ----
                    raw_state = state_model.estimate_from_raw_window(clean_window)

                    # ---- Smothering acc. to time ----
                    if smoothed_state is None:
                        smoothed_state = raw_state
                    else:
                        alpha = 0.9  # wild smothering
                        smoothed_state = EEGState(
                            stress=smooth(smoothed_state.stress, raw_state.stress, alpha),
                            concentration=smooth(smoothed_state.concentration, raw_state.concentration, alpha),
                            fatigue=smooth(smoothed_state.fatigue, raw_state.fatigue, alpha),
                        )

                    # ---- Lock levels for 10 sec ----
                    stress_level = stress_lock.update(smoothed_state.stress, now)
                    conc_level = conc_lock.update(smoothed_state.concentration, now)
                    fatigue_level = fatigue_lock.update(smoothed_state.fatigue, now)

                    # ---- Flow / overload + matrix action ----
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

                    # overload protection
                    if overload > overload_threshold:
                        if not (
                            "pause" in action
                            or "rest" in action
                            or action.startswith("easier_")
                        ):
                            action = "easier_with_pause"

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

                    # ---- Log ----
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

            # Cycle period STATE_STEP_SEC
            elapsed = time.time() - loop_start
            sleep_time = max(0.0, STATE_STEP_SEC - elapsed)
            time.sleep(sleep_time)

        # ---- After exiting the cycle ----
        print("Stopping acquisition...")
        eeg.stop_acquisition()
        mgr.disconnect()

    # Full save
    mne_raw = eeg.data.mne_raw
    if mne_raw is not None and mne_raw.n_times > 0:
        print(f"MNE Raw object: {mne_raw}")
        data, times = mne_raw.get_data(return_times=True)
        print(f"Final data shape: {data.shape}")

        fname = f'./data/{time.strftime("%Y%m%d_%H%M")}-raw.fif'
        print(f"Saving raw data to {fname}")
        eeg.data.save(fname)

        eeg.close()

        # Visual
        mne_raw.apply_function(lambda x: x * 10**-6)
        mne_raw.filter(1.0, 40.0).plot(scalings="auto", verbose=False)
        plt.show()
    else:
        print("No raw data available, nothing to save/plot.")
        eeg.close()


if __name__ == "__main__":
    main()
