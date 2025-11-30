# eeg_preprocessing.py
"""
EEG preprocessing utilities for BrainAccess realtime pipeline.

Цели:
    - слегка почистить сетевой шум (50 Гц)
    - НЕ вырезать сильно спектр (никакого агрессивного band-pass)
    - отбрасывать только явно шумные окна (очень большие пики)

Использование:
    см. preprocess_window_for_state(...)
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
    Очень лёгкая очистка: только notch по 50 Гц (можно несколько частот).

    Используем IIR и вызываем по одной частоте, чтобы не ловить
    `Multiple stop-bands` с несколькими частотами.
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
    # l_freq / h_freq оставлены только ради совместимости с вызовом,
    # внутри они больше НЕ используются (никакого band-pass на коротком окне).
    l_freq: float = 1.0,
    h_freq: float = 40.0,
    notch_freqs: Optional[Iterable[float]] = (50.0,),
) -> Optional[mne.io.BaseRaw]:
    """
    Полный препроцессинг окна для подачи в EEGStateModel.

    Шаги:
        1) лёгкий notch 50 Гц (и др. частоты, если заданы)
        2) (опционально) отбросить окно, если оно ОЧЕНЬ шумное

    Никакого агрессивного band-pass на этом этапе.

    Возвращает:
        - очищенное окно mne.Raw, если всё ок
        - None, если окно было отброшено как шумное
    """
    if not isinstance(raw_window, mne.io.BaseRaw):
        raise TypeError("raw_window must be an instance of mne.io.BaseRaw")

    # 1) лёгкий notch
    cleaned = light_notch(
        raw_window,
        notch_freqs=notch_freqs,
    )

    # 2) мягкая проверка на шум
    if reject_noisy and is_noisy_window(cleaned, peak_to_peak_uV=peak_to_peak_uV):
        return None

    return cleaned
