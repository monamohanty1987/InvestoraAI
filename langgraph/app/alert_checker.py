from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def evaluate_price_alert(
    alert: Dict[str, Any],
    current_price: float,
    daily_change_pct: float,
) -> bool:
    """Return True if the alert condition is met."""
    condition = alert["condition"]
    threshold = float(alert["value"])
    if condition in {"price_above", "above"}:
        return current_price > threshold
    if condition in {"price_below", "below"}:
        return current_price < threshold
    if condition in {"daily_move", "change_pct_up", "change_pct_down"}:
        return abs(daily_change_pct) > threshold
    logger.warning("evaluate_price_alert: unknown condition '%s'", condition)
    return False


def check_user_alerts() -> List[Dict[str, Any]]:
    """Load active user alerts, fetch live prices, evaluate conditions.

    Marks triggered alerts in SQLite and returns a list of triggered alert dicts
    suitable for inclusion in the n8n notification payload.
    """
    from .event_store import get_active_alerts, init_db, mark_alert_triggered
    from .mcp_tools.yfinance_tool import YFinanceTool

    init_db()
    alerts = get_active_alerts()
    if not alerts:
        return []

    tickers = list({a["ticker"] for a in alerts})
    try:
        quotes = YFinanceTool().get_quotes(tickers)
    except Exception as exc:  # noqa: BLE001
        logger.warning("check_user_alerts: failed to fetch quotes: %s", exc)
        return []

    triggered: List[Dict[str, Any]] = []
    for alert in alerts:
        ticker = alert["ticker"]
        quote = quotes.get(ticker, {})
        if not isinstance(quote, dict):
            continue
        price = quote.get("price")
        if price is None:
            continue
        daily_chg = quote.get("change_pct") or 0.0
        try:
            if evaluate_price_alert(alert, float(price), float(daily_chg)):
                mark_alert_triggered(alert["id"])
                triggered.append(
                    {
                        "alert_id": alert["id"],
                        "user_id": alert["user_id"],
                        "ticker": ticker,
                        "condition": alert["condition"],
                        "value": alert["value"],
                        "current_price": price,
                        "daily_change_pct": daily_chg,
                    }
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("check_user_alerts: error evaluating alert %s: %s", alert["id"], exc)

    logger.info(
        "check_user_alerts: evaluated %d alerts, %d triggered",
        len(alerts),
        len(triggered),
    )
    return triggered
