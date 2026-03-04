from __future__ import annotations

import os
from typing import Any, Dict, List

from pydantic import BaseModel, Field

from .base import HTTPCachedTool, MCPToolError, MCPValidationError


class MarketDataInput(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)


class MarketDataTool(HTTPCachedTool):
    def __init__(self) -> None:
        super().__init__(cache_dir="data/cache", min_sleep_s=1.0)
        self.base_url = os.environ.get("MARKET_DATA_API_BASE_URL", "https://api.marketstack.com/v1")
        self.api_key = os.environ["MARKET_DATA_API_KEY"]

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        model = MarketDataInput(**payload)
        cache_payload = {"tool": "market", "provider": "marketstack", "ticker": model.ticker.upper()}
        cached = self._read_cache("market", cache_payload)
        if cached:
            return cached

        params = {
            "access_key": self.api_key,
            "symbols": model.ticker.upper(),
            "limit": 30,
            "sort": "DESC",
        }
        data = self._get_with_retry(f"{self.base_url}/eod", params)
        if isinstance(data.get("error"), dict):
            message = str(data["error"].get("message", "Unknown Marketstack API error"))
            message_l = message.lower()
            if "rate limit" in message_l or "request limit" in message_l:
                raise MCPToolError(
                    f"Marketstack rate limit reached for key; cannot fetch {model.ticker} until reset."
                )
            raise MCPToolError(f"Marketstack API error for {model.ticker}: {message}")

        series = data.get("data")
        if not isinstance(series, list) or not series:
            raise MCPToolError(f"Marketstack invalid payload for {model.ticker}: {str(data)[:200]}")

        rows: List[Dict[str, Any]] = []
        for p in series:
            try:
                raw_date = str(p["date"])
                rows.append({"date": raw_date[:10], "close": float(p["close"])})
            except (KeyError, ValueError, TypeError) as exc:
                raise MCPValidationError(f"Bad market row for {model.ticker}: {exc}") from exc

        rows.sort(key=lambda x: x["date"], reverse=True)
        normalized = {
            "ticker": model.ticker.upper(),
            "source": "Marketstack",
            "prices": rows[:7],
        }
        self._write_cache("market", cache_payload, normalized)
        return normalized
