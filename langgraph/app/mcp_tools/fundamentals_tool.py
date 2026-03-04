from __future__ import annotations

import os
from typing import Any, Dict

from pydantic import BaseModel, Field

from .base import HTTPCachedTool, MCPToolError


class FundamentalsInput(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)


class FundamentalsTool(HTTPCachedTool):
    def __init__(self) -> None:
        super().__init__(cache_dir="data/cache", min_sleep_s=0.6)
        self.base_url = os.environ.get("FUNDAMENTALS_API_BASE_URL", "https://financialmodelingprep.com")
        self.api_key = os.environ["FUNDAMENTALS_API_KEY"]

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        model = FundamentalsInput(**payload)
        ticker = model.ticker.upper()
        cache_payload = {"tool": "fundamentals", "ticker": ticker}
        cached = self._read_cache("fundamentals", cache_payload)
        if cached:
            return cached

        endpoints = [
            f"{self.base_url}/api/v3/key-metrics-ttm/{ticker}",
            f"{self.base_url}/api/v3/ratios-ttm/{ticker}",
        ]

        payloads = []
        for url in endpoints:
            params = {"apikey": self.api_key}
            data = self._get_with_retry(url, params)
            if isinstance(data, list) and data:
                payloads.append(data[0])
            else:
                payloads.append({})

        merged: Dict[str, Any] = {}
        for p in payloads:
            merged.update(p)

        if not merged:
            raise MCPToolError(f"No fundamentals for {ticker}")

        normalized = {
            "ticker": ticker,
            "source": "Financial Modeling Prep",
            "metrics": {
                "roe": merged.get("roe") or merged.get("returnOnEquityTTM"),
                "operating_margin": merged.get("operatingProfitMarginTTM") or merged.get("operatingProfitMargin"),
                "debt_to_equity": merged.get("debtEquityRatioTTM") or merged.get("debtToEquity"),
                "revenue_growth": merged.get("revenueGrowth") or merged.get("revenueGrowthTTM"),
                "eps_growth": merged.get("epsGrowth") or merged.get("epsGrowthTTM"),
            },
        }
        self._write_cache("fundamentals", cache_payload, normalized)
        return normalized
