from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .run_weekly import run_analysis, run_weekly

logger = logging.getLogger(__name__)

# Load .env from langgraph/ root — no-op on Render (env vars already injected)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ── Sentry (optional — only initialises when SENTRY_DSN is set) ───────────────
# Wrapped in try/except so a bad DSN or import issue never crashes the server.
# NOTE: We deliberately exclude LangChain/LangGraph integrations — they caused
#       crashes on older Python versions and are not needed for API monitoring.
try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    _sentry_dsn = os.environ.get("SENTRY_DSN", "")
    if _sentry_dsn:
        sentry_sdk.init(
            dsn=_sentry_dsn,
            environment=os.environ.get("ENVIRONMENT", "production"),
            traces_sample_rate=0.1,      # capture 10% of requests for performance
            send_default_pii=False,      # no PII in error reports
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
            ],
        )
except Exception:
    pass  # Sentry init failure must never crash the API server


def _verify_cron_secret(authorization: str = Header(default="")) -> None:
    """Reject requests with a wrong Bearer token when CRON_SECRET is configured."""
    secret = os.environ.get("CRON_SECRET", "")
    if not secret:
        return  # auth disabled — allow all (dev/local)
    if authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")

app = FastAPI(title="LangGraph Weekly Market Agent", version="1.0.0")

# CORS — allow localhost in dev + production origins from CORS_ORIGINS env var
_raw_origins = os.environ.get("CORS_ORIGINS", "")
_explicit_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_explicit_origins,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory registry of active streaming runs: run_id → asyncio.Queue
_active_streams: Dict[str, asyncio.Queue] = {}


class RunWeeklyRequest(BaseModel):
    run_date: Optional[str] = None
    skip_synthesis: bool = False
    no_post: bool = False


class RunAnalysisRequest(BaseModel):
    tickers: Optional[List[str]] = None
    skip_synthesis: bool = True
    no_post: bool = False


@app.post("/run-weekly", dependencies=[Depends(_verify_cron_secret)])
def run_weekly_endpoint(req: RunWeeklyRequest):
    return run_weekly(
        run_date=req.run_date,
        skip_synthesis=req.skip_synthesis,
        skip_post=req.no_post,
    )


@app.post("/run-analysis", dependencies=[Depends(_verify_cron_secret)])
def run_analysis_endpoint(req: RunAnalysisRequest):
    return run_analysis(
        tickers=req.tickers,
        skip_synthesis=req.skip_synthesis,
        skip_post=req.no_post,
    )


@app.post("/run-analysis-stream")
async def run_analysis_stream_endpoint(req: RunAnalysisRequest):
    """Start a run and stream LangGraph node-completion events as SSE."""
    from .graph import build_graph

    run_id = str(uuid.uuid4())
    loop = asyncio.get_event_loop()
    q: asyncio.Queue = asyncio.Queue()
    _active_streams[run_id] = q

    initial: Dict[str, Any] = {
        "run_id": run_id,
        "skip_synthesis": req.skip_synthesis,
        "scope": "fast" if req.skip_synthesis else "full",
    }
    if req.tickers:
        initial["tickers"] = [t.upper() for t in req.tickers]
    os.environ["SKIP_N8N_POST"] = "true" if req.no_post else "false"

    recursion_limit = int(os.environ.get("GRAPH_RECURSION_LIMIT", "120"))

    def graph_thread() -> None:
        try:
            graph = build_graph()
            for chunk in graph.stream(initial, config={"recursion_limit": recursion_limit}):
                for node_name in chunk:
                    event = json.dumps({"type": "node_complete", "node": node_name, "run_id": run_id})
                    loop.call_soon_threadsafe(q.put_nowait, event)
            loop.call_soon_threadsafe(q.put_nowait, json.dumps({"type": "done", "run_id": run_id}))
        except Exception as exc:  # noqa: BLE001
            loop.call_soon_threadsafe(
                q.put_nowait, json.dumps({"type": "error", "run_id": run_id, "message": str(exc)})
            )
        finally:
            loop.call_soon_threadsafe(q.put_nowait, None)  # sentinel

    threading.Thread(target=graph_thread, daemon=True).start()

    async def event_gen():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=300)
                except asyncio.TimeoutError:
                    yield "data: {\"type\": \"ping\"}\n\n"
                    continue
                if data is None:
                    break
                yield f"data: {data}\n\n"
        finally:
            _active_streams.pop(run_id, None)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Resolve relative to this file so the path works regardless of uvicorn launch dir
REPORTS_DIR = Path(__file__).resolve().parent.parent / "data" / "reports"


@app.get("/latest-report")
def get_latest_report():
    """Return the most recently generated weekly report JSON, or 404."""
    if not REPORTS_DIR.exists():
        raise HTTPException(status_code=404, detail="No reports found")
    # Filenames are YYYY-MM-DD.json — lexicographic sort gives correct date order
    candidates = list(REPORTS_DIR.glob("*.json"))
    if not candidates:
        raise HTTPException(status_code=404, detail="No reports found")
    latest = sorted(candidates, key=lambda p: p.stem, reverse=True)[0]
    return json.loads(latest.read_text(encoding="utf-8"))


@app.get("/run-history")
def get_run_history(limit: int = 10):
    """Return metadata for the N most recent analysis runs."""
    from .event_store import init_db, load_recent_runs

    init_db()
    return load_recent_runs(limit=min(limit, 100))


@app.get("/ticker-history/{ticker}")
def get_ticker_history(ticker: str, weeks: int = 6):
    """Return signal events for a ticker over the last N weeks."""
    from .event_store import init_db, load_history

    init_db()
    return load_history(ticker=ticker.upper(), lookback_weeks=min(weeks, 52))


# ── Market Data Endpoints (Tasks 1.3–1.5) ─────────────────────────────────


@app.get("/market/status")
def get_market_status():
    """Return NYSE open/closed status (ET logic) and display timestamp in CET/CEST."""
    et = ZoneInfo("America/New_York")
    now_et = datetime.now(et)
    cet = ZoneInfo("Europe/Berlin")
    now_cet = datetime.now(cet)
    weekday = now_et.weekday()  # 0=Mon … 6=Sun
    hour, minute = now_et.hour, now_et.minute
    is_open = (
        weekday < 5
        and (hour > 9 or (hour == 9 and minute >= 30))
        and hour < 16
    )
    return {
        "status": "OPEN" if is_open else "CLOSED",
        "last_update": now_cet.strftime("%H:%M %Z"),
    }


@app.get("/market/quotes")
def get_market_quotes(tickers: str = Query(..., description="Comma-separated tickers")):
    """Return real-time quotes for a list of tickers (yfinance)."""
    from .mcp_tools.yfinance_tool import YFinanceTool

    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="No tickers provided")
    tool = YFinanceTool()
    return tool.get_quotes(ticker_list)


@app.get("/market/chart/{ticker}")
def get_market_chart(ticker: str, range: str = "1M"):
    """Return OHLCV chart history (yfinance). range: 1D | 5D | 1M | 3M | 6M | 1Y."""
    from .mcp_tools.yfinance_tool import YFinanceTool

    range_aliases = {
        "1d": "1D",
        "5d": "5D",
        "1m": "1M",
        "1mo": "1M",
        "3m": "3M",
        "3mo": "3M",
        "6m": "6M",
        "6mo": "6M",
        "1y": "1Y",
    }
    normalized_range = range_aliases.get(range.lower(), range.upper())
    valid_ranges = {"1D", "5D", "1M", "3M", "6M", "1Y"}
    if normalized_range not in valid_ranges:
        raise HTTPException(status_code=400, detail=f"range must be one of {valid_ranges}")
    tool = YFinanceTool()
    try:
        return tool.get_chart(ticker.upper(), normalized_range)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/market/snapshot/{ticker}")
def get_market_snapshot(ticker: str):
    """Return merged intraday snapshot (yfinance) + key metrics (FMP)."""
    from .mcp_tools.yfinance_tool import YFinanceTool
    from .mcp_tools.fundamentals_tool import FundamentalsTool

    ticker = ticker.upper()
    yf_tool = YFinanceTool()
    fmp_tool = FundamentalsTool()

    try:
        intraday = yf_tool.get_intraday_snapshot(ticker)
    except Exception as exc:
        intraday = {"error": str(exc)}

    try:
        fundamentals = fmp_tool.run({"ticker": ticker})
        metrics = fundamentals.get("metrics", {})
    except Exception:
        metrics = {}

    # Attempt to surface P/E, mkt cap, and dividend yield from FMP raw data
    # (FundamentalsTool currently doesn't map these; expose what's available)
    return {
        "ticker": ticker,
        "week_52_high": intraday.get("week_52_high"),
        "week_52_low": intraday.get("week_52_low"),
        "day_high": intraday.get("day_high"),
        "day_low": intraday.get("day_low"),
        "volume": intraday.get("volume"),
        "avg_volume": intraday.get("avg_volume"),
        "roe": metrics.get("roe"),
        "operating_margin": metrics.get("operating_margin"),
        "debt_to_equity": metrics.get("debt_to_equity"),
        "revenue_growth": metrics.get("revenue_growth"),
        "eps_growth": metrics.get("eps_growth"),
    }


@app.get("/market/news/{ticker}")
def get_market_news(ticker: str):
    """Return recent news headlines for a ticker (Finnhub)."""
    from .mcp_tools.news_tool import NewsTool

    try:
        result = NewsTool().run({"ticker": ticker.upper()})
        # NewsTool returns {ticker, source, articles:[]} — unwrap the array so
        # the frontend can call .slice() directly on the response.
        return result.get("articles", [])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/universe")
def get_universe():
    """Return the full ticker universe used by the LangGraph pipeline.

    Reads ``universe_mock.json`` when the file exists (100 S&P 100 tickers with
    sector metadata, mock scores, and volume figures).  Falls back to the
    10-ticker DEFAULT_UNIVERSE constant when the file is absent.

    Response shape (mirrors universe_mock.json):
    ```json
    {
      "generated_at": "2026-03-05",
      "tickers": [
        {"ticker": "AAPL", "name": "Apple Inc.", "sector": "Technology", ...},
        ...
      ]
    }
    ```
    """
    import json as _json
    from .graph import DEFAULT_UNIVERSE, _UNIVERSE_PATH

    if _UNIVERSE_PATH.exists():
        try:
            with _UNIVERSE_PATH.open() as f:
                data = _json.load(f)
            return data
        except Exception as exc:
            logger.warning("get_universe: failed to load universe_mock.json: %s", exc)

    # Fallback: return the 10-ticker default universe in a compatible envelope
    return {
        "generated_at": None,
        "tickers": [{"ticker": t} for t in DEFAULT_UNIVERSE],
    }


@app.get("/market/search")
def search_tickers(q: str = Query(..., min_length=1)):
    """Autocomplete ticker/company search via yfinance."""
    from .mcp_tools.yfinance_tool import YFinanceTool

    logger.info(
        "market_search request",
        extra={
            "query": q,
            "query_len": len(q),
        },
    )

    try:
        payload = YFinanceTool().search_tickers(q)
        logger.info(
            "market_search success",
            extra={"query": q, "result_count": len(payload) if isinstance(payload, list) else -1},
        )
        return [
            {
                "ticker": item.get("ticker", ""),
                "name": item.get("name", ""),
                "exchange": item.get("exchange", ""),
            }
            for item in payload
            if item.get("ticker")
        ]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("market_search unexpected_error")
        raise HTTPException(status_code=502, detail=f"Ticker search failed: {exc}") from exc


@app.get("/market/top-movers")
def get_top_movers(tickers: str = Query(..., description="Comma-separated tickers")):
    """Return top gainers and losers from the provided ticker set (yfinance)."""
    from .mcp_tools.yfinance_tool import YFinanceTool

    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="No tickers provided")

    quotes = YFinanceTool().get_quotes(ticker_list)
    valid = [
        {"ticker": t, **v}
        for t, v in quotes.items()
        if isinstance(v, dict) and v.get("change_pct") is not None
    ]
    sorted_by_change = sorted(valid, key=lambda x: x["change_pct"])
    losers = sorted_by_change[:3]
    gainers = sorted_by_change[-3:][::-1]
    return {"gainers": gainers, "losers": losers}


# In-memory 1-hour cache for AI view responses
_ai_view_cache: Dict[str, tuple[str, float]] = {}
_AI_VIEW_TTL = 3600  # seconds


@app.get("/market/ai-view/{ticker}")
def get_market_ai_view(ticker: str):
    """Return a 2-3 sentence AI summary of the current situation for a ticker."""
    import openai

    ticker = ticker.upper()
    cached = _ai_view_cache.get(ticker)
    if cached and (time.time() - cached[1]) < _AI_VIEW_TTL:
        return {"summary": cached[0], "generated_at": datetime.fromtimestamp(cached[1], tz=timezone.utc).isoformat()}

    from .mcp_tools.yfinance_tool import YFinanceTool
    from .mcp_tools.news_tool import NewsTool

    # Gather context
    try:
        quotes = YFinanceTool().get_quotes([ticker])
        quote = quotes.get(ticker, {})
        price = quote.get("price", "N/A")
        change_pct = quote.get("change_pct", "N/A")
    except Exception:
        price, change_pct = "N/A", "N/A"

    try:
        news_data = NewsTool().run({"ticker": ticker})
        headlines = [a["headline"] for a in news_data.get("articles", [])[:3]]
    except Exception:
        headlines = []

    headline_block = "\n".join(f"- {h}" for h in headlines) if headlines else "No recent news."
    prompt = (
        f"In 2-3 sentences, summarize the current investment situation for {ticker}. "
        f"Current price: {price}, daily change: {change_pct}%. "
        f"Recent headlines:\n{headline_block}\n"
        "Be factual and concise. Do not give explicit buy/sell advice."
    )

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")

    client = openai.OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=150,
        temperature=0.3,
    )
    summary = response.choices[0].message.content.strip()

    ts = time.time()
    _ai_view_cache[ticker] = (summary, ts)
    return {"summary": summary, "generated_at": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()}


# ── Watchlist Endpoints (Task 2.3) ────────────────────────────────────────


class WatchlistRequest(BaseModel):
    tickers: List[str]


@app.get("/user/{user_id}/watchlist")
def get_user_watchlist(user_id: str):
    from .event_store import init_db, get_watchlist

    init_db()
    return {"user_id": user_id, "tickers": get_watchlist(user_id)}


@app.put("/user/{user_id}/watchlist")
def put_user_watchlist(user_id: str, req: WatchlistRequest):
    from .event_store import init_db, set_watchlist, get_watchlist

    init_db()
    set_watchlist(user_id, req.tickers)
    return {"user_id": user_id, "tickers": get_watchlist(user_id)}


# ── Alert Endpoints (Task 2.4) ────────────────────────────────────────────


class CreateAlertRequest(BaseModel):
    ticker: str
    condition: str   # 'price_above' | 'price_below' | 'daily_move'
    value: float


class UpdateAlertRequest(BaseModel):
    status: Optional[str] = None      # 'active' | 'disabled' (accept 'paused' alias)
    ticker: Optional[str] = None
    condition: Optional[str] = None   # 'price_above' | 'price_below' | 'daily_move'
    value: Optional[float] = None


@app.get("/user/{user_id}/alerts")
def get_user_alerts(user_id: str):
    from .event_store import init_db, get_alerts

    init_db()
    return get_alerts(user_id)


@app.post("/user/{user_id}/alerts", status_code=201)
def create_user_alert(user_id: str, req: CreateAlertRequest):
    from .event_store import init_db, create_alert

    # Accept legacy condition aliases from older frontends and normalize.
    condition_aliases = {
        "above": "price_above",
        "below": "price_below",
        "change_pct_up": "daily_move",
        "change_pct_down": "daily_move",
    }
    normalized_condition = condition_aliases.get(req.condition, req.condition)
    valid_conditions = {"price_above", "price_below", "daily_move"}
    if normalized_condition not in valid_conditions:
        raise HTTPException(status_code=400, detail=f"condition must be one of {valid_conditions}")
    if req.value <= 0:
        raise HTTPException(status_code=400, detail="value must be positive")

    init_db()
    return create_alert(user_id, req.ticker, normalized_condition, req.value)


@app.patch("/user/{user_id}/alerts/{alert_id}")
def patch_user_alert(user_id: str, alert_id: str, req: UpdateAlertRequest):
    from .event_store import init_db, update_alert

    normalized_status: Optional[str] = None
    if req.status is not None:
        status_aliases = {"paused": "disabled"}
        normalized_status = status_aliases.get(req.status, req.status)
        valid_statuses = {"active", "disabled"}
        if normalized_status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"status must be one of {valid_statuses}")

    normalized_condition: Optional[str] = None
    if req.condition is not None:
        condition_aliases = {
            "above": "price_above",
            "below": "price_below",
            "change_pct_up": "daily_move",
            "change_pct_down": "daily_move",
        }
        normalized_condition = condition_aliases.get(req.condition, req.condition)
        valid_conditions = {"price_above", "price_below", "daily_move"}
        if normalized_condition not in valid_conditions:
            raise HTTPException(status_code=400, detail=f"condition must be one of {valid_conditions}")

    if req.value is not None and req.value <= 0:
        raise HTTPException(status_code=400, detail="value must be positive")

    if (
        normalized_status is None
        and req.ticker is None
        and normalized_condition is None
        and req.value is None
    ):
        raise HTTPException(status_code=400, detail="No update fields provided")

    init_db()
    updated = update_alert(
        alert_id,
        status=normalized_status,
        ticker=req.ticker,
        condition=normalized_condition,
        value=req.value,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return updated


@app.delete("/user/{user_id}/alerts/{alert_id}", status_code=204)
def delete_user_alert(user_id: str, alert_id: str):
    from .event_store import init_db, delete_alert

    init_db()
    if not delete_alert(alert_id):
        raise HTTPException(status_code=404, detail="Alert not found")


# ── v3 Personalization Endpoints (Iteration 1) ────────────────────────────


@app.put("/user/{user_id}/profile")
def put_user_profile(user_id: str, profile: Dict[str, Any] = Body(...)):
    """
    Mirror a user's profile JSON to SQLite so the LangGraph PersonalizationNode
    can read it at run time.  Called by the frontend alongside the n8n webhook.
    Returns 200 {"ok": True} on success; any DB error surfaces as 500.
    """
    from .event_store import init_db
    from .profile_store import save_profile

    init_db()
    save_profile(user_id, profile)
    return {"ok": True, "user_id": user_id}


@app.get("/user/{user_id}/dashboard")
def get_user_dashboard(user_id: str):
    """
    Return the most recent UserReportBundle for a user, or 404 if no
    personalized bundle exists yet (i.e., no analysis run has completed
    the personalization node).
    """
    from .event_store import init_db, load_latest_bundle

    init_db()
    bundle = load_latest_bundle(user_id)
    if bundle is None:
        raise HTTPException(
            status_code=404,
            detail="No dashboard data yet. Trigger an analysis run first.",
        )
    return bundle


@app.get("/user/{user_id}/personalized-signals")
def get_user_personalized_signals(user_id: str):
    """
    Lightweight alternative to /dashboard — returns only the watchlist and
    discovery signal buckets from the latest personalized bundle.
    """
    from .event_store import init_db, load_latest_bundle

    init_db()
    bundle = load_latest_bundle(user_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail="No personalized signals yet.")
    return {
        "watchlist_signals": bundle.get("watchlist_signals", []),
        "discovery_signals": bundle.get("discovery_signals", []),
    }
