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
        results = self.run_many([model.ticker.upper()])
        ticker = model.ticker.upper()
        if ticker not in results:
            raise MCPToolError(f"MarketDataTool: no data returned for {ticker}")
        return results[ticker]

    def run_many(self, tickers: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Batch market fetch for multiple tickers using one Marketstack request when possible.
        Returns {ticker: normalized_payload}.
        """
        normalized_tickers = sorted({str(t).upper() for t in tickers if str(t).strip()})
        if not normalized_tickers:
            return {}

        out: Dict[str, Dict[str, Any]] = {}
        misses: List[str] = []

        # First satisfy from per-ticker cache
        for ticker in normalized_tickers:
            cache_payload = {"tool": "market", "provider": "marketstack", "ticker": ticker}
            cached = self._read_cache("market", cache_payload)
            if cached:
                out[ticker] = cached
            else:
                misses.append(ticker)

        if not misses:
            return out

        params = {
            "access_key": self.api_key,
            "symbols": ",".join(misses),
            "limit": 30,
            "sort": "DESC",
        }
        data = self._get_with_retry(f"{self.base_url}/eod", params)
        if isinstance(data.get("error"), dict):
            message = str(data["error"].get("message", "Unknown Marketstack API error"))
            message_l = message.lower()
            if "rate limit" in message_l or "request limit" in message_l:
                raise MCPToolError("Marketstack rate limit reached for batch request.")
            raise MCPToolError(f"Marketstack API batch error: {message}")

        series = data.get("data")
        if not isinstance(series, list) or not series:
            raise MCPToolError(f"Marketstack invalid batch payload: {str(data)[:200]}")

        rows_by_ticker: Dict[str, List[Dict[str, Any]]] = {t: [] for t in misses}
        for p in series:
            try:
                symbol = str(p["symbol"]).upper()
                if symbol not in rows_by_ticker:
                    continue
                raw_date = str(p["date"])
                rows_by_ticker[symbol].append({"date": raw_date[:10], "close": float(p["close"])})
            except (KeyError, ValueError, TypeError) as exc:
                raise MCPValidationError(f"Bad market row in batch payload: {exc}") from exc

        for ticker in misses:
            rows = rows_by_ticker.get(ticker, [])
            rows.sort(key=lambda x: x["date"], reverse=True)
            if not rows:
                continue
            normalized = {
                "ticker": ticker,
                "source": "Marketstack",
                "prices": rows[:7],
            }
            cache_payload = {"tool": "market", "provider": "marketstack", "ticker": ticker}
            self._write_cache("market", cache_payload, normalized)
            out[ticker] = normalized

        return out
