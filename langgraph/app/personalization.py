from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from .models import PersonalizedSignal, SignalEvent, UserProfileContext, UserReportBundle
from .scoring import momentum_weekly_return

_UNIVERSE_PATH = Path(__file__).resolve().parent.parent / "data" / "universe_mock.json"


def _load_universe_meta() -> Dict[str, Dict[str, Any]]:
    try:
        with _UNIVERSE_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        out: Dict[str, Dict[str, Any]] = {}
        for row in payload.get("tickers", []):
            t = str(row.get("ticker", "")).upper()
            if t:
                out[t] = row
        return out
    except Exception:
        return {}


def compute_profile_fit(
    signal: SignalEvent,
    user_profile: UserProfileContext,
    universe_meta: Dict[str, Dict[str, Any]],
) -> float:
    ticker = signal["ticker"].upper()
    meta = universe_meta.get(ticker, {})
    interests = {x.lower() for x in user_profile.get("interests", [])}
    preferred_assets = {x.lower() for x in user_profile.get("preferred_assets", [])}
    constraints = {x.lower() for x in user_profile.get("constraints", [])}

    asset_class = str(meta.get("asset_class", "stocks")).lower()
    sector = str(meta.get("sector", "")).lower()
    themes = {str(x).lower() for x in (meta.get("themes") or [])}

    if "no_crypto" in constraints and (
        asset_class == "crypto" or ticker.endswith("-USD") or ticker in {"BTC", "BTC-USD", "ETH", "ETH-USD", "SOL", "SOL-USD"}
    ):
        return 0.0

    score = 0.0
    # Sector/theme interest alignment: +0.2 each match, capped at +0.4
    interest_match_count = 0
    if interests:
        if sector and sector in interests:
            interest_match_count += 1
        interest_match_count += len(interests.intersection(themes))
    score += min(0.4, 0.2 * interest_match_count)
    if preferred_assets and asset_class in preferred_assets:
        score += 0.2

    horizon = str(user_profile.get("horizon", "medium")).lower()
    signal_type = signal.get("signal_type", "")
    if "momentum" in signal_type and horizon == "short":
        score += 0.2
    elif "momentum" in signal_type and horizon == "long":
        score -= 0.2
    else:
        score += 0.05

    return max(0.0, min(1.0, round(score, 3)))


def compute_risk_mismatch(signal: SignalEvent, user_profile: UserProfileContext) -> float:
    risk = str(user_profile.get("risk_tolerance", "medium")).lower()
    severity = str(signal.get("severity", "low")).lower()
    if risk != "low":
        return 0.0
    if severity in {"critical", "high"}:
        return 0.4
    if severity == "medium":
        return 0.2
    return 0.0


def assign_action_frame(signal: SignalEvent, in_watchlist: bool) -> str:
    severity = str(signal.get("severity", "low")).lower()
    direction = str(signal.get("direction", "neutral")).lower()
    if in_watchlist and direction == "down" and severity in {"high", "critical"}:
        return "Trim Risk"
    if in_watchlist and severity in {"high", "critical"}:
        return "Review"
    return "Monitor"


def compute_market_regime(scores: Dict[str, Dict[str, float]]) -> str:
    if not scores:
        return "Neutral"
    vals = [float(v.get("momentum", 0.0)) for v in scores.values()]
    if not vals:
        return "Neutral"
    avg_momentum = sum(vals) / len(vals)
    if avg_momentum >= 7.0:
        return "Risk-On"
    if avg_momentum <= 4.0:
        return "Risk-Off"
    return "Neutral"


def compute_risk_alignment(
    watchlist: List[str],
    user_profile: UserProfileContext,
    scores: Dict[str, Dict[str, float]],
) -> str:
    if not watchlist:
        return "Aligned"
    vals = [float(scores.get(t.upper(), {}).get("overall", 0.0)) for t in watchlist if t.upper() in scores]
    if not vals:
        return "Aligned"
    avg = sum(vals) / len(vals)
    risk_pct = int(user_profile.get("risk_tolerance_pct", 50))
    if risk_pct <= 33 and avg >= 7.5:
        return "Off-Profile"
    if risk_pct <= 33 and avg >= 6.0:
        return "Caution"
    if risk_pct >= 67 and avg <= 3.5:
        return "Caution"
    return "Aligned"


def _urgency_from_severity(severity: str) -> str:
    s = severity.lower()
    if s in {"critical", "high"}:
        return "High"
    if s == "medium":
        return "Medium"
    return "Low"


def _discovery_thresholds() -> tuple[float, float, float]:
    confidence_min = float(os.getenv("DISCOVERY_CONFIDENCE_MIN", "0.35"))
    profile_fit_min = float(os.getenv("DISCOVERY_PROFILE_FIT_MIN", "0.15"))
    fit_score_min = float(os.getenv("DISCOVERY_FIT_SCORE_MIN", "0.08"))
    return (
        max(0.0, min(1.0, confidence_min)),
        max(0.0, min(1.0, profile_fit_min)),
        max(-1.0, min(1.0, fit_score_min)),
    )


def _fallback_narrative(
    signal: SignalEvent,
    scores: Dict[str, Dict[str, float]],
) -> str:
    explicit = (signal.get("narrative") or "").strip()
    if explicit:
        return explicit

    ticker = signal["ticker"].upper()
    signal_type = str(signal.get("signal_type", "signal")).lower()
    direction = str(signal.get("direction", "neutral")).lower()
    severity = str(signal.get("severity", "low")).lower()

    ticker_scores = scores.get(ticker, {})
    quality = float(ticker_scores.get("quality", 0.0))
    momentum = float(ticker_scores.get("momentum", 0.0))
    overall = float(ticker_scores.get("overall", 0.0))

    if signal_type == "quality":
        if quality >= 7.0:
            return f"Quality score is strong at {quality:.1f}/10, indicating comparatively resilient fundamentals."
        if quality <= 4.0:
            return f"Quality score is weak at {quality:.1f}/10, suggesting elevated fundamental risk."
        return f"Quality score is mixed at {quality:.1f}/10 with no clear edge yet."

    if signal_type == "momentum":
        if direction == "up":
            return f"Momentum is positive at {momentum:.1f}/10 with trend support in the latest run."
        if direction == "down":
            return f"Momentum is soft at {momentum:.1f}/10, indicating near-term trend weakness."
        return f"Momentum is neutral at {momentum:.1f}/10 with limited directional conviction."

    if signal_type == "risk_flag":
        return "Data retrieval failed for this ticker in the latest run, so treat the signal as higher uncertainty."

    if signal_type == "news_catalyst":
        return "A potential catalyst was detected in the latest analysis cycle."

    return f"{signal_type.replace('_', ' ').title()} signal detected with {severity} severity (overall score {overall:.1f}/10)."


def _watchlist_performance(
    watchlist: List[str],
    per_ticker_data: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, float | None]]:
    out: Dict[str, Dict[str, float | None]] = {}
    for t in watchlist:
        ticker = t.upper()
        prices = per_ticker_data.get(ticker, {}).get("market", {}).get("prices", [])
        one_d: float | None = None
        one_w: float | None = None
        if len(prices) >= 2 and prices[0].get("close") and prices[1].get("close"):
            try:
                p0 = float(prices[0]["close"])
                p1 = float(prices[1]["close"])
                one_d = round(((p0 - p1) / p1) * 100.0, 2) if p1 else None
            except Exception:
                one_d = None
        try:
            one_w = round(momentum_weekly_return(prices), 2) if prices else None
        except Exception:
            one_w = None
        out[ticker] = {"1d": one_d, "1w": one_w, "1m": None}
    return out


def build_user_bundle(
    user_profile: UserProfileContext,
    signal_events: List[SignalEvent],
    scores: Dict[str, Dict[str, float]],
    run_id: str,
    run_date: str,
    per_ticker_data: Dict[str, Dict[str, Any]],
) -> UserReportBundle:
    universe_meta = _load_universe_meta()
    watchlist = [t.upper() for t in user_profile.get("watchlist", [])]
    watchlist_set = set(watchlist)
    watchlist_signals: List[PersonalizedSignal] = []
    discovery_signals: List[PersonalizedSignal] = []
    all_ranked: List[PersonalizedSignal] = []
    mismatch_alerts: List[Dict[str, Any]] = []
    conf_min, profile_fit_min, fit_score_min = _discovery_thresholds()

    for ev in signal_events:
        ticker = ev["ticker"].upper()
        in_watchlist = ticker in watchlist_set
        watchlist_relevance = 1.0 if in_watchlist else 0.0
        profile_fit = compute_profile_fit(ev, user_profile, universe_meta)
        mismatch = compute_risk_mismatch(ev, user_profile)
        fit_score = round((watchlist_relevance * 0.4) + (profile_fit * 0.4) - (mismatch * 0.2), 3)
        urgency = _urgency_from_severity(ev.get("severity", "low"))
        action_frame = assign_action_frame(ev, in_watchlist=in_watchlist)
        risk_flags = [ev.get("signal_type", "signal")] if ev.get("severity") in {"high", "critical"} else []

        ps: PersonalizedSignal = {
            "signal_id": ev["id"],
            "ticker": ticker,
            "signal_type": ev["signal_type"],
            "direction": ev["direction"],
            "severity": ev["severity"],
            "narrative": _fallback_narrative(ev, scores),
            "confidence": float(ev.get("confidence", 0.0)),
            "watchlist_relevance": watchlist_relevance,
            "profile_fit_score": profile_fit,
            "risk_mismatch_penalty": mismatch,
            "bucket": "in_watchlist" if in_watchlist else "discovery",
            "action_frame": action_frame,
            "urgency": urgency,  # type: ignore[typeddict-item]
            "catalyst_window": None,
            "risk_flags": risk_flags,
            "fit_score": fit_score,
        }

        all_ranked.append(ps)
        if in_watchlist:
            watchlist_signals.append(ps)
        else:
            # Discovery gates
            if (
                ps["confidence"] >= conf_min
                and ps["profile_fit_score"] >= profile_fit_min
                and ps["fit_score"] >= fit_score_min
            ):
                discovery_signals.append(ps)

        if mismatch >= 0.3:
            mismatch_alerts.append(
                {
                    "ticker": ticker,
                    "issue": "High-risk signal for low-risk profile",
                    "recommendation": "Review position sizing and risk controls.",
                }
            )

    watchlist_signals.sort(key=lambda x: (x["urgency"], x["fit_score"]), reverse=True)
    discovery_signals.sort(key=lambda x: x["fit_score"], reverse=True)
    all_ranked.sort(key=lambda x: x["fit_score"], reverse=True)

    bundle: UserReportBundle = {
        "user_id": user_profile["user_id"],
        "run_id": run_id,
        "run_date": run_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "watchlist_performance": _watchlist_performance(watchlist, per_ticker_data),
        "market_regime": compute_market_regime(scores),  # type: ignore[typeddict-item]
        "risk_alignment": compute_risk_alignment(watchlist, user_profile, scores),  # type: ignore[typeddict-item]
        "watchlist_signals": watchlist_signals,
        "discovery_signals": discovery_signals,
        "top_conviction": all_ranked[:3],
        "mismatch_alerts": mismatch_alerts,
    }
    return bundle
