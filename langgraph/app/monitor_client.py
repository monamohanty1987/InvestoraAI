from __future__ import annotations

import logging
import os
from typing import Any, Dict

import requests

logger = logging.getLogger(__name__)


def post_monitor_event(
    run_id: str,
    run_date: str,
    status: str,
    scope: str,
    error_count: int,
    signal_count: int,
    duration_hint: str = "",
    timeout: int = 10,
) -> None:
    """POST a run-complete or run-error monitoring event to MONITOR_WEBHOOK_URL.

    Soft-fails when MONITOR_WEBHOOK_URL is not configured so existing runs
    without the env var are unaffected.
    """
    url = os.environ.get("MONITOR_WEBHOOK_URL", "")
    if not url:
        logger.info("post_monitor_event: MONITOR_WEBHOOK_URL not set; skipping.")
        return

    payload: Dict[str, Any] = {
        "run_id": run_id,
        "run_date": run_date,
        "status": status,          # "ok" | "error"
        "scope": scope,
        "error_count": error_count,
        "signal_count": signal_count,
        "duration": duration_hint,
    }

    try:
        response = requests.post(url, json=payload, timeout=timeout)
        logger.info(
            "post_monitor_event",
            extra={"status_code": response.status_code, "run_status": status},
        )
        if response.status_code >= 400:
            logger.warning("Monitor webhook returned %s: %s", response.status_code, response.text[:200])
    except Exception as exc:  # noqa: BLE001
        # Monitoring must never break the main flow — log and swallow
        logger.warning("post_monitor_event failed: %s", exc)
