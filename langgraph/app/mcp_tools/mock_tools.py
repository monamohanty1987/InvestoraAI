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

import hashlib
import json
from datetime import date, timedelta
from pathlib import Path
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

# ── Universe-backed synthetic data helpers (for 100-ticker mock mode) ─────────

_UNIVERSE_PATH = Path(__file__).resolve().parents[2] / "data" / "universe_mock.json"


def _load_universe_index() -> Dict[str, Dict[str, Any]]:
    try:
        with _UNIVERSE_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        out: Dict[str, Dict[str, Any]] = {}
        for row in payload.get("tickers", []):
            ticker = str(row.get("ticker", "")).upper()
            if ticker:
                out[ticker] = row
        return out
    except Exception:
        return {}


_UNIVERSE_INDEX: Dict[str, Dict[str, Any]] = _load_universe_index()


def _stable_unit(ticker: str) -> float:
    """Deterministic pseudo-random float in [0, 1] based on ticker."""
    h = hashlib.sha256(ticker.encode("utf-8")).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _series_from_momentum_score(ticker: str, momentum_score: float) -> List[float]:
    """
    Build 7 closes (most-recent-first) that approximately encode a weekly return
    implied by momentum_score on a 0-10 scale.
    """
    # Map score 0..10 -> roughly -8%..+8% weekly move
    weekly_return_pct = (momentum_score - 5.0) * 1.6
    base_price = 40.0 + _stable_unit(ticker) * 460.0
    denom = 1.0 + (weekly_return_pct / 100.0)
    if abs(denom) < 1e-6:
        denom = 1.0
    price4 = base_price / denom
    step = (base_price - price4) / 4.0
    # slight deterministic tail variation for days 5/6
    tail = (0.2 + _stable_unit(f"{ticker}-tail") * 0.8) * (1 if step >= 0 else -1)
    closes = [
        round(base_price, 2),
        round(base_price - step, 2),
        round(base_price - 2 * step, 2),
        round(base_price - 3 * step, 2),
        round(price4, 2),
        round(price4 - tail, 2),
        round(price4 - 2 * tail, 2),
    ]
    # Guard against non-positive prices from edge math
    return [max(1.0, c) for c in closes]


def _fundamentals_from_quality_score(quality_score: float) -> Dict[str, Any]:
    """
    Map quality score (0-10) to plausible ratio metrics expected by scoring.py.
    """
    q = max(0.0, min(10.0, quality_score))
    qn = q / 10.0
    return {
        "roe": round(0.05 + 0.55 * qn, 3),               # 5%..60%
        "operating_margin": round(0.04 + 0.46 * qn, 3),  # 4%..50%
        "debt_to_equity": round(2.5 - 2.2 * qn, 3),      # 2.5..0.3 (lower is better)
        "revenue_growth": round(-0.02 + 0.30 * qn, 3),   # -2%..28%
        "eps_growth": round(-0.05 + 0.40 * qn, 3),       # -5%..35%
    }


def _synthetic_news(universe_row: Dict[str, Any], ticker: str) -> List[Dict[str, Any]]:
    name = str(universe_row.get("name", ticker))
    sector = str(universe_row.get("sector", "Market"))
    themes = universe_row.get("themes") or []
    theme_text = str(themes[0]) if themes else "market trends"
    # Approximate Unix seconds around late Feb/early Mar 2026
    return [
        {
            "headline": f"{name} ({ticker}) sees activity in {theme_text}",
            "summary": f"{sector} name monitored for momentum and quality shifts in mock mode.",
            "source": "MockWire",
            "datetime": 1772400000,
            "url": "",
        },
        {
            "headline": f"{ticker} sector context update: {sector}",
            "summary": "Synthetic headline generated from universe metadata.",
            "source": "MockWire",
            "datetime": 1772313600,
            "url": "",
        },
    ]


# ── Mock tool classes ─────────────────────────────────────────────────────────

class MockMarketDataTool:
    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ticker = str(payload.get("ticker", "")).upper()
        closes = _MARKET_CLOSES.get(ticker)
        if closes is None:
            row = _UNIVERSE_INDEX.get(ticker)
            if row is None:
                raise MCPToolError(f"MockMarketDataTool: no mock data for ticker '{ticker}'")
            momentum_score = float(row.get("mock_momentum_score", 5.0))
            closes = _series_from_momentum_score(ticker, momentum_score)
        return {
            "ticker": ticker,
            "source": "Mock (Marketstack)",
            "prices": _price_series(closes),
        }

    def run_many(self, tickers: List[str]) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for ticker in tickers:
            payload = self.run({"ticker": ticker})
            out[payload["ticker"]] = payload
        return out


class MockFundamentalsTool:
    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ticker = str(payload.get("ticker", "")).upper()
        metrics = _MOCK_FUNDAMENTALS.get(ticker)
        if metrics is None:
            row = _UNIVERSE_INDEX.get(ticker)
            if row is None:
                raise MCPToolError(f"MockFundamentalsTool: no mock data for ticker '{ticker}'")
            quality_score = float(row.get("mock_quality_score", 5.0))
            metrics = _fundamentals_from_quality_score(quality_score)
        return {
            "ticker": ticker,
            "source": "Mock (Financial Modeling Prep)",
            "metrics": metrics,
        }


class MockNewsTool:
    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ticker = str(payload.get("ticker", "")).upper()
        articles = _MOCK_NEWS.get(ticker)
        if articles is None:
            row = _UNIVERSE_INDEX.get(ticker)
            articles = _synthetic_news(row, ticker) if row else []
        return {
            "ticker": ticker,
            "source": "Mock (Finnhub)",
            "articles": articles,
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
