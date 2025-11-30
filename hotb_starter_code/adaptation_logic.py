# adaptation_logic.py
"""
Adaptation logic for EEG-based tutoring / game system.

Input:
    stress, concentration, fatigue ∈ [0.0, 1.0]

Output:
    AdaptationDecision:
        - discretized levels (L/M/H)
        - recommended action
        - flow & overload indices
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Tuple, Dict


Level = Literal["L", "M", "H"]


@dataclass(frozen=True)
class AdaptationDecision:
    stress_level: Level
    concentration_level: Level
    fatigue_level: Level
    action: str
    flow: float
    overload: float


def clamp01(x: float) -> float:
    """Clamp value into [0, 1]."""
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


def smooth(prev: float, current: float, alpha: float = 0.8) -> float:
    """
    Exponential smoothing for time series.
    alpha ~ [0.7–0.9] -> stronger smoothing.
    """
    return alpha * prev + (1.0 - alpha) * current


def to_level(x: float, low: float = 0.33, high: float = 0.66) -> Level:
    """
    Map continuous [0,1] value to discrete level L/M/H.
    Thresholds can be tuned per user.
    """
    x = clamp01(x)
    if x < low:
        return "L"
    elif x < high:
        return "M"
    return "H"


def compute_flow(conc: float, stress: float, fatigue: float) -> float:
    """
    'Flow' index: high when concentration is high,
    stress is low, and fatigue is low.
    """
    conc = clamp01(conc)
    stress = clamp01(stress)
    fatigue = clamp01(fatigue)
    return conc * (1.0 - stress) * (1.0 - fatigue)


def compute_overload(conc: float, stress: float, fatigue: float) -> float:
    """
    'Overload' index: combination of stress with
    concentration and fatigue.
    """
    conc = clamp01(conc)
    stress = clamp01(stress)
    fatigue = clamp01(fatigue)
    return stress * conc + stress * fatigue


# ---- Core adaptation matrix (S, C, F) -> action code ----

ADAPTATION_MATRIX: Dict[Tuple[Level, Level, Level], str] = {
    # S = L (low stress)

    # L H L — ok
    ("L", "H", "L"): "no_change",
    # L H M — a bit harder
    ("L", "H", "M"): "text_harder",
    # L H H — focus
    ("L", "H", "H"): "focus_modal",

    # L M L — ok
    ("L", "M", "L"): "no_change",
    # L M M/H — focus/relaxation
    ("L", "M", "M"): "focus_modal",
    ("L", "M", "H"): "focus_modal",

    # L L L — make it harder
    ("L", "L", "L"): "text_harder",
    # L L M/H — make it easier
    ("L", "L", "M"): "text_easier",
    ("L", "L", "H"): "text_easier",

    # S = M (medium stress)

    # M H L — ok
    ("M", "H", "L"): "no_change",
    # M H M/H — make it easier
    ("M", "H", "M"): "text_easier",
    ("M", "H", "H"): "text_easier",

    # M M L — ok
    ("M", "M", "L"): "no_change",
    # M M M/H — make it easier
    ("M", "M", "M"): "text_easier",
    ("M", "M", "H"): "text_easier",

    # M L L — focus
    ("M", "L", "L"): "focus_modal",
    # M L M/H — make it easier
    ("M", "L", "M"): "text_easier",
    ("M", "L", "H"): "text_easier",

    # S = H (high stress)

    # H H L — make it easier
    ("H", "H", "L"): "text_easier",
    # H H M/H — make it easier
    ("H", "H", "M"): "text_easier",
    ("H", "H", "H"): "text_easier",

    # H M L — make it easier
    ("H", "M", "L"): "text_easier",
    # H M M/H — make it easier
    ("H", "M", "M"): "text_easier",
    ("H", "M", "H"): "text_easier",

    # H L L — breath/focus
    ("H", "L", "L"): "focus_modal",
    # H L M/H — state, not the text
    ("H", "L", "M"): "focus_modal",
    ("H", "L", "H"): "focus_modal",
}



def decide_adaptation(
    stress: float,
    concentration: float,
    fatigue: float,
    overload_threshold: float = 0.75,
    flow_threshold: float = 0.65,
) -> AdaptationDecision:
    """
    Main decision function.

    1) Clamp values to [0,1]
    2) Map to discrete levels L/M/H
    3) Look up action in adaptation matrix
    4) Adjust action using flow/overload indices

    Returns AdaptationDecision – this is what you plug into your app logic.
    """
    stress = clamp01(stress)
    concentration = clamp01(concentration)
    fatigue = clamp01(fatigue)

    s_level = to_level(stress)
    c_level = to_level(concentration)
    f_level = to_level(fatigue)

    flow = compute_flow(concentration, stress, fatigue)
    overload = compute_overload(concentration, stress, fatigue)

    key = (s_level, c_level, f_level)
    action = ADAPTATION_MATRIX.get(key, "continue")  # safe default

    # Safety override: overload → always downshift
    if overload > overload_threshold:
        if not (
            "pause" in action
            or "rest" in action
            or action.startswith("easier_")
        ):
            action = "easier_with_pause"

    # Positive override: good flow → можно слегка усложнять
    elif flow > flow_threshold:
        if action.startswith("continue"):
            action = "continue_harder"

    return AdaptationDecision(
        stress_level=s_level,
        concentration_level=c_level,
        fatigue_level=f_level,
        action=action,
        flow=flow,
        overload=overload,
    )
