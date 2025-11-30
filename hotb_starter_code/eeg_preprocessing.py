# eeg_preprocessing.py
"""
EEG preprocessing utilities for BrainAccess realtime pipeline.

Goals:
    - light noise cleaning (50 GHz)
    - don't cut the spectrum (no aggressive band-pass)
    - work only with noisy windows (very high peaks)

Use:
    see preprocess_window_for_state(...)
"""

from __future__ import annotations

from typing import Iterable, Optional

import numpy as np
import mne


def light_notch(
    raw_window: mne.io.BaseRaw,
    notch_freqs: Optional[Iterable[float]] = (50.0,),
) -> mne.io.BaseRaw:
    """
    Light cleaning 50 GHz (could be a few).

   Use IIR and call one at a time, so we don't get
    `Multiple stop-bands` with a few frequencies.
    """
    if not isinstance(raw_window, mne.io.BaseRaw):
        raise TypeError("raw_window must be an instance of mne.io.BaseRaw")

    raw_filt = raw_window.copy()

    if notch_freqs:
        for f in notch_freqs:
            raw_filt.notch_filter(
                freqs=float(f),
                method="iir",
                verbose=False,
            )

    return raw_filt


def is_noisy_window(
    raw_window: mne.io.BaseRaw,
    peak_to_peak_uV: float = 250.0,
) -> bool:
    if not isinstance(raw_window, mne.io.BaseRaw):
        raise TypeError("raw_window must be an instance of mne.io.BaseRaw")

    data, _ = raw_window.get_data(return_times=True)  # (n_channels, n_times)

    # БЕЗ * 1e6 — считаем, что данные уже примерно в мкВ-скейле
    ptp_per_ch = np.ptp(data, axis=1)

    noisy = bool((ptp_per_ch > peak_to_peak_uV).any())
    return noisy



def preprocess_window_for_state(
    raw_window: mne.io.BaseRaw,
    reject_noisy: bool = True,
    peak_to_peak_uV: float = 250.0,
    # l_freq / h_freq leave,
    l_freq: float = 1.0,
    h_freq: float = 40.0,
    notch_freqs: Optional[Iterable[float]] = (50.0,),
) -> Optional[mne.io.BaseRaw]:
    """
    Full preprocessing of a window before feeding it into EEGStateModel.

    Steps:

    Apply a light 50 Hz notch filter (and other frequencies if specified).

    (Optionally) discard the window if it is VERY noisy.

    No aggressive band-pass at this stage.

    Returns:

    The cleaned mne.Raw window if everything is OK.

    None if the window was discarded as noisy.
    """
    if not isinstance(raw_window, mne.io.BaseRaw):
        raise TypeError("raw_window must be an instance of mne.io.BaseRaw")

    # 1) light notch
    cleaned = light_notch(
        raw_window,
        notch_freqs=notch_freqs,
    )

    # 2) soft noise check
    if reject_noisy and is_noisy_window(cleaned, peak_to_peak_uV=peak_to_peak_uV):
        return None

    return cleaned
