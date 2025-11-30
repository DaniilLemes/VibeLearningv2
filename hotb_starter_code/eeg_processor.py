import os
import sys
import time
import signal
import threading
from dataclasses import dataclass, asdict

import matplotlib

data_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..',
    'data'
)
sys.path.insert(0, os.path.abspath(data_path))

# We don't want the GUI in the background thread, but keeping the import structure similar
matplotlib.use("Agg", force=True)

from brainaccess.utils import acquisition
from brainaccess.core.eeg_manager import EEGManager
# Import all your custom logic
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

# --- Configuration (Copied from main.py) ---
halo = {0: "Fp1", 1: "Fp2", 2: "O1", 3: "O2"}
DEVICE_NAME = "BA HALO 081"
SFREQ = 250
STATE_WINDOW_SEC = 3.0
STATE_STEP_SEC = 1.0
LOCK_SEC = 10.0


# dataclass definition from main.py
@dataclass
class LevelLock:
    current_level: Level = "M"
    last_change_time: float = 0.0
    lock_sec: float = LOCK_SEC

    def update(self, value: float, now: float) -> Level:
        # Implementation from main.py (truncated for brevity)
        instant_level = to_level(value, low=0.45, high=0.55)
        if self.last_change_time == 0.0:
            self.current_level = instant_level
            self.last_change_time = now
            return self.current_level
        if instant_level == self.current_level:
            return self.current_level
        if now - self.last_change_time < self.lock_sec:
            return self.current_level
        self.current_level = instant_level
        self.last_change_time = now
        return self.current_level


# ---------------------------------------------


def eeg_acquisition_loop(shared_state: dict, stop_event: threading.Event) -> None:
    """
    Main loop that acquires EEG data and updates the shared_state dictionary.
    This runs in a separate thread.
    """
    print("[EEG] Processor thread started.")

    eeg = acquisition.EEG()
    state_model = EEGStateModel()

    # Initialize locks and smoothed state
    smoothed_state: EEGState | None = None
    stress_lock = LevelLock()
    conc_lock = LevelLock()
    fatigue_lock = LevelLock()

    try:
        with EEGManager() as mgr:
            eeg.setup(mgr, device_name=DEVICE_NAME, cap=halo, sfreq=SFREQ)

            eeg.start_acquisition()
            print("[EEG] Acquisition started.")

            # Give device time for first samples
            time.sleep(1.0)

            while not stop_event.is_set():
                loop_start = time.time()
                now = loop_start

                # 1. Get and process MNE data window
                try:
                    eeg.get_mne()
                except IndexError:
                    time.sleep(STATE_STEP_SEC)
                    continue

                mne_raw = eeg.data.mne_raw
                if mne_raw is None or mne_raw.n_times == 0 or (mne_raw.times[-1] - mne_raw.times[0]) < STATE_WINDOW_SEC:
                    # Not enough data yet
                    time.sleep(STATE_STEP_SEC)
                    continue

                # Crop to the last STATE_WINDOW_SEC
                tmax_all = float(mne_raw.times[-1])
                tmin = max(0.0, tmax_all - STATE_WINDOW_SEC)
                raw_window = mne_raw.copy().crop(tmin=tmin, tmax=tmax_all)

                # 2. State Estimation and Smoothing
                raw_state = state_model.estimate_from_raw_window(raw_window)
                if smoothed_state is None:
                    smoothed_state = raw_state
                else:
                    alpha = 0.9
                    smoothed_state = EEGState(
                        stress=smooth(smoothed_state.stress, raw_state.stress, alpha),
                        concentration=smooth(smoothed_state.concentration, raw_state.concentration, alpha),
                        fatigue=smooth(smoothed_state.fatigue, raw_state.fatigue, alpha),
                    )

                # 3. Level Locking
                stress_level = stress_lock.update(smoothed_state.stress, now)
                conc_level = conc_lock.update(smoothed_state.concentration, now)
                fatigue_level = fatigue_lock.update(smoothed_state.fatigue, now)

                # 4. Adaptation Decision
                flow = compute_flow(smoothed_state.concentration, smoothed_state.stress, smoothed_state.fatigue)
                overload = compute_overload(smoothed_state.concentration, smoothed_state.stress, smoothed_state.fatigue)
                key = (stress_level, conc_level, fatigue_level)
                action = ADAPTATION_MATRIX.get(key, "continue")

                # Overrides
                overload_threshold = 0.75
                flow_threshold = 0.65
                if overload > overload_threshold:
                    if not ("pause" in action or "rest" in action or action.startswith("easier_")):
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

                # 5. Update Shared State
                # Using a thread-safe update by replacing the entire dictionary
                shared_state.update({
                    "timestamp": now,
                    **asdict(smoothed_state),
                    **asdict(decision),
                })

                # Log to console (optional, can be disabled)
                print(f"[EEG LOOP] State updated. Action: {action} (Flow: {flow:.2f})")

                # Keep loop period
                elapsed = time.time() - loop_start
                sleep_time = max(0.0, STATE_STEP_SEC - elapsed)
                time.sleep(sleep_time)

    except Exception as e:
        print(f"[ERROR] Fatal error in EEG loop: {e}")
    finally:
        print("[EEG] Stopping acquisition and cleaning up...")
        eeg.stop_acquisition()
        mgr.disconnect()
        eeg.close()
        print("[EEG] Processor thread finished.")