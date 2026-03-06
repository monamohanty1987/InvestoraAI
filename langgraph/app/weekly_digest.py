from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List

from .event_store import load_recent_runs, load_run


def _iso_today() -> str:
    return datetime.utcnow().date().isoformat()


def _safe_narrative(ev: Dict[str, Any]) -> str:
    text = str(ev.get("narrative") or "").strip()
    if text:
        return text
    ticker = str(ev.get("ticker", "")).upper()
    signal_type = str(ev.get("signal_type", "signal")).replace("_", " ")
    severity = str(ev.get("severity", "low"))
    return f"{ticker} emitted a {severity} {signal_type} signal this week."


def build_weekly_user_digest(
    user_profile: Dict[str, Any],
    latest_bundle: Dict[str, Any],
    lookback_days: int = 7,
) -> Dict[str, Any]:
    """
    Build a weekly user digest from recent runs + latest personalized bundle.

    This is intentionally deterministic/rule-based for reliability in notification
    delivery and to avoid adding LLM latency/cost to the weekly mail path.
    """
    run_date = str(latest_bundle.get("run_date") or _iso_today())
    run_day = date.fromisoformat(run_date)
    week_start = (run_day - timedelta(days=lookback_days - 1)).isoformat()
    week_end = run_date

    watchlist = {str(t).upper() for t in user_profile.get("watchlist", [])}
    recent_runs = load_recent_runs(limit=60)
    weekly_events: List[Dict[str, Any]] = []

    for meta in recent_runs:
        d = str(meta.get("run_date", ""))
        if not d or d < week_start or d > week_end:
            continue
        run_id = str(meta.get("run_id", ""))
        if not run_id:
            continue
        snap = load_run(run_id)
        if not snap:
            continue
        weekly_events.extend(snap.get("signal_events", []))

    relevant_events = [
        ev
        for ev in weekly_events
        if str(ev.get("ticker", "")).upper() in watchlist
        or str(ev.get("route", "")) == "ALERT_EVENT"
    ]

    high_events = [ev for ev in relevant_events if str(ev.get("severity", "")).lower() in {"high", "critical"}]
    alert_events = [ev for ev in relevant_events if str(ev.get("route", "")) == "ALERT_EVENT"]

    ticker_counts: Dict[str, int] = {}
    for ev in relevant_events:
        t = str(ev.get("ticker", "")).upper()
        if not t:
            continue
        ticker_counts[t] = ticker_counts.get(t, 0) + 1

    top_weekly_tickers = sorted(ticker_counts.items(), key=lambda kv: kv[1], reverse=True)[:5]

    ranked_weekly = sorted(
        relevant_events,
        key=lambda ev: float(ev.get("score", 0.0)),
        reverse=True,
    )[:5]

    portfolio_pulse = {
        "watchlist_performance": latest_bundle.get("watchlist_performance", {}),
        "market_regime": latest_bundle.get("market_regime", "Neutral"),
        "risk_alignment": latest_bundle.get("risk_alignment", "Aligned"),
    }

    top_conviction = list(latest_bundle.get("top_conviction", []))[:3]
    watchlist_attention = list(latest_bundle.get("watchlist_signals", []))[:5]
    discovery = list(latest_bundle.get("discovery_signals", []))[:6]

    next_actions: List[str] = []
    for row in watchlist_attention:
        ticker = str(row.get("ticker", "")).upper()
        action = str(row.get("action_frame", "Monitor"))
        if ticker:
            next_actions.append(f"{ticker}: {action}")
        if len(next_actions) >= 3:
            break
    if not next_actions:
        next_actions = ["No urgent action required this week.", "Monitor watchlist for new changes.", "Re-run analysis after profile updates."]

    return {
        "user_id": user_profile.get("user_id", ""),
        "email": str(user_profile.get("email", "")),
        "telegram_chat_id": str(user_profile.get("telegram_chat_id", "")),
        "run_id": latest_bundle.get("run_id", ""),
        "run_date": run_date,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "week_start": week_start,
        "week_end": week_end,
        "weekly_stats": {
            "total_signals": len(relevant_events),
            "high_priority_signals": len(high_events),
            "alert_events": len(alert_events),
            "top_tickers": [{"ticker": t, "count": c} for t, c in top_weekly_tickers],
        },
        "top_weekly_signals": [
            {
                "ticker": str(ev.get("ticker", "")).upper(),
                "signal_type": ev.get("signal_type", ""),
                "severity": ev.get("severity", ""),
                "score": float(ev.get("score", 0.0)),
                "narrative": _safe_narrative(ev),
            }
            for ev in ranked_weekly
        ],
        "portfolio_pulse": portfolio_pulse,
        "top_conviction": top_conviction,
        "watchlist_attention": watchlist_attention,
        "discovery": discovery,
        "next_actions": next_actions,
    }

