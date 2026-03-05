"""
budget_manager.py — Per-run API call budget enforcer.

Thread-safe singleton. USE_MOCK_DATA=true bypasses all limits.
MAX_API_CALLS_PER_RUN env var controls hard cap (default 20).
"""
from __future__ import annotations

import logging
import os
import threading
from collections import defaultdict
from datetime import date
from typing import Dict, List

logger = logging.getLogger(__name__)

# Maps graph action names → provider names used in api_budget_log table
_PROVIDER_MAP = {
    "market": "marketstack",
    "fundamentals": "fmp",
    "news": "finnhub",
}


class BudgetManager:
    """Per-run API call budget enforcer. Thread-safe. USE_MOCK_DATA=true bypasses all limits."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # {run_id: {provider: call_count}}
        self._run_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

    @property
    def _max_calls_per_run(self) -> int:
        return int(os.environ.get("MAX_API_CALLS_PER_RUN", "20"))

    def _is_mock(self) -> bool:
        return os.environ.get("USE_MOCK_DATA", "true").lower() == "true"

    def can_call(self, action: str, run_id: str) -> bool:
        """Return True if budget allows this call. USE_MOCK_DATA=true always returns True."""
        if self._is_mock():
            return True
        with self._lock:
            total = sum(self._run_counts[run_id].values())
            return total < self._max_calls_per_run

    def record_call(self, action: str, run_id: str) -> None:
        """Increment in-memory counter and persist to DB. No-op in mock mode."""
        if self._is_mock():
            return
        provider = _PROVIDER_MAP.get(action, action)
        with self._lock:
            self._run_counts[run_id][provider] += 1
        try:
            # Deferred import to avoid circular dependency (event_store imports nothing from here)
            from .event_store import record_api_call
            record_api_call(date.today().isoformat(), provider, run_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("budget_manager: DB persist failed: %s", exc)

    def get_daily_usage(self, date_str: str) -> Dict[str, int]:
        """Return {provider: call_count} for a given date, sourced from DB."""
        try:
            from .event_store import get_api_budget_usage
            return get_api_budget_usage(date_str)
        except Exception:  # noqa: BLE001
            return {}

    def get_run_usage(self, run_id: str) -> Dict[str, int]:
        """Return in-memory call counts for this run."""
        with self._lock:
            return dict(self._run_counts.get(run_id, {}))

    def prioritize_tickers(
        self, universe: List[str], watchlist_tickers: List[str]
    ) -> List[str]:
        """Return universe sorted: watchlist tickers first, then the rest.
        Preserves ALL universe tickers; never drops any."""
        watchlist_set = {t.upper() for t in watchlist_tickers}
        prioritized = [t for t in universe if t.upper() in watchlist_set]
        rest = [t for t in universe if t.upper() not in watchlist_set]
        return prioritized + rest


# Module-level singleton — import `budget_manager` in graph.py
budget_manager = BudgetManager()
