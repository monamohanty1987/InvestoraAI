"""
Mock implementations of MarketDataTool, FundamentalsTool, and NewsTool.

Activated when USE_MOCK_DATA=true in the environment.  Each mock class
returns data in the exact same schema as the real tool so every downstream
step (scoring, reporting, persisting, API serving) works without change.

Mock data covers 10 tickers with realistic variance so quality/momentum
scores produce a meaningful ranking:

  Strong momentum  : NVDA (+8.3%), MSFT (+5.1%)
  Positive momentum: GOOGL (+4.1%), META (+3.1%), AAPL (+2.2%)
  Neutral          : V (+0.7%), AMZN (+0.6%)
  Negative momentum: MA (-1.1%), JPM (-2.0%), TSLA (-5.4%)

  Strong quality   : NVDA, MSFT, V (high ROE + margins)
  Good quality     : AAPL, META, GOOGL
  Solid quality    : MA, AMZN
  Weak quality     : JPM, TSLA
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List

from .base import MCPToolError

# ── Price series helpers ──────────────────────────────────────────────────────

def _price_series(closes: List[float]) -> List[Dict[str, Any]]:
    """
    Build a list of {"date": str, "close": float} from a list of close prices.
    Closes are provided most-recent-first.  Dates are assigned starting from
    2026-02-28 and going backwards, skipping weekends.
    """
    anchor = date(2026, 2, 28)
    rows: List[Dict[str, Any]] = []
    d = anchor
    for close in closes:
        while d.weekday() > 4:  # skip Saturday (5) and Sunday (6)
            d -= timedelta(days=1)
        rows.append({"date": d.isoformat(), "close": close})
        d -= timedelta(days=1)
    return rows


# ── Mock market prices (most-recent-first, 7 trading days) ────────────────────
# Weekly return = (closes[0] - closes[4]) / closes[4] * 100
_MARKET_CLOSES: Dict[str, List[float]] = {
    "NVDA":  [520.0, 510.0, 500.0, 492.0, 480.0, 475.0, 470.0],   # +8.3%
    "MSFT":  [415.0, 410.0, 405.0, 400.0, 395.0, 392.0, 390.0],   # +5.1%
    "GOOGL": [178.0, 176.0, 174.0, 172.0, 171.0, 170.0, 169.0],   # +4.1%
    "META":  [505.0, 500.0, 497.0, 494.0, 490.0, 488.0, 485.0],   # +3.1%
    "AAPL":  [185.0, 184.0, 183.0, 182.0, 181.0, 180.0, 179.0],   # +2.2%
    "V":     [272.0, 271.5, 271.0, 270.5, 270.0, 269.5, 269.0],   # +0.7%
    "AMZN":  [182.0, 181.5, 181.0, 181.0, 181.0, 180.0, 179.0],   # +0.6%
    "MA":    [460.0, 461.0, 462.0, 463.0, 465.0, 466.0, 467.0],   # -1.1%
    "JPM":   [195.0, 196.0, 197.0, 198.0, 199.0, 200.0, 201.0],   # -2.0%
    "TSLA":  [175.0, 177.0, 179.0, 182.0, 185.0, 187.0, 190.0],   # -5.4%
}

# ── Mock fundamental metrics ──────────────────────────────────────────────────
# roe / operating_margin / revenue_growth / eps_growth are decimals (e.g. 0.45
# for 45%).  scoring.py's _to_pct_if_ratio() multiplies values in (-2, 2) by
# 100, so these are correctly interpreted as percentages.
# debt_to_equity is a plain ratio and is used directly.
_MOCK_FUNDAMENTALS: Dict[str, Dict[str, Any]] = {
    "AAPL":  {"roe": 0.45, "operating_margin": 0.30, "debt_to_equity": 1.5,
              "revenue_growth": 0.06,  "eps_growth": 0.10},
    "MSFT":  {"roe": 0.38, "operating_margin": 0.42, "debt_to_equity": 0.7,
              "revenue_growth": 0.16,  "eps_growth": 0.20},
    "NVDA":  {"roe": 0.55, "operating_margin": 0.55, "debt_to_equity": 0.4,
              "revenue_growth": 1.22,  "eps_growth": 1.30},
    "AMZN":  {"roe": 0.15, "operating_margin": 0.06, "debt_to_equity": 1.0,
              "revenue_growth": 0.13,  "eps_growth": 0.25},
    "GOOGL": {"roe": 0.22, "operating_margin": 0.25, "debt_to_equity": 0.1,
              "revenue_growth": 0.14,  "eps_growth": 0.18},
    "META":  {"roe": 0.32, "operating_margin": 0.35, "debt_to_equity": 0.2,
              "revenue_growth": 0.22,  "eps_growth": 0.28},
    "TSLA":  {"roe": 0.08, "operating_margin": 0.05, "debt_to_equity": 0.2,
              "revenue_growth": 0.03,  "eps_growth": -0.10},
    "JPM":   {"roe": 0.14, "operating_margin": 0.28, "debt_to_equity": 0.9,
              "revenue_growth": 0.08,  "eps_growth": 0.12},
    "V":     {"roe": 0.42, "operating_margin": 0.65, "debt_to_equity": 1.8,
              "revenue_growth": 0.10,  "eps_growth": 0.14},
    "MA":    {"roe": 0.38, "operating_margin": 0.55, "debt_to_equity": 2.2,
              "revenue_growth": 0.12,  "eps_growth": 0.15},
}

# ── Mock news headlines ───────────────────────────────────────────────────────
# Timestamps are approximate Unix seconds for late February 2026.
_MOCK_NEWS: Dict[str, List[Dict[str, Any]]] = {
    "AAPL": [
        {"headline": "Apple services revenue hits record as iPhone growth slows",
         "summary": "", "source": "Reuters", "datetime": 1772150000, "url": ""},
        {"headline": "Apple Vision Pro production cut as demand disappoints analysts",
         "summary": "", "source": "Bloomberg", "datetime": 1772060000, "url": ""},
    ],
    "MSFT": [
        {"headline": "Microsoft Copilot drives Azure growth to 33% year-over-year",
         "summary": "", "source": "CNBC", "datetime": 1772150000, "url": ""},
        {"headline": "Microsoft beats Q4 estimates on AI and enterprise demand",
         "summary": "", "source": "Reuters", "datetime": 1772060000, "url": ""},
    ],
    "NVDA": [
        {"headline": "NVIDIA data-centre revenue surges as AI chip demand remains insatiable",
         "summary": "", "source": "Bloomberg", "datetime": 1772150000, "url": ""},
        {"headline": "NVIDIA H200 supply constrained through 2026 amid hyperscaler orders",
         "summary": "", "source": "Reuters", "datetime": 1772060000, "url": ""},
    ],
    "AMZN": [
        {"headline": "Amazon Web Services grows 18% as enterprise cloud adoption accelerates",
         "summary": "", "source": "CNBC", "datetime": 1772150000, "url": ""},
        {"headline": "Amazon advertising overtakes Google in retail search spending",
         "summary": "", "source": "Bloomberg", "datetime": 1772060000, "url": ""},
    ],
    "GOOGL": [
        {"headline": "Alphabet ad revenue rebounds as AI search integrations gain traction",
         "summary": "", "source": "Reuters", "datetime": 1772150000, "url": ""},
        {"headline": "Google DeepMind releases new reasoning model challenging OpenAI",
         "summary": "", "source": "CNBC", "datetime": 1772060000, "url": ""},
    ],
    "META": [
        {"headline": "Meta Llama 4 adoption accelerates enterprise AI deployments",
         "summary": "", "source": "Bloomberg", "datetime": 1772150000, "url": ""},
        {"headline": "Meta advertising revenue up 22% driven by Reels and AI targeting",
         "summary": "", "source": "Reuters", "datetime": 1772060000, "url": ""},
    ],
    "TSLA": [
        {"headline": "Tesla vehicle deliveries miss estimates for third consecutive quarter",
         "summary": "", "source": "Reuters", "datetime": 1772150000, "url": ""},
        {"headline": "Tesla faces intensifying competition from Chinese EVs in Europe",
         "summary": "", "source": "Bloomberg", "datetime": 1772060000, "url": ""},
    ],
    "JPM": [
        {"headline": "JPMorgan beats earnings but warns of softening loan demand",
         "summary": "", "source": "CNBC", "datetime": 1772150000, "url": ""},
        {"headline": "JPMorgan raises credit-loss provisions amid consumer stress signals",
         "summary": "", "source": "Reuters", "datetime": 1772060000, "url": ""},
    ],
    "V": [
        {"headline": "Visa cross-border payment volumes up 12% as travel spending recovers",
         "summary": "", "source": "Bloomberg", "datetime": 1772150000, "url": ""},
        {"headline": "Visa expands stablecoin settlement network to new markets",
         "summary": "", "source": "CNBC", "datetime": 1772060000, "url": ""},
    ],
    "MA": [
        {"headline": "Mastercard sees slower consumer spending in discretionary categories",
         "summary": "", "source": "Reuters", "datetime": 1772150000, "url": ""},
        {"headline": "Mastercard expands open banking services across EMEA region",
         "summary": "", "source": "Bloomberg", "datetime": 1772060000, "url": ""},
    ],
}


# ── Mock tool classes ─────────────────────────────────────────────────────────

class MockMarketDataTool:
    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ticker = str(payload.get("ticker", "")).upper()
        if ticker not in _MARKET_CLOSES:
            raise MCPToolError(f"MockMarketDataTool: no mock data for ticker '{ticker}'")
        return {
            "ticker": ticker,
            "source": "Mock (Marketstack)",
            "prices": _price_series(_MARKET_CLOSES[ticker]),
        }


class MockFundamentalsTool:
    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ticker = str(payload.get("ticker", "")).upper()
        if ticker not in _MOCK_FUNDAMENTALS:
            raise MCPToolError(f"MockFundamentalsTool: no mock data for ticker '{ticker}'")
        return {
            "ticker": ticker,
            "source": "Mock (Financial Modeling Prep)",
            "metrics": _MOCK_FUNDAMENTALS[ticker],
        }


class MockNewsTool:
    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ticker = str(payload.get("ticker", "")).upper()
        return {
            "ticker": ticker,
            "source": "Mock (Finnhub)",
            "articles": _MOCK_NEWS.get(ticker, []),
        }


class MockRAGRetrievalTool:
    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ticker = str(payload.get("ticker", "")).upper()
        return {
            "ticker": ticker,
            "query": str(payload.get("query", "")),
            "matches": [],
            "retrieved_count": 0,
            "enabled": False,
        }
