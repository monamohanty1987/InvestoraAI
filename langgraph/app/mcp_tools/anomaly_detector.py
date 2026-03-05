"""
anomaly_detector.py — Volume spike and score-delta anomaly detection.

Used by detect_anomalies_node in graph.py, which runs after compute_scores_node
and before retrieve_rag_context_node.

Two detectors:
  - detect_volume_spike  : fires when current volume > avg_volume * threshold (default 2×)
  - detect_score_delta   : fires when quality or momentum shifted ≥ 2 pts vs prior run

Both return an AnomalySignal (intermediate result) or None if no anomaly detected.
build_anomaly_signal_event converts an AnomalySignal into a full SignalEvent-compatible dict.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from typing_extensions import TypedDict

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Intermediate anomaly record — converted to SignalEvent downstream
# ---------------------------------------------------------------------------


class AnomalySignal(TypedDict):
    ticker: str
    anomaly_type: str    # "volume_spike" | "score_delta_quality" | "score_delta_momentum"
    magnitude: float     # ratio for volume spikes; absolute delta for score shifts
    direction: str       # "up" | "down"
    narrative: str       # human-readable description


# ---------------------------------------------------------------------------
# Detectors
# ---------------------------------------------------------------------------


def detect_volume_spike(
    ticker: str,
    volume: float,
    avg_volume: float,
    threshold: float = 2.0,
) -> Optional[AnomalySignal]:
    """Return an AnomalySignal if volume > avg_volume * threshold, else None.

    Args:
        ticker:     Stock ticker symbol.
        volume:     Current period volume.
        avg_volume: Average (baseline) volume.
        threshold:  Multiplier over avg_volume that triggers the signal (default 2.0).

    Returns:
        AnomalySignal if triggered, else None.
    """
    if avg_volume <= 0:
        return None
    ratio = volume / avg_volume
    if ratio < threshold:
        return None
    return AnomalySignal(
        ticker=ticker,
        anomaly_type="volume_spike",
        magnitude=round(ratio, 2),
        direction="up",
        narrative=(
            f"Volume spike detected: {ratio:.1f}× average volume "
            f"({int(volume):,} vs avg {int(avg_volume):,})."
        ),
    )


def detect_score_delta(
    ticker: str,
    current_scores: Dict[str, float],
    prior_scores: Dict[str, float],
    min_delta: float = 2.0,
) -> Optional[AnomalySignal]:
    """Return the largest-magnitude score shift >= min_delta, or None.

    Checks quality and momentum independently; returns the anomaly with the
    larger absolute change.  If both are below threshold, returns None.

    Args:
        ticker:         Stock ticker symbol.
        current_scores: {quality, momentum, overall} from the current run.
        prior_scores:   {quality, momentum, overall} from the most recent prior run.
        min_delta:      Minimum absolute score change to trigger a signal (default 2.0).

    Returns:
        AnomalySignal for the largest shift, or None.
    """
    candidates: List[AnomalySignal] = []

    for key in ("quality", "momentum"):
        cur = current_scores.get(key)
        pri = prior_scores.get(key)
        if cur is None or pri is None:
            continue
        delta = cur - pri
        if abs(delta) < min_delta:
            continue
        direction = "up" if delta > 0 else "down"
        candidates.append(
            AnomalySignal(
                ticker=ticker,
                anomaly_type=f"score_delta_{key}",
                magnitude=round(abs(delta), 2),
                direction=direction,
                narrative=(
                    f"{key.capitalize()} score shifted {direction} by "
                    f"{abs(delta):.1f} pts ({pri:.1f} \u2192 {cur:.1f})."
                ),
            )
        )

    if not candidates:
        return None
    # Surface the anomaly with the largest absolute change
    return max(candidates, key=lambda a: a["magnitude"])


# ---------------------------------------------------------------------------
# SignalEvent builder
# ---------------------------------------------------------------------------


def build_anomaly_signal_event(
    ticker: str,
    anomaly: AnomalySignal,
    run_id: str,
    run_date: str,
    scores: Dict[str, float],
) -> Dict[str, Any]:
    """Convert an AnomalySignal into a SignalEvent-compatible dict.

    signal_type  = anomaly_type string (e.g. "volume_spike", "score_delta_quality")
    confidence   = overall score / 10, clamped to [0.0, 1.0]
    severity:
        - volume_spike          → always "medium"
        - score_delta, mag ≥4.0 → "high"
        - score_delta, mag ≥2.0 → "medium"
    route:
        - volume_spike          → "UI_UPDATE"
        - score_delta, mag ≥3.0 → "ALERT_EVENT"
        - score_delta, mag <3.0 → "UI_UPDATE"

    Args:
        ticker:    Stock ticker symbol.
        anomaly:   Intermediate AnomalySignal to convert.
        run_id:    Current analysis run UUID.
        run_date:  ISO date string (YYYY-MM-DD).
        scores:    Current run score block {quality, momentum, overall}.

    Returns:
        Dict matching the SignalEvent TypedDict schema.
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    fingerprint = hashlib.sha256(
        f"{run_id}:{ticker}:{anomaly['anomaly_type']}".encode()
    ).hexdigest()[:16]

    overall = scores.get("overall", 5.0)
    confidence = round(min(max(overall / 10.0, 0.0), 1.0), 3)

    if anomaly["anomaly_type"] == "volume_spike":
        severity = "medium"
        route = "UI_UPDATE"
    else:
        mag = anomaly["magnitude"]
        severity = "high" if mag >= 4.0 else "medium"
        route = "ALERT_EVENT" if mag >= 3.0 else "UI_UPDATE"

    return {
        "id": fingerprint,
        "run_id": run_id,
        "run_date": run_date,
        "timestamp": timestamp,
        "ticker": ticker,
        "signal_type": anomaly["anomaly_type"],
        "direction": anomaly["direction"],
        "severity": severity,
        "confidence": confidence,
        "score": round(overall, 2),
        "narrative": anomaly["narrative"],
        "route": route,
    }
