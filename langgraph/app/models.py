from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from typing_extensions import TypedDict


# ---------------------------------------------------------------------------
# Evidence Synthesis — LLM-produced structured observations per ticker
# ---------------------------------------------------------------------------

class NewsCatalyst(TypedDict):
    present: bool
    headline: Optional[str]
    impact: str    # "positive" | "negative" | "neutral"
    strength: str  # "low" | "medium" | "high"


class SynthesisResult(TypedDict):
    ticker: str
    quality_narrative: str    # 1–2 sentences on fundamentals strength
    momentum_narrative: str   # 1–2 sentences on price action
    news_catalyst: NewsCatalyst
    risk_factors: List[str]   # specific risk strings; empty list if none


_EMPTY_CATALYST: NewsCatalyst = NewsCatalyst(present=False, headline=None, impact="neutral", strength="low")


def empty_synthesis(ticker: str) -> SynthesisResult:
    """Fallback synthesis when LLM call fails for a ticker."""
    return SynthesisResult(
        ticker=ticker,
        quality_narrative="",
        momentum_narrative="",
        news_catalyst=_EMPTY_CATALYST,
        risk_factors=[],
    )


# ---------------------------------------------------------------------------
# SignalEvent — canonical output unit; consumed by all three output channels
# ---------------------------------------------------------------------------

class SignalEvent(TypedDict):
    id: str             # fingerprint: sha256(run_id:ticker:signal_type)[:16]
    run_id: str
    run_date: str       # ISO date (YYYY-MM-DD)
    timestamp: str      # ISO datetime (UTC)
    ticker: str
    signal_type: str    # "quality" | "momentum" | "risk_flag"  (Phase 2 adds "news_catalyst")
    direction: str      # "up" | "down" | "neutral"
    severity: str       # "low" | "medium" | "high" | "critical"
    confidence: float   # 0.0–1.0
    score: float        # normalized 0–10
    narrative: Optional[str]  # None in Phase 1; LLM synthesis added in Phase 2
    route: str          # "UI_UPDATE" | "ALERT_EVENT" | "WEEKLY_CANDIDATE"


# ---------------------------------------------------------------------------
# AnalysisSnapshot — structured record of a complete analysis run
# ---------------------------------------------------------------------------

class AnalysisSnapshot(TypedDict):
    run_id: str
    run_date: str
    timestamp: str
    scope: str                              # "full" in Phase 1; "fast"|"medium" in Phase 5
    tickers: List[str]
    scores: Dict[str, Dict[str, float]]     # {ticker: {quality, momentum, overall}}
    signal_events: List[SignalEvent]
    failed_tickers: List[str]
    error_count: int


# ---------------------------------------------------------------------------
# Signal generation helpers
# ---------------------------------------------------------------------------

def _score_to_direction(score: float) -> str:
    if score >= 6.0:
        return "up"
    if score <= 4.0:
        return "down"
    return "neutral"


def _score_to_severity(score: float) -> str:
    if score >= 8.0:
        return "high"
    if score >= 6.0:
        return "medium"
    if score < 2.0:
        return "high"   # very low score is also a high-severity signal (risk)
    return "low"


def _score_to_route(score: float, signal_type: str = "quality") -> str:
    if score >= 8.5 or score <= 1.5:
        return "ALERT_EVENT"
    if signal_type == "quality" and 7.0 <= score <= 8.4:
        return "WEEKLY_CANDIDATE"
    return "UI_UPDATE"


def _make_signal(
    run_id: str,
    run_date: str,
    timestamp: str,
    ticker: str,
    signal_type: str,
    score: float,
) -> SignalEvent:
    fingerprint = hashlib.sha256(f"{run_id}:{ticker}:{signal_type}".encode()).hexdigest()[:16]
    return SignalEvent(
        id=fingerprint,
        run_id=run_id,
        run_date=run_date,
        timestamp=timestamp,
        ticker=ticker,
        signal_type=signal_type,
        direction=_score_to_direction(score),
        severity=_score_to_severity(score),
        confidence=round(score / 10.0, 3),
        score=round(score, 2),
        narrative=None,
        route=_score_to_route(score, signal_type),
    )


def build_signal_events(
    run_id: str,
    run_date: str,
    scores: Dict[str, Dict[str, float]],
    failed_tickers: List[str],
    synthesis: Optional[Dict[str, SynthesisResult]] = None,
) -> List[SignalEvent]:
    """
    Derive SignalEvent records from scoring output, enriched with LLM synthesis.

    Emits quality + momentum signals per scored ticker (with narrative when synthesis
    is available), news_catalyst signals for identified catalysts, and risk_flag
    signals for failed tickers.
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    events: List[SignalEvent] = []
    syn = synthesis or {}
    failed_set = set(failed_tickers)

    _catalyst_direction = {"positive": "up", "negative": "down", "neutral": "neutral"}
    _catalyst_severity = {"high": "high", "medium": "medium", "low": "low"}

    for ticker, score_block in scores.items():
        ticker_syn = syn.get(ticker)
        quality_score = score_block.get("quality", 0.0)
        momentum_score = score_block.get("momentum", 0.0)

        q_signal = _make_signal(run_id, run_date, timestamp, ticker, "quality", quality_score)
        if ticker_syn and ticker_syn.get("quality_narrative"):
            q_signal["narrative"] = ticker_syn["quality_narrative"]
        events.append(q_signal)

        m_signal = _make_signal(run_id, run_date, timestamp, ticker, "momentum", momentum_score)
        if ticker_syn and ticker_syn.get("momentum_narrative"):
            m_signal["narrative"] = ticker_syn["momentum_narrative"]
        events.append(m_signal)

        # Emit news_catalyst signal when the synthesizer identified one
        if ticker_syn:
            catalyst = ticker_syn.get("news_catalyst", {})
            if catalyst.get("present"):
                cat_fp = hashlib.sha256(f"{run_id}:{ticker}:news_catalyst".encode()).hexdigest()[:16]
                events.append(
                    SignalEvent(
                        id=cat_fp,
                        run_id=run_id,
                        run_date=run_date,
                        timestamp=timestamp,
                        ticker=ticker,
                        signal_type="news_catalyst",
                        direction=_catalyst_direction.get(catalyst.get("impact", "neutral"), "neutral"),
                        severity=_catalyst_severity.get(catalyst.get("strength", "low"), "low"),
                        confidence=0.8,
                        score=0.0,
                        narrative=catalyst.get("headline"),
                        route="ALERT_EVENT" if catalyst.get("strength") == "high" else "UI_UPDATE",
                    )
                )

    for ticker in failed_set:
        fingerprint = hashlib.sha256(f"{run_id}:{ticker}:risk_flag".encode()).hexdigest()[:16]
        events.append(
            SignalEvent(
                id=fingerprint,
                run_id=run_id,
                run_date=run_date,
                timestamp=timestamp,
                ticker=ticker,
                signal_type="risk_flag",
                direction="down",
                severity="high",
                confidence=1.0,
                score=0.0,
                narrative=None,
                route="ALERT_EVENT",
            )
        )

    return events
