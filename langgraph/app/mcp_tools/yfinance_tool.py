from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from .base import HTTPCachedTool, MCPToolError

# yfinance is imported lazily to avoid slow import times when not needed
try:
    import yfinance as yf
except ImportError as exc:
    raise ImportError("yfinance is required: pip install yfinance>=0.2.50") from exc

# Map user-facing range strings to yfinance (period, interval) pairs
_RANGE_MAP: Dict[str, tuple[str, str]] = {
    "1D": ("1d", "5m"),
    "5D": ("5d", "30m"),
    "1M": ("1mo", "1d"),
    "3M": ("3mo", "1d"),
    "6M": ("6mo", "1d"),
    "1Y": ("1y", "1d"),
}


class YFinanceTool(HTTPCachedTool):
    """yfinance-based tool for real-time quotes, chart history, snapshots, and search."""

    def __init__(self) -> None:
        # No HTTP rate limiting needed — yfinance handles its own throttling
        super().__init__(cache_dir="data/cache", min_sleep_s=0.0)

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def get_quotes(self, tickers: List[str]) -> Dict[str, Any]:
        """Return lightweight quote data for a list of tickers.

        Returns:
            {ticker: {price, change, change_pct, volume, mkt_cap}}
        """
        upper = [t.upper() for t in tickers if t]
        cache_payload = {"tool": "yf_quotes", "tickers": sorted(upper)}
        cached = self._read_cache("yf_quotes", cache_payload)
        if cached:
            has_usable_value = any(
                isinstance(v, dict) and v.get("change_pct") is not None
                for v in cached.values()
            )
            if has_usable_value:
                return cached

        result: Dict[str, Any] = {}
        for ticker in upper:
            try:
                info = yf.Ticker(ticker).fast_info
                price = getattr(info, "last_price", None)
                if price is None:
                    price = getattr(info, "regular_market_price", None)

                prev_close = getattr(info, "previous_close", None)
                if prev_close is None:
                    prev_close = getattr(info, "regular_market_previous_close", None)

                # Fallback when fast_info omits fields: derive from recent daily closes.
                if price is None or prev_close is None:
                    hist = yf.Ticker(ticker).history(period="5d", interval="1d", auto_adjust=True)
                    if not hist.empty and "Close" in hist:
                        closes = [float(v) for v in hist["Close"].tolist() if v == v]
                        if len(closes) >= 2:
                            price = closes[-1] if price is None else price
                            prev_close = closes[-2] if prev_close is None else prev_close

                change = (price - prev_close) if (price is not None and prev_close is not None) else None
                change_pct = (
                    (change / prev_close * 100)
                    if (change is not None and prev_close not in (None, 0))
                    else None
                )
                result[ticker] = {
                    "price": round(price, 4) if price is not None else None,
                    "change": round(change, 4) if change is not None else None,
                    "change_pct": round(change_pct, 4) if change_pct is not None else None,
                    "volume": getattr(info, "last_volume", None),
                    "mkt_cap": getattr(info, "market_cap", None),
                }
            except Exception as exc:  # noqa: BLE001
                result[ticker] = {"error": str(exc)}

        self._write_cache("yf_quotes", cache_payload, result)
        return result

    def get_chart(self, ticker: str, range_str: str = "1M") -> Dict[str, Any]:
        """Return OHLCV chart data for the given ticker and range.

        Args:
            ticker: Stock ticker symbol.
            range_str: One of '1D', '5D', '1M', '3M', '6M', '1Y'.

        Returns:
            {ticker, range, timestamps: [], opens: [], highs: [], lows: [], closes: [], volumes: []}
        """
        ticker = ticker.upper()
        period, interval = _RANGE_MAP.get(range_str, ("1mo", "1d"))
        cache_payload = {"tool": "yf_chart", "ticker": ticker, "range": range_str}
        cached = self._read_cache("yf_chart", cache_payload)
        if cached:
            return cached

        hist = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
        if hist.empty:
            raise MCPToolError(f"No chart data for {ticker} ({range_str})")

        # Convert index to ISO strings; handle both tz-aware and naive datetimes
        def _ts(idx: Any) -> str:
            if hasattr(idx, "isoformat"):
                return idx.isoformat()
            return str(idx)

        result = {
            "ticker": ticker,
            "range": range_str,
            "timestamps": [_ts(i) for i in hist.index],
            "opens": [round(float(v), 4) if v == v else None for v in hist["Open"]],
            "highs": [round(float(v), 4) if v == v else None for v in hist["High"]],
            "lows": [round(float(v), 4) if v == v else None for v in hist["Low"]],
            "closes": [round(float(v), 4) if v == v else None for v in hist["Close"]],
            "volumes": [int(v) if v == v else None for v in hist["Volume"]],
        }
        self._write_cache("yf_chart", cache_payload, result)
        return result

    def get_intraday_snapshot(self, ticker: str) -> Dict[str, Any]:
        """Return intraday + 52-week range data for a single ticker.

        Returns:
            {week_52_high, week_52_low, day_high, day_low, volume, avg_volume}
        """
        ticker = ticker.upper()
        cache_payload = {"tool": "yf_snapshot", "ticker": ticker}
        cached = self._read_cache("yf_snapshot", cache_payload)
        if cached:
            return cached

        info = yf.Ticker(ticker).fast_info
        result = {
            "ticker": ticker,
            "week_52_high": getattr(info, "year_high", None),
            "week_52_low": getattr(info, "year_low", None),
            "day_high": getattr(info, "day_high", None),
            "day_low": getattr(info, "day_low", None),
            "volume": getattr(info, "last_volume", None),
            "avg_volume": getattr(info, "three_month_average_volume", None),
        }
        self._write_cache("yf_snapshot", cache_payload, result)
        return result

    def search_tickers(self, query: str) -> List[Dict[str, str]]:
        """Return autocomplete results for a partial ticker or company name query.

        Returns:
            [{ticker, name, exchange}]
        """
        query = query.strip()
        if not query:
            return []
        cache_payload = {"tool": "yf_search", "query": query.lower()}
        cached = self._read_cache("yf_search", cache_payload)
        if cached:
            return cached

        try:
            search = yf.Search(query, max_results=10, news_count=0)
            quotes = search.quotes or []
        except Exception as exc:  # noqa: BLE001
            raise MCPToolError(f"Ticker search failed: {exc}") from exc

        results = [
            {
                "ticker": q.get("symbol", ""),
                "name": q.get("longname") or q.get("shortname") or "",
                "exchange": q.get("exchange", ""),
            }
            for q in quotes
            if q.get("symbol")
        ]
        self._write_cache("yf_search", cache_payload, results)
        return results
