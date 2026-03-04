from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def _clip(value: float, low: float = 0.0, high: float = 10.0) -> float:
    return max(low, min(high, value))


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_pct_if_ratio(v: Optional[float]) -> Optional[float]:
    if v is None:
        return None
    if -2.0 < v < 2.0:
        return v * 100.0
    return v


def momentum_weekly_return(prices: List[Dict[str, Any]]) -> Optional[float]:
    if len(prices) < 5:
        return None
    # prices sorted descending by date in tool; use oldest within 5 trading days
    close_latest = _safe_float(prices[0].get("close"))
    close_oldest = _safe_float(prices[4].get("close"))
    if close_latest is None or close_oldest in (None, 0):
        return None
    return ((close_latest / close_oldest) - 1.0) * 100.0


def quality_raw(metrics: Dict[str, Any]) -> float:
    roe = _to_pct_if_ratio(_safe_float(metrics.get("roe")))
    op_margin = _to_pct_if_ratio(_safe_float(metrics.get("operating_margin")))
    debt_to_equity = _safe_float(metrics.get("debt_to_equity"))
    rev_growth = _to_pct_if_ratio(_safe_float(metrics.get("revenue_growth")))
    eps_growth = _to_pct_if_ratio(_safe_float(metrics.get("eps_growth")))

    profitability_components = []
    if roe is not None:
        profitability_components.append(_clip((roe / 30.0) * 10.0))
    if op_margin is not None:
        profitability_components.append(_clip((op_margin / 40.0) * 10.0))
    profitability = sum(profitability_components) / len(profitability_components) if profitability_components else 5.0

    if debt_to_equity is None:
        balance = 5.0
    else:
        balance = _clip(10.0 - (debt_to_equity / 3.0) * 10.0)

    growth_proxy = rev_growth if rev_growth is not None else eps_growth
    if growth_proxy is None:
        growth = 5.0
    else:
        growth = _clip(((growth_proxy + 10.0) / 40.0) * 10.0)

    return (0.4 * profitability) + (0.3 * balance) + (0.3 * growth)


def normalize_to_0_10(raw_by_ticker: Dict[str, Optional[float]]) -> Dict[str, float]:
    valid = {k: v for k, v in raw_by_ticker.items() if v is not None}
    if not valid:
        return {k: 0.0 for k in raw_by_ticker.keys()}

    min_v = min(valid.values())
    max_v = max(valid.values())
    if max_v == min_v:
        return {k: (5.0 if raw_by_ticker[k] is not None else 0.0) for k in raw_by_ticker.keys()}

    out: Dict[str, float] = {}
    for ticker, value in raw_by_ticker.items():
        if value is None:
            out[ticker] = 0.0
        else:
            out[ticker] = ((value - min_v) / (max_v - min_v)) * 10.0
    return out


def quality_rating(score: float) -> str:
    if score >= 9:
        return "Strong"
    if score >= 8:
        return "Good"
    if score >= 7:
        return "Solid"
    return "Weak"


def momentum_rating(score: float) -> str:
    if score >= 9:
        return "Strong"
    if score >= 8:
        return "Positive"
    if score >= 7:
        return "Neutral"
    return "Negative"


def compute_all_scores(
    per_ticker_data: Dict[str, Dict[str, Any]], quality_weight: float = 0.55, momentum_weight: float = 0.45
) -> Tuple[Dict[str, Dict[str, float]], Dict[str, Dict[str, float]]]:
    raw_momentum: Dict[str, Optional[float]] = {}
    raw_quality: Dict[str, Optional[float]] = {}

    for ticker, data in per_ticker_data.items():
        prices = data.get("market", {}).get("prices", [])
        metrics = data.get("fundamentals", {}).get("metrics", {})
        raw_momentum[ticker] = momentum_weekly_return(prices)
        raw_quality[ticker] = quality_raw(metrics)

    momentum_scores = normalize_to_0_10(raw_momentum)
    quality_scores = normalize_to_0_10(raw_quality)

    combined: Dict[str, Dict[str, float]] = {}
    for ticker in per_ticker_data.keys():
        q = round(quality_scores.get(ticker, 0.0), 1)
        m = round(momentum_scores.get(ticker, 0.0), 1)
        overall = round((quality_weight * q) + (momentum_weight * m), 1)
        combined[ticker] = {"quality": q, "momentum": m, "overall": overall}

    raw_components = {
        "raw_momentum": {k: (round(v, 4) if v is not None else None) for k, v in raw_momentum.items()},
        "raw_quality": {k: (round(v, 4) if v is not None else None) for k, v in raw_quality.items()},
    }
    return combined, raw_components
