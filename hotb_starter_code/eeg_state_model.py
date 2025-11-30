# eeg_state_model.py
"""
Lightweight EEG state model for 4-channel BrainAccess device.

Goal:
    raw_window (MNE Raw) -> stress, concentration, fatigue ∈ [0, 1]

Approach:
    - Compute bandpower in θ, α, β per channel
    - Aggregate across frontal/occipital channels
    - Compute simple indices:
        * engagement_index     ~ concentration
        * stress_index         ~ stress
        * fatigue_index        ~ fatigue
    - Adaptive per-person normalization into [0, 1] using running stats

This is a heuristic, non-clinical model meant as a production-ready *interface*.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Iterable

import numpy as np
import mne


@dataclass(frozen=True)
class EEGState:
    """Continuous state representation in [0, 1]."""
    stress: float
    concentration: float
    fatigue: float


@dataclass
class EEGStateModelConfig:
    """
    Config for EEGStateModel.

    By default uses adaptive per-person normalization based on running stats.
    """

    # Fallback static ranges (если адаптив отключён)
    engagement_min: float = 0.5
    engagement_max: float = 3.0
    stress_min: float = 0.5
    stress_max: float = 4.0
    fatigue_min: float = 0.5
    fatigue_max: float = 4.0

    # Frequency bands (Hz)
    theta_band: tuple = (4.0, 8.0)
    alpha_band: tuple = (8.0, 12.0)
    beta_band: tuple = (13.0, 30.0)

    # Channel roles
    frontal_channels: Iterable[str] = ("Fp1", "Fp2")
    occipital_channels: Iterable[str] = ("O1", "O2")

    # Adaptive normalization settings
    use_adaptive_norm: bool = True

    adaptation_rate: float = 0.05


class EEGStateModel:
    """
    Heuristic EEG state estimator with adaptive per-person normalization.

    Usage:
        model = EEGStateModel()
        state = model.estimate_from_raw_window(raw_window)
    """

    def __init__(self, config: Optional[EEGStateModelConfig] = None):
        self.config = config or EEGStateModelConfig()

        # running stats for adaptive norm
        self._stats_initialized = False
        self._eng_mean = 0.0
        self._eng_std = 1.0
        self._stress_mean = 0.0
        self._stress_std = 1.0
        self._fatigue_mean = 0.0
        self._fatigue_std = 1.0

    # ---------- Public API ----------

    def estimate_from_raw_window(self, raw_window: mne.io.BaseRaw) -> EEGState:
        """
        Estimate stress / concentration / fatigue from a short Raw window.
        """
        if not isinstance(raw_window, mne.io.BaseRaw):
            raise TypeError("raw_window must be an instance of mne.io.BaseRaw")

        # Compute PSD once for 1–40 Hz to reuse across bands
        psd = raw_window.compute_psd(method="welch", fmin=1.0, fmax=40.0, verbose=False)
        freqs = psd.freqs
        psd_data = psd.get_data()  # (n_channels, n_freqs)

        ch_names = np.array(psd.ch_names)

        # Bandpowers
        theta_power = self._bandpower(psd_data, freqs, self.config.theta_band)
        alpha_power = self._bandpower(psd_data, freqs, self.config.alpha_band)
        beta_power = self._bandpower(psd_data, freqs, self.config.beta_band)

        # Aggregate over region groups
        frontal_idx = self._pick_channels(ch_names, self.config.frontal_channels)
        occipital_idx = self._pick_channels(ch_names, self.config.occipital_channels)

        if len(frontal_idx) == 0:
            frontal_idx = np.arange(psd_data.shape[0])
        if len(occipital_idx) == 0:
            occipital_idx = np.arange(psd_data.shape[0])

        theta_front = float(theta_power[frontal_idx].mean())
        alpha_front = float(alpha_power[frontal_idx].mean())
        beta_front = float(beta_power[frontal_idx].mean())

        theta_occ = float(theta_power[occipital_idx].mean())
        alpha_occ = float(alpha_power[occipital_idx].mean())
        beta_occ = float(beta_power[occipital_idx].mean())

        eps = 1e-8

        engagement_index = beta_front / (alpha_front + theta_front + eps)  # ~ concentration
        stress_index = beta_front / (alpha_front + eps)                    # ~ stress
        fatigue_index = theta_occ / (beta_occ + eps)                       # ~ fatigue

        if self.config.use_adaptive_norm:
            self._update_stats(engagement_index, stress_index, fatigue_index)

            concentration = self._adaptive_norm(
                engagement_index, self._eng_mean, self._eng_std
            )
            stress = self._adaptive_norm(
                stress_index, self._stress_mean, self._stress_std
            )
            fatigue = self._adaptive_norm(
                fatigue_index, self._fatigue_mean, self._fatigue_std
            )
        else:
            concentration = self._normalize_linear(
                engagement_index,
                self.config.engagement_min,
                self.config.engagement_max,
            )
            stress = self._normalize_linear(
                stress_index,
                self.config.stress_min,
                self.config.stress_max,
            )
            fatigue = self._normalize_linear(
                fatigue_index,
                self.config.fatigue_min,
                self.config.fatigue_max,
            )

        return EEGState(
            stress=float(stress),
            concentration=float(concentration),
            fatigue=float(fatigue),
        )

    # ---------- Internal helpers ----------

    @staticmethod
    def _bandpower(psd_data: np.ndarray, freqs: np.ndarray, band: tuple) -> np.ndarray:
        fmin, fmax = band
        idx = np.logical_and(freqs >= fmin, freqs <= fmax)
        if not np.any(idx):
            return psd_data.mean(axis=1)
        return np.trapz(psd_data[:, idx], freqs[idx], axis=1)

    @staticmethod
    def _pick_channels(all_names: np.ndarray, wanted: Iterable[str]) -> np.ndarray:
        wanted_set = set(wanted)
        return np.array([i for i, name in enumerate(all_names) if name in wanted_set], dtype=int)

    @staticmethod
    def _normalize_linear(x: float, vmin: float, vmax: float) -> float:
        if vmax <= vmin:
            return 0.5
        x_clipped = max(min(x, vmax), vmin)
        return (x_clipped - vmin) / (vmax - vmin)

    def _update_stats(self, eng: float, stress: float, fatigue: float) -> None:
        alpha = self.config.adaptation_rate

        if not self._stats_initialized:
            self._eng_mean = eng
            self._stress_mean = stress
            self._fatigue_mean = fatigue

            self._eng_std = abs(eng) * 0.1 + 1e-3
            self._stress_std = abs(stress) * 0.1 + 1e-3
            self._fatigue_std = abs(fatigue) * 0.1 + 1e-3

            self._stats_initialized = True
            return

        self._eng_mean = (1.0 - alpha) * self._eng_mean + alpha * eng
        self._stress_mean = (1.0 - alpha) * self._stress_mean + alpha * stress
        self._fatigue_mean = (1.0 - alpha) * self._fatigue_mean + alpha * fatigue

        self._eng_std = (1.0 - alpha) * self._eng_std + alpha * abs(eng - self._eng_mean)
        self._stress_std = (1.0 - alpha) * self._stress_std + alpha * abs(stress - self._stress_mean)
        self._fatigue_std = (1.0 - alpha) * self._fatigue_std + alpha * abs(fatigue - self._fatigue_mean)

        self._eng_std = max(self._eng_std, 1e-3)
        self._stress_std = max(self._stress_std, 1e-3)
        self._fatigue_std = max(self._fatigue_std, 1e-3)

    @staticmethod
    def _adaptive_norm(x: float, mean: float, std: float) -> float:
        """
        Soft adaptive normalization:

        1) count z-score acc. to personal baseline:
               z = (x - mean) / std

        2) clip z in [-2.5, 2.5], so it's not too high

        3) map linier:
               z = 0      -> 0.5
               z = +2.5   -> 1.0
               z = -2.5   -> 0.0

        => with |z| ~ 1 we are not in the middle.
        """
        if std <= 0:
            return 0.5

        z = (x - mean) / (std + 1e-6)
        z = np.clip(z, -2.5, 2.5)

        # [-2.5, 2.5] -> [0, 1]
        #  z = -2.5  => y = 0.0
        #  z =  0    => y = 0.5
        #  z =  2.5  => y = 1.0
        y = 0.5 + 0.2 * z  # 0.2 = 1 / (2 * 2.5)

        return float(np.clip(y, 0.0, 1.0))


