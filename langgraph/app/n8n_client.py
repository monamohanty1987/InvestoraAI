from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

import requests


logger = logging.getLogger(__name__)


def post_candidates_to_n8n(
    candidate_signals: List[Dict[str, Any]],
    run_id: str,
    run_date: str,
    timeout: int = 15,
) -> None:
    """POST WEEKLY_CANDIDATE signals to the n8n candidates webhook.

    Soft-fails when CANDIDATE_WEBHOOK_URL is not configured.
    """
    url = os.environ.get("CANDIDATE_WEBHOOK_URL", "")
    if not url:
        logger.info("post_candidates_to_n8n: CANDIDATE_WEBHOOK_URL not set; skipping.")
        return

    payload: Dict[str, Any] = {
        "run_id": run_id,
        "run_date": run_date,
        "candidate_count": len(candidate_signals),
        "candidates": [
            {
                "ticker": ev["ticker"],
                "signal_type": ev["signal_type"],
                "direction": ev["direction"],
                "severity": ev["severity"],
                "score": ev["score"],
                "narrative": ev.get("narrative"),
            }
            for ev in candidate_signals
        ],
    }

    response = requests.post(url, json=payload, timeout=timeout)
    logger.info(
        "post_candidates_to_n8n",
        extra={"status_code": response.status_code, "candidate_count": len(candidate_signals)},
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
