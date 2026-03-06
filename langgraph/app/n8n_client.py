from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

import requests


logger = logging.getLogger(__name__)


def post_candidates_to_n8n(
    weekly_digest: Dict[str, Any],
    run_id: str,
    run_date: str,
    timeout: int = 15,
) -> None:
    """POST a user-specific weekly digest payload to the n8n candidates webhook."""
    url = os.environ.get(
        "CANDIDATE_WEBHOOK_URL",
        "https://ai-experiementation.app.n8n.cloud/webhook/investora-candidates",
    )

    payload: Dict[str, Any] = {
        "user_id": weekly_digest.get("user_id", ""),
        "email": weekly_digest.get("email", ""),
        "to": weekly_digest.get("email", ""),
        "telegram_chat_id": weekly_digest.get("telegram_chat_id", ""),
        "run_id": run_id,
        "run_date": run_date,
        "week_start": weekly_digest.get("week_start", ""),
        "week_end": weekly_digest.get("week_end", ""),
        "generated_at": weekly_digest.get("generated_at", ""),
        "weekly_stats": weekly_digest.get("weekly_stats", {}),
        "portfolio_pulse": weekly_digest.get("portfolio_pulse", {}),
        "top_weekly_signals": weekly_digest.get("top_weekly_signals", []),
        "top_conviction": weekly_digest.get("top_conviction", []),
        "watchlist_attention": weekly_digest.get("watchlist_attention", []),
        "discovery": weekly_digest.get("discovery", []),
        "next_actions": weekly_digest.get("next_actions", []),
    }

    response = requests.post(url, json=payload, timeout=timeout)
    logger.info(
        "post_candidates_to_n8n",
        extra={
            "status_code": response.status_code,
            "user_id": weekly_digest.get("user_id", ""),
            "top_weekly_signals": len(weekly_digest.get("top_weekly_signals", [])),
        },
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Candidate webhook failed {response.status_code}: {response.text[:200]}")


def post_report_to_n8n(report_json: Dict[str, Any], timeout: int = 30) -> Dict[str, Any]:
    url = os.environ.get(
        "N8N_WEBHOOK_URL", "https://ai-experiementation.app.n8n.cloud/webhook-test/langgraph-results"
    )
    headers = {"Content-Type": "application/json"}

    response = requests.post(url, headers=headers, data=json.dumps(report_json), timeout=timeout)
    logger.info("Posted report to n8n", extra={"status_code": response.status_code, "url": url})

    if response.status_code >= 400:
        raise RuntimeError(f"n8n webhook failed {response.status_code}: {response.text[:200]}")

    body: Any
    try:
        body = response.json()
    except Exception:
        body = response.text

    return {"status_code": response.status_code, "response": body}
