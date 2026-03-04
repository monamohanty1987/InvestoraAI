from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .base import HTTPCachedTool, MCPToolError


class NewsInput(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    end_date: Optional[str] = None


class NewsTool(HTTPCachedTool):
    def __init__(self) -> None:
        super().__init__(cache_dir="data/cache", min_sleep_s=0.4)
        self.base_url = os.environ.get("NEWS_API_BASE_URL", "https://finnhub.io/api/v1")
        self.api_key = os.environ["NEWS_API_KEY"]

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        model = NewsInput(**payload)
        ticker = model.ticker.upper()

        to_date = datetime.strptime(model.end_date, "%Y-%m-%d").date() if model.end_date else datetime.utcnow().date()
        from_date = to_date - timedelta(days=7)

        cache_payload = {"tool": "news", "ticker": ticker, "from": str(from_date), "to": str(to_date)}
        cached = self._read_cache("news", cache_payload)
        if cached:
            return cached

        params = {
            "symbol": ticker,
            "from": str(from_date),
            "to": str(to_date),
            "token": self.api_key,
        }
        data = self._get_with_retry(f"{self.base_url}/company-news", params)
        if not isinstance(data, list):
            raise MCPToolError(f"Finnhub invalid payload for {ticker}")

        items: List[Dict[str, Any]] = []
        for row in data[:10]:
            items.append(
                {
                    "headline": row.get("headline", ""),
                    "summary": row.get("summary", ""),
                    "source": row.get("source", ""),
                    "datetime": row.get("datetime"),
                    "url": row.get("url", ""),
                }
            )

        normalized = {
            "ticker": ticker,
            "source": "Finnhub",
            "articles": items,
        }
        self._write_cache("news", cache_payload, normalized)
        return normalized
