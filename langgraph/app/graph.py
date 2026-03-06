from __future__ import annotations

import json
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from langgraph.graph import END, StateGraph
from openai import OpenAI

from .mcp_tools import (
    MCPToolError,
    get_fundamentals_tool,
    get_market_tool,
    get_news_tool,
    get_rag_tool,
)
from .mcp_tools.anomaly_detector import (
    build_anomaly_signal_event,
    detect_score_delta,
    detect_volume_spike,
)
from .alert_checker import check_user_alerts
from .alert_client import post_alerts_to_n8n, post_user_alerts_to_n8n
from .n8n_client import post_candidates_to_n8n, post_report_to_n8n
from .budget_manager import budget_manager
from .event_store import save_bundle
from .personalization import build_user_bundle
from .profile_store import load_all_profiles
from .reporting import DEFAULT_COMPANIES, build_markdown, build_report, persist_report
from .scoring import compute_all_scores, momentum_weekly_return
from .state import GraphState, today_iso
from .weekly_digest import build_weekly_user_digest

logger = logging.getLogger(__name__)

DEFAULT_UNIVERSE = [
    "AAPL",
    "AMZN",
    "GOOGL",
    "JPM",
    "MA",
    "META",
    "MSFT",
    "NVDA",
    "TSLA",
    "V",
]

# Path to the 100-ticker mock universe (relative to this file's parent package)
_UNIVERSE_PATH = Path(__file__).parent.parent / "data" / "universe_mock.json"
_REPORT_DIR = Path(__file__).resolve().parent.parent / "data" / "reports"


def _load_universe_tickers() -> List[str]:
    """Return ticker universe based on USE_MOCK_DATA.

    - USE_MOCK_DATA=true  -> universe_mock.json (fallback: env/default universe)
    - USE_MOCK_DATA=false -> STOCK_UNIVERSE env or DEFAULT_UNIVERSE

    Caller-seeded tickers from init_state() still take priority over this loader.
    """
    use_mock_data = os.environ.get("USE_MOCK_DATA", "true").lower() == "true"
    if use_mock_data and _UNIVERSE_PATH.exists():
        try:
            with _UNIVERSE_PATH.open() as f:
                data = json.load(f)
            tickers = [t["ticker"] for t in data.get("tickers", [])]
            if tickers:
                logger.debug(
                    "_load_universe_tickers: USE_MOCK_DATA=true loaded %d tickers from universe_mock.json",
                    len(tickers),
                )
                return tickers
        except Exception as exc:  # noqa: BLE001
            logger.warning("_load_universe_tickers: failed to load universe_mock.json: %s", exc)

    if use_mock_data and not _UNIVERSE_PATH.exists():
        logger.warning(
            "_load_universe_tickers: USE_MOCK_DATA=true but universe_mock.json is missing; falling back to STOCK_UNIVERSE/DEFAULT_UNIVERSE"
        )
    return _parse_universe()


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def _parse_universe() -> List[str]:
    raw = os.environ.get("STOCK_UNIVERSE", "")
    if raw.strip():
        tickers = [x.strip().upper() for x in raw.split(",") if x.strip()]
    else:
        tickers = DEFAULT_UNIVERSE[:]

    tickers = sorted(set(tickers))
    if len(tickers) > 50:
        tickers = tickers[:50]
    return tickers


def init_state(state: GraphState) -> GraphState:
    _configure_logging()
    # Caller may pre-seed run_id (for streaming), tickers, skip_synthesis, scope.
    run_id = state.get("run_id") or str(uuid.uuid4())
    run_date = state.get("run_date") or os.environ.get("RUN_DATE", today_iso())

    # Ticker source priority: caller-seeded > universe_mock.json > STOCK_UNIVERSE env > DEFAULT_UNIVERSE
    tickers = state.get("tickers") or _load_universe_tickers()

    skip_synthesis = bool(state.get("skip_synthesis", False))
    scope = state.get("scope") or ("fast" if skip_synthesis else "full")
    trigger_weekly_digest = bool(state.get("trigger_weekly_digest", False))

    # Load all user profiles and collect watchlist tickers for prioritisation
    user_profiles = load_all_profiles()
    all_watchlist_tickers: List[str] = []
    for profile in user_profiles:
        all_watchlist_tickers.extend(profile.get("watchlist", []))

    # Watchlist tickers are moved to the front; remaining tickers preserve their original order
    tickers = budget_manager.prioritize_tickers(tickers, all_watchlist_tickers)

    per_ticker_data = {t: {} for t in tickers}
    return {
        "run_id": run_id,
        "run_date": run_date,
        "tickers": tickers,
        "scope": scope,
        "trigger_weekly_digest": trigger_weekly_digest,
        "skip_synthesis": skip_synthesis,
        "current_ticker": None,
        "action": None,
        "action_reason": None,
        "done_collection": False,
        "failed_tickers": [],
        "per_ticker_data": per_ticker_data,
        "scores": {},
        "per_ticker_rag_context": {},
        "rag_stats": {"retrieved_items": 0, "queries_run": 0},
        "per_ticker_synthesis": {},
        "signal_events": [],
        "anomaly_signals": [],
        "personalized_bundles": {},
        "triggered_user_alerts": [],
        "report_json": None,
        "report_markdown": "",
        "errors": [],
        "react_history": [],
        "user_profiles": user_profiles,
    }


def _next_missing_for_ticker(data: Dict[str, Any]) -> Literal["market", "fundamentals", "news", "complete"]:
    if "market" not in data:
        return "market"
    if "fundamentals" not in data:
        return "fundamentals"
    if "news" not in data:
        return "news"
    return "complete"


def _pending_action_candidates(state: GraphState) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    failed = set(state["failed_tickers"])
    for ticker in state["tickers"]:
        if ticker in failed:
            continue
        next_missing = _next_missing_for_ticker(state["per_ticker_data"].get(ticker, {}))
        if next_missing != "complete":
            out.append((ticker, next_missing))
    return out


def _validate_llm_choice(
    state: GraphState, ticker: Optional[str], action: str, reason: str,
    pending: Optional[List[Tuple[str, str]]] = None,
) -> Tuple[Optional[str], str, str]:
    if pending is None:
        pending = _pending_action_candidates(state)
    pending_set = {(t, a) for t, a in pending}
    if action == "compute" and not pending:
        return None, "compute", reason
    if action in {"market", "fundamentals", "news"} and ticker and (ticker, action) in pending_set:
        return ticker, action, reason
    raise ValueError(f"Invalid planner action/ticker: action={action}, ticker={ticker}, pending={pending}")


def _openai_react_plan(state: GraphState) -> Tuple[Optional[str], str, str]:
    pending = _pending_action_candidates(state)
    if not pending:
        return None, "compute", "All required tool data collected; proceed to scoring."

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for ReAct planning.")

    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=api_key)

    universe_snapshot = []
    for ticker in state["tickers"]:
        data = state["per_ticker_data"].get(ticker, {})
        universe_snapshot.append(
            {
                "ticker": ticker,
                "failed": ticker in set(state["failed_tickers"]),
                "market_already_fetched": "market" in data,
                "fundamentals_already_fetched": "fundamentals" in data,
                "news_already_fetched": "news" in data,
            }
        )

    prompt = {
        "goal": "Choose exactly one next data-fetch action for a ReAct stock-analysis agent.",
        "instruction": (
            "pending_pairs lists every (ticker, action) that still needs fetching. "
            "false in universe_status means NOT YET FETCHED — the data needs to be retrieved. "
            "You MUST pick one item from pending_pairs. "
            "compute is only valid when pending_pairs is empty."
        ),
        "pending_pairs": [{"ticker": t, "action": a} for t, a in pending],
        "universe_status": universe_snapshot,
    }

    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "system",
                "content": (
                    "You are a data-fetch planner. pending_pairs contains items that still need fetching. "
                    "Pick one item from pending_pairs and return ONLY compact JSON: "
                    "{\"thought\": \"...\", \"action\": \"<market|fundamentals|news>\", \"ticker\": \"<TICKER>\", \"reason\": \"...\"}. "
                    "Never choose action=compute while pending_pairs is non-empty."
                ),
            },
            {"role": "user", "content": json.dumps(prompt)},
        ],
        temperature=0,
    )

    content = getattr(response, "output_text", "") or ""
    if not content.strip():
        raise ValueError("Planner returned empty output_text.")

    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        # Allow fenced JSON responses (```json ... ```).
        cleaned = content.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if len(lines) >= 3 and lines[-1].strip() == "```":
                cleaned = "\n".join(lines[1:-1]).strip()
                if cleaned.lower().startswith("json"):
                    cleaned = cleaned[4:].strip()
        try:
            payload = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Planner returned non-JSON response: {content[:200]}") from exc

    ticker = payload.get("ticker")
    action = str(payload.get("action", "compute")).strip().lower()
    reason = str(payload.get("reason", "LLM planned next step.")).strip()
    return _validate_llm_choice(state, ticker, action, reason, pending=pending)


def plan_next_action(state: GraphState) -> GraphState:
    pending = _pending_action_candidates(state)

    # In mock mode, avoid LLM planning entirely to guarantee zero external AI calls
    # and keep graph traversal bounded for large mock universes.
    use_mock_data = os.environ.get("USE_MOCK_DATA", "true").lower() == "true"
    if use_mock_data:
        if pending:
            selected_ticker, selected_action, reason = (
                pending[0][0],
                pending[0][1],
                "Deterministic planner in mock mode: selecting first pending action.",
            )
        else:
            selected_ticker, selected_action, reason = (
                None,
                "compute",
                "All required tool data collected; proceed to scoring.",
            )
    else:
        try:
            selected_ticker, selected_action, reason = _openai_react_plan(state)
        except Exception as exc:  # noqa: BLE001
            state["errors"].append({"ticker": "*", "tool": "planner", "error": str(exc)})
            if pending:
                selected_ticker, selected_action, reason = (
                    pending[0][0],
                    pending[0][1],
                    "Planner failed; falling back to first pending action.",
                )
            else:
                selected_ticker, selected_action, reason = (
                    None,
                    "compute",
                    "Planner failed; proceeding to compute with whatever data is available.",
                )
    done_collection = selected_action == "compute"

    logger.info(
        "plan_next_action",
        extra={
            "ticker": selected_ticker,
            "action": selected_action,
            "reason": reason,
            "trace_id": str(uuid.uuid4()),
        },
    )

    state["current_ticker"] = selected_ticker
    state["action"] = selected_action
    state["action_reason"] = reason
    state["done_collection"] = done_collection
    state["react_history"].append(
        {
            "phase": "thought_action",
            "ticker": selected_ticker or "",
            "action": selected_action,
            "message": reason,
        }
    )
    return state


def _run_market_tool(state: GraphState, ticker: str) -> None:
    tool = get_market_tool()
    result = tool.run({"ticker": ticker})
    state["per_ticker_data"].setdefault(ticker, {})["market"] = result
    state["react_history"].append(
        {"phase": "observation", "ticker": ticker, "action": "market", "message": "Market data fetched."}
    )


def _run_fundamentals_tool(state: GraphState, ticker: str) -> None:
    tool = get_fundamentals_tool()
    result = tool.run({"ticker": ticker})
    state["per_ticker_data"].setdefault(ticker, {})["fundamentals"] = result
    state["react_history"].append(
        {
            "phase": "observation",
            "ticker": ticker,
            "action": "fundamentals",
            "message": "Fundamentals fetched.",
        }
    )


def _run_news_tool(state: GraphState, ticker: str) -> None:
    tool = get_news_tool()
    result = tool.run({"ticker": ticker, "end_date": state["run_date"]})
    state["per_ticker_data"].setdefault(ticker, {})["news"] = result
    state["react_history"].append(
        {"phase": "observation", "ticker": ticker, "action": "news", "message": "News data fetched."}
    )


def execute_tool_action(state: GraphState) -> GraphState:
    action = state.get("action")
    if action not in {"market", "fundamentals", "news"}:
        return state

    run_id = state.get("run_id", "unknown")
    failed_set = set(state["failed_tickers"])
    targets = [
        t
        for t in state["tickers"]
        if t not in failed_set and action not in state["per_ticker_data"].get(t, {})
    ]

    if not targets:
        return state

    # Fast path: batch market fetch (single provider call can satisfy many tickers).
    if action == "market":
        tool = get_market_tool()
        if hasattr(tool, "run_many"):
            if not budget_manager.can_call(action, run_id):
                logger.warning(
                    "budget_manager: run %s exhausted API budget; skipping market batch for %d ticker(s)",
                    run_id,
                    len(targets),
                )
                for ticker in targets:
                    if ticker not in state["failed_tickers"]:
                        state["failed_tickers"].append(ticker)
                state["react_history"].append(
                    {
                        "phase": "observation",
                        "ticker": "",
                        "action": action,
                        "message": f"Skipped: API budget exhausted for market batch ({len(targets)} tickers).",
                    }
                )
                return state

            budget_manager.record_call(action, run_id)
            try:
                batch = tool.run_many(targets)
                for ticker in targets:
                    result = batch.get(ticker)
                    if not isinstance(result, dict):
                        if ticker not in state["failed_tickers"]:
                            state["failed_tickers"].append(ticker)
                        state["errors"].append(
                            {"ticker": ticker, "tool": action, "error": "No market payload returned from batch fetch"}
                        )
                        continue
                    state["per_ticker_data"].setdefault(ticker, {})["market"] = result
                    state["react_history"].append(
                        {
                            "phase": "observation",
                            "ticker": ticker,
                            "action": "market",
                            "message": "Market data fetched (batch).",
                        }
                    )
                return state
            except MCPToolError as exc:
                state["errors"].append({"ticker": "*", "tool": action, "error": str(exc)})
                if "rate limit" in str(exc).lower():
                    for t in state["tickers"]:
                        data = state["per_ticker_data"].get(t, {})
                        if "market" not in data and t not in state["failed_tickers"]:
                            state["failed_tickers"].append(t)
                    return state
                # Non-rate-limit batch failure: mark current market targets as failed
                for ticker in targets:
                    if ticker not in state["failed_tickers"]:
                        state["failed_tickers"].append(ticker)
                return state
            except Exception as exc:  # noqa: BLE001
                state["errors"].append({"ticker": "*", "tool": action, "error": str(exc)})
                for ticker in targets:
                    if ticker not in state["failed_tickers"]:
                        state["failed_tickers"].append(ticker)
                return state

    # Parallel path for fundamentals/news to reduce end-to-end latency on larger universes.
    if action in {"fundamentals", "news"}:
        admitted: List[str] = []
        for ticker in targets:
            if not budget_manager.can_call(action, run_id):
                logger.warning(
                    "budget_manager: run %s exhausted API budget; skipping remaining %s calls (%d ticker(s))",
                    run_id,
                    action,
                    len([t for t in targets if t not in admitted]),
                )
                if ticker not in state["failed_tickers"]:
                    state["failed_tickers"].append(ticker)
                state["react_history"].append(
                    {
                        "phase": "observation",
                        "ticker": ticker,
                        "action": action,
                        "message": "Skipped: API budget exhausted for this run.",
                    }
                )
                continue
            budget_manager.record_call(action, run_id)
            admitted.append(ticker)

        if not admitted:
            return state

        tool = get_fundamentals_tool() if action == "fundamentals" else get_news_tool()
        max_workers = int(os.environ.get("TOOL_PARALLELISM", "8"))
        max_workers = max(1, min(max_workers, len(admitted)))

        def _fetch_one(ticker: str) -> Dict[str, Any]:
            if action == "fundamentals":
                return tool.run({"ticker": ticker})
            return tool.run({"ticker": ticker, "end_date": state["run_date"]})

        futures: Dict[Any, str] = {}
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            for t in admitted:
                futures[pool.submit(_fetch_one, t)] = t

            for future in as_completed(futures):
                ticker = futures[future]
                try:
                    result = future.result()
                    state["per_ticker_data"].setdefault(ticker, {})[action] = result
                    state["react_history"].append(
                        {
                            "phase": "observation",
                            "ticker": ticker,
                            "action": action,
                            "message": f"{action.capitalize()} fetched.",
                        }
                    )
                except MCPToolError as exc:
                    state["errors"].append({"ticker": ticker, "tool": action, "error": str(exc)})
                    if ticker not in state["failed_tickers"]:
                        state["failed_tickers"].append(ticker)
                    state["react_history"].append(
                        {
                            "phase": "observation",
                            "ticker": ticker,
                            "action": action,
                            "message": f"Tool failed: {exc}",
                        }
                    )
                except Exception as exc:  # noqa: BLE001
                    state["errors"].append({"ticker": ticker, "tool": action, "error": str(exc)})
                    if ticker not in state["failed_tickers"]:
                        state["failed_tickers"].append(ticker)
                    state["react_history"].append(
                        {
                            "phase": "observation",
                            "ticker": ticker,
                            "action": action,
                            "message": f"Execution failed: {exc}",
                        }
                    )
        return state

    # Sequential fallback (market without batch support)
    for ticker in targets:
        if not budget_manager.can_call(action, run_id):
            logger.warning(
                "budget_manager: run %s exhausted API budget; skipping remaining %s calls (%d ticker(s))",
                run_id,
                action,
                len([t for t in targets if t not in state["failed_tickers"]]),
            )
            if ticker not in state["failed_tickers"]:
                state["failed_tickers"].append(ticker)
            state["react_history"].append(
                {
                    "phase": "observation",
                    "ticker": ticker,
                    "action": action,
                    "message": "Skipped: API budget exhausted for this run.",
                }
            )
            continue

        budget_manager.record_call(action, run_id)
        try:
            if action == "market":
                _run_market_tool(state, ticker)
            elif action == "fundamentals":
                _run_fundamentals_tool(state, ticker)
            elif action == "news":
                _run_news_tool(state, ticker)
        except MCPToolError as exc:
            state["errors"].append({"ticker": ticker, "tool": action, "error": str(exc)})
            if action == "market" and "rate limit" in str(exc).lower():
                for t in state["tickers"]:
                    data = state["per_ticker_data"].get(t, {})
                    if "market" not in data and t not in state["failed_tickers"]:
                        state["failed_tickers"].append(t)
                break
            if ticker not in state["failed_tickers"]:
                state["failed_tickers"].append(ticker)
            state["react_history"].append(
                {
                    "phase": "observation",
                    "ticker": ticker,
                    "action": action,
                    "message": f"Tool failed: {exc}",
                }
            )
        except Exception as exc:  # noqa: BLE001
            state["errors"].append({"ticker": ticker, "tool": action, "error": str(exc)})
            if ticker not in state["failed_tickers"]:
                state["failed_tickers"].append(ticker)
            state["react_history"].append(
                {
                    "phase": "observation",
                    "ticker": ticker,
                    "action": action,
                    "message": f"Execution failed: {exc}",
                }
            )
    return state


def compute_scores_node(state: GraphState) -> GraphState:
    quality_weight = float(os.environ.get("QUALITY_WEIGHT", "0.55"))
    momentum_weight = float(os.environ.get("MOMENTUM_WEIGHT", "0.45"))

    failed = set(state["failed_tickers"])
    eligible = {
        t: data
        for t, data in state["per_ticker_data"].items()
        if t not in failed and all(k in data for k in ("market", "news"))
    }

    if not eligible:
        state["errors"].append({"ticker": "*", "tool": "compute_scores", "error": "No eligible tickers to score"})
        state["scores"] = {}
        return state

    scores, raw_components = compute_all_scores(eligible, quality_weight=quality_weight, momentum_weight=momentum_weight)
    for ticker, raw in raw_components.items():
        for t, v in raw.items():
            state["per_ticker_data"].setdefault(t, {})[ticker] = v

    state["scores"] = scores
    return state


def detect_anomalies_node(state: GraphState) -> GraphState:
    """Detect volume spikes and score deltas for all scored tickers.

    Runs after compute_scores_node and before retrieve_rag_context_node.
    Stores anomaly SignalEvent dicts in state["anomaly_signals"].
    emit_signals_node later merges them into state["signal_events"].

    Volume data is sourced from universe_mock.json (mock_volume / mock_avg_volume).
    Score-delta data is sourced from the most recent prior run in SQLite.
    Both detectors are non-fatal: individual ticker errors are logged and skipped.
    """
    from .event_store import load_recent_runs, load_run

    run_id = state["run_id"]
    run_date = state["run_date"]
    scores = state.get("scores", {})
    anomaly_events: List[Dict[str, Any]] = []

    # ── Load prior run scores for score-delta detection ───────────────────────
    prior_scores_by_ticker: Dict[str, Dict[str, float]] = {}
    try:
        recent = load_recent_runs(limit=2)
        # recent[0] is the current in-flight run (may or may not be persisted yet);
        # we want the last *completed* run, so look for the first run_id != current.
        prior_run_meta = next(
            (r for r in recent if r["run_id"] != run_id), None
        )
        if prior_run_meta:
            prior_snapshot = load_run(prior_run_meta["run_id"])
            if prior_snapshot:
                prior_scores_by_ticker = prior_snapshot.get("scores", {})
                logger.debug(
                    "detect_anomalies_node: loaded prior scores for %d tickers from run %s",
                    len(prior_scores_by_ticker),
                    prior_run_meta["run_id"],
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("detect_anomalies_node: could not load prior run scores: %s", exc)

    # ── Load volume data from universe_mock.json ───────────────────────────────
    volume_by_ticker: Dict[str, Dict[str, float]] = {}
    try:
        if _UNIVERSE_PATH.exists():
            with _UNIVERSE_PATH.open() as f:
                universe_data = json.load(f)
            for entry in universe_data.get("tickers", []):
                t = entry.get("ticker", "")
                if t and "mock_volume" in entry and "mock_avg_volume" in entry:
                    volume_by_ticker[t] = {
                        "volume": float(entry["mock_volume"]),
                        "avg_volume": float(entry["mock_avg_volume"]),
                    }
    except Exception as exc:  # noqa: BLE001
        logger.warning("detect_anomalies_node: could not load volume data: %s", exc)

    # ── Run detectors per ticker ───────────────────────────────────────────────
    for ticker, score_block in scores.items():
        try:
            # Volume spike
            vol_data = volume_by_ticker.get(ticker)
            if vol_data:
                anomaly = detect_volume_spike(
                    ticker=ticker,
                    volume=vol_data["volume"],
                    avg_volume=vol_data["avg_volume"],
                )
                if anomaly:
                    ev = build_anomaly_signal_event(ticker, anomaly, run_id, run_date, score_block)
                    anomaly_events.append(ev)
                    logger.debug("detect_anomalies_node: volume_spike %s (%.1f×)", ticker, anomaly["magnitude"])

            # Score delta (only when prior run data is available)
            prior = prior_scores_by_ticker.get(ticker)
            if prior:
                anomaly = detect_score_delta(
                    ticker=ticker,
                    current_scores=score_block,
                    prior_scores=prior,
                )
                if anomaly:
                    ev = build_anomaly_signal_event(ticker, anomaly, run_id, run_date, score_block)
                    anomaly_events.append(ev)
                    logger.debug(
                        "detect_anomalies_node: %s %s (Δ%.1f)",
                        anomaly["anomaly_type"], ticker, anomaly["magnitude"],
                    )

        except Exception as exc:  # noqa: BLE001
            logger.warning("detect_anomalies_node: ticker %s failed: %s", ticker, exc)
            state["errors"].append({"ticker": ticker, "tool": "detect_anomalies", "error": str(exc)})

    # Keep anomalies isolated here; emit_signals_node will merge them with
    # base quality/momentum/risk signals to avoid accidental overwrite.
    state["anomaly_signals"] = anomaly_events

    logger.info(
        "detect_anomalies_node: %d anomaly signal(s) produced",
        len(anomaly_events),
        extra={"run_id": run_id},
    )
    return state


def _parse_synthesis_json(content: str) -> Dict[str, Any]:
    content = content.strip()
    if content.startswith("```"):
        lines = content.splitlines()
        if len(lines) >= 3 and lines[-1].strip() == "```":
            content = "\n".join(lines[1:-1]).strip()
            if content.lower().startswith("json"):
                content = content[4:].strip()
    return json.loads(content)


def _build_evidence_bundle(
    ticker: str,
    per_ticker_data: Dict[str, Dict[str, Any]],
    scores: Dict[str, Dict[str, float]],
    rag_context: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    data = per_ticker_data.get(ticker, {})
    prices = data.get("market", {}).get("prices", [])
    metrics = data.get("fundamentals", {}).get("metrics", {})
    articles = data.get("news", {}).get("articles", [])

    weekly_return = momentum_weekly_return(prices)
    price_end = float(prices[0]["close"]) if prices and prices[0].get("close") is not None else None
    price_start = float(prices[4]["close"]) if len(prices) >= 5 and prices[4].get("close") is not None else None

    def _pct(key: str) -> Optional[float]:
        try:
            v = float(metrics.get(key))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        return round(v * 100.0 if -2.0 < v < 2.0 else v, 1)

    return {
        "ticker": ticker,
        "company_name": DEFAULT_COMPANIES.get(ticker, {}).get("name", ticker),
        "market": {
            "weekly_return_pct": round(weekly_return, 2) if weekly_return is not None else None,
            "price_start": round(price_start, 2) if price_start is not None else None,
            "price_end": round(price_end, 2) if price_end is not None else None,
        },
        "fundamentals": {
            "roe_pct": _pct("roe"),
            "operating_margin_pct": _pct("operating_margin"),
            "debt_to_equity": metrics.get("debt_to_equity"),
            "revenue_growth_pct": _pct("revenue_growth"),
            "eps_growth_pct": _pct("eps_growth"),
        },
        "headlines": [a.get("headline", "") for a in articles[:5] if a.get("headline")],
        "rag_context": rag_context or [],
        "scores": scores.get(ticker, {}),
    }


def _evidence_target_tickers(state: GraphState) -> List[str]:
    """
    Select tickers that should go through expensive RAG + synthesis.

    Defaults to top 25 by overall score, and always includes user watchlist
    tickers that have scores. Set EVIDENCE_TOP_N=0 (or negative) to disable
    capping and process all scored tickers.
    """
    scored = list(state.get("scores", {}).items())
    if not scored:
        return []

    top_n = int(os.environ.get("EVIDENCE_TOP_N", "25"))
    ranked = sorted(scored, key=lambda kv: float(kv[1].get("overall", 0.0)), reverse=True)

    selected: List[str]
    if top_n <= 0:
        selected = [t for t, _ in ranked]
    else:
        selected = [t for t, _ in ranked[:top_n]]

    # Include all scored watchlist tickers so user-facing names don't lose context.
    scored_set = {t for t, _ in ranked}
    selected_set = set(selected)
    for profile in state.get("user_profiles", []):
        for t in profile.get("watchlist", []):
            tt = str(t).upper()
            if tt in scored_set and tt not in selected_set:
                selected.append(tt)
                selected_set.add(tt)

    return selected


def retrieve_rag_context_node(state: GraphState) -> GraphState:
    if state.get("skip_synthesis"):
        state["per_ticker_rag_context"] = {}
        state["rag_stats"] = {"retrieved_items": 0, "queries_run": 0}
        return state

    tool = get_rag_tool()
    context_map: Dict[str, List[Dict[str, Any]]] = {}
    retrieved_items = 0
    queries_run = 0

    lookback_days = int(os.environ.get("RAG_LOOKBACK_DAYS", "42"))
    top_k = int(os.environ.get("RAG_TOP_K", "5"))

    target_tickers = _evidence_target_tickers(state)
    for ticker in target_tickers:
        try:
            queries_run += 1
            query = (
                f"{ticker} catalysts, trend confirmation, risk factors and "
                "fundamental context for this week's investment analysis"
            )
            rag = tool.run(
                {
                    "ticker": ticker,
                    "query": query,
                    "lookback_days": lookback_days,
                    "top_k": top_k,
                    "end_date": state["run_date"],
                }
            )
            matches = list(rag.get("matches") or [])
            context_map[ticker] = matches
            retrieved_items += len(matches)
        except Exception as exc:  # noqa: BLE001
            context_map[ticker] = []
            state["errors"].append({"ticker": ticker, "tool": "rag_retrieval", "error": str(exc)})

    state["per_ticker_rag_context"] = context_map
    state["rag_stats"] = {"retrieved_items": retrieved_items, "queries_run": queries_run}
    logger.info(
        "retrieve_rag_context_node",
        extra={"run_id": state["run_id"], "retrieved_items": retrieved_items, "queries_run": queries_run},
    )
    return state


def synthesize_evidence_node(state: GraphState) -> GraphState:
    from .models import empty_synthesis

    if state.get("skip_synthesis"):
        logger.info("synthesize_evidence_node: skip_synthesis=True; bypassing LLM synthesis.")
        state["per_ticker_synthesis"] = {}
        return state

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        logger.warning("synthesize_evidence_node: OPENAI_API_KEY not set; skipping synthesis.")
        state["per_ticker_synthesis"] = {}
        return state

    model = os.environ.get("SYNTHESIS_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=api_key)
    synthesis: Dict[str, Any] = {}

    target_tickers = _evidence_target_tickers(state)
    for ticker in target_tickers:
        try:
            bundle = _build_evidence_bundle(
                ticker,
                state["per_ticker_data"],
                state["scores"],
                rag_context=state.get("per_ticker_rag_context", {}).get(ticker, []),
            )
            response = client.responses.create(
                model=model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You are a financial analyst producing structured observations for a stock screening system. "
                            "Given evidence, return ONLY a JSON object with these exact keys: "
                            "quality_narrative (str), momentum_narrative (str), "
                            "news_catalyst ({present: bool, headline: str|null, impact: str, strength: str}), "
                            "risk_factors (list of str). "
                            "Use rag_context when present and prefer evidence-backed statements. "
                            "If rag_context is empty or weak, avoid overconfident claims. "
                            "Be factual and concise. Never make buy/sell recommendations."
                        ),
                    },
                    {"role": "user", "content": json.dumps(bundle)},
                ],
                temperature=0,
            )
            content = getattr(response, "output_text", "") or ""
            payload = _parse_synthesis_json(content)
            catalyst = payload.get("news_catalyst") or {}
            synthesis[ticker] = {
                "ticker": ticker,
                "quality_narrative": str(payload.get("quality_narrative", "")),
                "momentum_narrative": str(payload.get("momentum_narrative", "")),
                "news_catalyst": {
                    "present": bool(catalyst.get("present", False)),
                    "headline": catalyst.get("headline"),
                    "impact": str(catalyst.get("impact", "neutral")),
                    "strength": str(catalyst.get("strength", "low")),
                },
                "risk_factors": list(payload.get("risk_factors") or []),
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning("synthesize_evidence_node: %s failed: %s", ticker, exc)
            state["errors"].append({"ticker": ticker, "tool": "synthesize_evidence", "error": str(exc)})
            synthesis[ticker] = empty_synthesis(ticker)

    state["per_ticker_synthesis"] = synthesis
    logger.info("synthesize_evidence_node", extra={"run_id": state["run_id"], "count": len(synthesis)})
    return state


def emit_signals_node(state: GraphState) -> GraphState:
    from .models import build_signal_events

    base_events = build_signal_events(
        run_id=state["run_id"],
        run_date=state["run_date"],
        scores=state["scores"],
        failed_tickers=state["failed_tickers"],
        synthesis=state["per_ticker_synthesis"],
    )
    anomaly_events = list(state.get("anomaly_signals", []))
    seen_ids = {ev["id"] for ev in base_events}
    merged_events = base_events + [ev for ev in anomaly_events if ev["id"] not in seen_ids]
    state["signal_events"] = merged_events
    logger.info(
        "emit_signals_node",
        extra={
            "run_id": state["run_id"],
            "signal_count": len(state["signal_events"]),
            "anomaly_count": len(anomaly_events),
        },
    )
    return state


def personalize_signals_node(state: GraphState) -> GraphState:
    bundles: Dict[str, Dict[str, Any]] = {}
    users = state.get("user_profiles", [])
    if not users:
        state["personalized_bundles"] = {}
        return state

    for profile in users:
        user_id = profile.get("user_id", "")
        if not user_id:
            continue
        try:
            bundle = build_user_bundle(
                user_profile=profile,
                signal_events=state.get("signal_events", []),
                scores=state.get("scores", {}),
                run_id=state["run_id"],
                run_date=state["run_date"],
                per_ticker_data=state.get("per_ticker_data", {}),
            )
            save_bundle(bundle)
            bundles[user_id] = bundle
        except Exception as exc:  # noqa: BLE001
            # Per-user failure must not fail the full node.
            state["errors"].append({"ticker": user_id, "tool": "personalize_signals", "error": str(exc)})
            logger.warning("personalize_signals_node: user %s failed: %s", user_id, exc)

    state["personalized_bundles"] = bundles
    logger.info(
        "personalize_signals_node",
        extra={"run_id": state["run_id"], "user_count": len(users), "saved_bundles": len(bundles)},
    )
    return state


def check_user_alerts_node(state: GraphState) -> GraphState:
    try:
        triggered = check_user_alerts()
        state["triggered_user_alerts"] = triggered
        logger.info(
            "check_user_alerts_node",
            extra={"run_id": state["run_id"], "triggered_count": len(triggered)},
        )
    except Exception as exc:  # noqa: BLE001
        state["errors"].append({"ticker": "*", "tool": "check_user_alerts", "error": str(exc)})
    return state


def post_alerts_node(state: GraphState) -> GraphState:
    skip_post = os.environ.get("SKIP_N8N_POST", "false").lower() == "true"
    if skip_post:
        return state

    # Immediate Telegram alerts are now user-specific and sent only for important signals.
    profiles_by_user = {str(p.get("user_id", "")): p for p in state.get("user_profiles", [])}
    bundles = state.get("personalized_bundles", {}) or {}
    for user_id, bundle in bundles.items():
        profile = profiles_by_user.get(user_id, {})
        if not profile:
            continue
        if not bool(profile.get("alert_notifications", True)):
            continue
        chat_id = str(profile.get("telegram_chat_id", "")).strip()
        if not chat_id:
            continue

        all_signals = list(bundle.get("watchlist_signals", [])) + list(bundle.get("discovery_signals", []))
        important = [s for s in all_signals if str(s.get("urgency", "")).lower() == "high"]
        # Dedupe by signal id to avoid double sends between buckets.
        seen: set[str] = set()
        deduped: List[Dict[str, Any]] = []
        for s in important:
            sid = str(s.get("signal_id", ""))
            if sid and sid in seen:
                continue
            if sid:
                seen.add(sid)
            deduped.append(s)
        if not deduped:
            continue
        try:
            post_alerts_to_n8n(
                deduped,
                run_id=state["run_id"],
                run_date=state["run_date"],
                user_id=user_id,
                telegram_chat_id=chat_id,
            )
            logger.info(
                "post_alerts_node",
                extra={"run_id": state["run_id"], "user_id": user_id, "alert_count": len(deduped)},
            )
        except Exception as exc:  # noqa: BLE001
            state["errors"].append({"ticker": user_id, "tool": "alert_webhook", "error": str(exc)})

    user_alerts = state.get("triggered_user_alerts", [])
    if user_alerts:
        try:
            post_user_alerts_to_n8n(user_alerts, run_id=state["run_id"], run_date=state["run_date"])
            logger.info("post_alerts_node:user", extra={"run_id": state["run_id"], "user_alert_count": len(user_alerts)})
        except Exception as exc:  # noqa: BLE001
            state["errors"].append({"ticker": "*", "tool": "user_alert_webhook", "error": str(exc)})

    return state


def post_candidates_node(state: GraphState) -> GraphState:
    skip_post = os.environ.get("SKIP_N8N_POST", "false").lower() == "true"
    if skip_post:
        return state

    # Weekly digest email is sent only on the weekly-run flow (cron /run-weekly).
    if not bool(state.get("trigger_weekly_digest", False)):
        return state

    # Keep full-scope safeguard.
    if state.get("scope", "full") != "full":
        return state

    profiles_by_user = {str(p.get("user_id", "")): p for p in state.get("user_profiles", [])}
    bundles = state.get("personalized_bundles", {}) or {}
    for user_id, bundle in bundles.items():
        profile = profiles_by_user.get(user_id, {})
        if not profile:
            continue
        if not bool(profile.get("weekly_email_digest", profile.get("daily_email_digest", False))):
            continue
        email = str(profile.get("email", "")).strip()
        if not email:
            continue
        try:
            digest = build_weekly_user_digest(profile, bundle, lookback_days=7)
            post_candidates_to_n8n(digest, run_id=state["run_id"], run_date=state["run_date"])
            logger.info(
                "post_candidates_node",
                extra={"run_id": state["run_id"], "user_id": user_id, "email": email},
            )
        except Exception as exc:  # noqa: BLE001
            state["errors"].append({"ticker": user_id, "tool": "candidate_webhook", "error": str(exc)})
    return state


def persist_snapshot_node(state: GraphState) -> GraphState:
    from .event_store import init_db, persist_run
    from .models import AnalysisSnapshot
    from .monitor_client import post_monitor_event

    snapshot = AnalysisSnapshot(
        run_id=state["run_id"],
        run_date=state["run_date"],
        timestamp=datetime.now(timezone.utc).isoformat(),
        scope=state.get("scope", "full"),
        tickers=state["tickers"],
        scores=state["scores"],
        signal_events=state["signal_events"],
        failed_tickers=state["failed_tickers"],
        error_count=len(state["errors"]),
    )
    try:
        init_db()
        persist_run(snapshot)
        logger.info("persist_snapshot_node", extra={"run_id": state["run_id"]})
    except Exception as exc:  # noqa: BLE001
        state["errors"].append({"ticker": "*", "tool": "event_store", "error": str(exc)})

    # Emit monitoring event — always fires, never raises
    run_status = "error" if state["errors"] else "ok"
    post_monitor_event(
        run_id=state["run_id"],
        run_date=state["run_date"],
        status=run_status,
        scope=state.get("scope", "full"),
        error_count=len(state["errors"]),
        signal_count=len(state["signal_events"]),
    )
    return state


def assemble_report_json_node(state: GraphState) -> GraphState:
    report = build_report(
        run_date=state["run_date"],
        per_ticker_data=state["per_ticker_data"],
        scores=state["scores"],
        report_dir=str(_REPORT_DIR),
        errors=state["errors"],
        synthesis=state["per_ticker_synthesis"],
        rag_context=state.get("per_ticker_rag_context"),
        rag_stats=state.get("rag_stats"),
    )
    # Attach anomaly signals so GET /latest-report exposes them as a top-level key.
    # report is a TypedDict but we can mutate it safely here before it is serialised.
    if report is not None:
        report["anomaly_signals"] = state.get("anomaly_signals", [])  # type: ignore[typeddict-unknown-key]
    state["report_json"] = report
    return state


def assemble_markdown_node(state: GraphState) -> GraphState:
    state["report_markdown"] = build_markdown(state["report_json"] or {})
    return state


def post_to_n8n_node(state: GraphState) -> GraphState:
    skip_post = os.environ.get("SKIP_N8N_POST", "false").lower() == "true"
    if skip_post:
        return state

    if not state["report_json"]:
        state["errors"].append({"ticker": "*", "tool": "n8n", "error": "No report payload to post"})
        return state

    try:
        post_report_to_n8n(state["report_json"])
    except Exception as exc:  # noqa: BLE001
        state["errors"].append({"ticker": "*", "tool": "n8n", "error": str(exc)})
    return state


def persist_report_node(state: GraphState) -> GraphState:
    if not state["report_json"]:
        return state
    path = persist_report(state["report_json"], state["run_date"], report_dir=str(_REPORT_DIR))
    logger.info("persist_report", extra={"path": path, "run_date": state["run_date"]})
    return state


def planner_router(state: GraphState) -> str:
    action = state.get("action")
    if action in {"market", "fundamentals", "news"}:
        return "execute_tool_action"
    return "compute"


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("init_state", init_state)
    graph.add_node("plan_next_action", plan_next_action)
    graph.add_node("execute_tool_action", execute_tool_action)
    graph.add_node("compute_scores", compute_scores_node)
    graph.add_node("detect_anomalies", detect_anomalies_node)
    graph.add_node("retrieve_rag_context", retrieve_rag_context_node)
    graph.add_node("synthesize_evidence", synthesize_evidence_node)
    graph.add_node("emit_signals", emit_signals_node)
    graph.add_node("personalize_signals", personalize_signals_node)
    graph.add_node("check_user_alerts", check_user_alerts_node)
    graph.add_node("post_alerts", post_alerts_node)
    graph.add_node("post_candidates", post_candidates_node)
    graph.add_node("assemble_report_json", assemble_report_json_node)
    graph.add_node("assemble_markdown", assemble_markdown_node)
    graph.add_node("post_to_n8n", post_to_n8n_node)
    graph.add_node("persist_report", persist_report_node)
    graph.add_node("persist_snapshot", persist_snapshot_node)

    graph.set_entry_point("init_state")
    graph.add_edge("init_state", "plan_next_action")

    graph.add_conditional_edges(
        "plan_next_action",
        planner_router,
        {
            "execute_tool_action": "execute_tool_action",
            "compute": "compute_scores",
        },
    )

    graph.add_edge("execute_tool_action", "plan_next_action")

    graph.add_edge("compute_scores", "detect_anomalies")
    graph.add_edge("detect_anomalies", "retrieve_rag_context")
    graph.add_edge("retrieve_rag_context", "synthesize_evidence")
    graph.add_edge("synthesize_evidence", "emit_signals")
    graph.add_edge("emit_signals", "personalize_signals")
    graph.add_edge("personalize_signals", "check_user_alerts")
    graph.add_edge("check_user_alerts", "post_alerts")
    graph.add_edge("post_alerts", "post_candidates")
    graph.add_edge("post_candidates", "assemble_report_json")
    graph.add_edge("assemble_report_json", "assemble_markdown")
    graph.add_edge("assemble_markdown", "post_to_n8n")
    graph.add_edge("post_to_n8n", "persist_report")
    graph.add_edge("persist_report", "persist_snapshot")
    graph.add_edge("persist_snapshot", END)

    return graph.compile()
