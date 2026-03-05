from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

import requests

from .models import SignalEvent

logger = logging.getLogger(__name__)


def post_alerts_to_n8n(
    alert_signals: List[SignalEvent],
    run_id: str,
    run_date: str,
    timeout: int = 15,
) -> None:
    """POST alert-routed signals to the n8n alert webhook.

    Soft-fails when ALERT_WEBHOOK_URL is not configured so existing runs
    without the env var are unaffected.
    """
    url = os.environ.get("ALERT_WEBHOOK_URL", "")
    if not url:
        logger.info("post_alerts_to_n8n: ALERT_WEBHOOK_URL not set; skipping.")
        return

    payload: Dict[str, Any] = {
        "run_id": run_id,
        "run_date": run_date,
        "alert_count": len(alert_signals),
        "alerts": [
            {
                "ticker": ev["ticker"],
                "signal_type": ev["signal_type"],
                "direction": ev["direction"],
                "severity": ev["severity"],
                "score": ev["score"],
                "narrative": ev.get("narrative"),
            }
            for ev in alert_signals
        ],
    }

    response = requests.post(url, json=payload, timeout=timeout)
    logger.info(
        "post_alerts_to_n8n",
        extra={"status_code": response.status_code, "alert_count": len(alert_signals)},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Alert webhook failed {response.status_code}: {response.text[:200]}")


def post_user_alerts_to_n8n(
    triggered_alerts: List[Dict[str, Any]],
    run_id: str,
    run_date: str,
    timeout: int = 15,
) -> None:
    """POST user-defined triggered alerts to the n8n alert webhook.

    Soft-fails when ALERT_WEBHOOK_URL is not configured.
    """
    url = os.environ.get("ALERT_WEBHOOK_URL", "")
    if not url:
        logger.info("post_user_alerts_to_n8n: ALERT_WEBHOOK_URL not set; skipping.")
        return

    payload: Dict[str, Any] = {
        "run_id": run_id,
        "run_date": run_date,
        "type": "user_alerts",
        "alert_count": len(triggered_alerts),
        "alerts": [
            {
                "alert_id": a["alert_id"],
                "user_id": a["user_id"],
                "ticker": a["ticker"],
                "condition": a["condition"],
                "threshold": a["value"],
                "current_price": a["current_price"],
                "daily_change_pct": a.get("daily_change_pct"),
            }
            for a in triggered_alerts
        ],
    }

    response = requests.post(url, json=payload, timeout=timeout)
    logger.info(
        "post_user_alerts_to_n8n",
        extra={"status_code": response.status_code, "alert_count": len(triggered_alerts)},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"User alert webhook failed {response.status_code}: {response.text[:200]}")
