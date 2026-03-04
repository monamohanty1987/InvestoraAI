from __future__ import annotations

import asyncio
import json
import os
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .run_weekly import run_analysis, run_weekly

# Load .env from langgraph/ root — no-op on Render (env vars already injected)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


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
    no_post: bool = False


class RunAnalysisRequest(BaseModel):
    tickers: Optional[List[str]] = None
    skip_synthesis: bool = False
    no_post: bool = False


@app.post("/run-weekly", dependencies=[Depends(_verify_cron_secret)])
def run_weekly_endpoint(req: RunWeeklyRequest):
    return run_weekly(run_date=req.run_date, skip_post=req.no_post)


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
