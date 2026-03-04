from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Tuple

from langgraph.graph import END, StateGraph
from openai import OpenAI

from .mcp_tools import (
    MCPToolError,
    get_fundamentals_tool,
    get_market_tool,
    get_news_tool,
)
from .n8n_client import post_candidates_to_n8n, post_report_to_n8n
from .reporting import DEFAULT_COMPANIES, build_markdown, build_report, persist_report
from .scoring import compute_all_scores, momentum_weekly_return
from .state import GraphState, today_iso

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
    tickers = state.get("tickers") or _parse_universe()
    skip_synthesis = bool(state.get("skip_synthesis", False))
    scope = state.get("scope") or ("fast" if skip_synthesis else "full")
    per_ticker_data = {t: {} for t in tickers}
    return {
        "run_id": run_id,
        "run_date": run_date,
        "tickers": tickers,
        "scope": scope,
        "skip_synthesis": skip_synthesis,
        "current_ticker": None,
        "action": None,
        "action_reason": None,
        "done_collection": False,
        "failed_tickers": [],
        "per_ticker_data": per_ticker_data,
        "scores": {},
        "per_ticker_synthesis": {},
        "signal_events": [],
        "report_json": None,
        "report_markdown": "",
        "errors": [],
        "react_history": [],
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
    try:
        selected_ticker, selected_action, reason = _openai_react_plan(state)
    except Exception as exc:  # noqa: BLE001
        state["errors"].append({"ticker": "*", "tool": "planner", "error": str(exc)})
        pending = _pending_action_candidates(state)
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
    ticker = state["current_ticker"]
    if not ticker:
        return state
    action = state.get("action")
    try:
        if action == "market":
            _run_market_tool(state, ticker)
        elif action == "fundamentals":
            _run_fundamentals_tool(state, ticker)
        elif action == "news":
            _run_news_tool(state, ticker)
        else:
            raise ValueError(f"Unsupported tool action: {action}")
    except MCPToolError as exc:
        state["errors"].append({"ticker": ticker, "tool": action or "unknown", "error": str(exc)})
        if action == "market" and "rate limit" in str(exc).lower():
            # Stop further market fetch attempts this run; they will fail for all remaining tickers.
            for t in state["tickers"]:
                data = state["per_ticker_data"].get(t, {})
                if "market" not in data and t not in state["failed_tickers"]:
                    state["failed_tickers"].append(t)
        if ticker not in state["failed_tickers"]:
            state["failed_tickers"].append(ticker)
        state["react_history"].append(
            {
                "phase": "observation",
                "ticker": ticker,
                "action": action or "unknown",
                "message": f"Tool failed: {exc}",
            }
        )
    except Exception as exc:  # noqa: BLE001
        state["errors"].append({"ticker": ticker, "tool": action or "unknown", "error": str(exc)})
        if ticker not in state["failed_tickers"]:
            state["failed_tickers"].append(ticker)
        state["react_history"].append(
            {
                "phase": "observation",
                "ticker": ticker,
                "action": action or "unknown",
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
        "scores": scores.get(ticker, {}),
    }


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

    for ticker in state["scores"]:
        try:
            bundle = _build_evidence_bundle(ticker, state["per_ticker_data"], state["scores"])
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

    state["signal_events"] = build_signal_events(
        run_id=state["run_id"],
        run_date=state["run_date"],
        scores=state["scores"],
        failed_tickers=state["failed_tickers"],
        synthesis=state["per_ticker_synthesis"],
    )
    logger.info(
        "emit_signals_node",
        extra={"run_id": state["run_id"], "signal_count": len(state["signal_events"])},
    )
    return state


def post_alerts_node(state: GraphState) -> GraphState:
    from .alert_client import post_alerts_to_n8n

    skip_post = os.environ.get("SKIP_N8N_POST", "false").lower() == "true"
    if skip_post:
        return state

    alerts = [ev for ev in state["signal_events"] if ev["route"] == "ALERT_EVENT"]
    if not alerts:
        return state

    try:
        post_alerts_to_n8n(alerts, run_id=state["run_id"], run_date=state["run_date"])
        logger.info("post_alerts_node", extra={"run_id": state["run_id"], "alert_count": len(alerts)})
    except Exception as exc:  # noqa: BLE001
        state["errors"].append({"ticker": "*", "tool": "alert_webhook", "error": str(exc)})
    return state


def post_candidates_node(state: GraphState) -> GraphState:
    skip_post = os.environ.get("SKIP_N8N_POST", "false").lower() == "true"
    if skip_post:
        return state

    candidates = [ev for ev in state["signal_events"] if ev["route"] == "WEEKLY_CANDIDATE"]
    if not candidates:
        return state

    try:
        post_candidates_to_n8n(candidates, run_id=state["run_id"], run_date=state["run_date"])
        logger.info("post_candidates_node", extra={"run_id": state["run_id"], "candidate_count": len(candidates)})
    except Exception as exc:  # noqa: BLE001
        state["errors"].append({"ticker": "*", "tool": "candidate_webhook", "error": str(exc)})
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
    state["report_json"] = build_report(
        run_date=state["run_date"],
        per_ticker_data=state["per_ticker_data"],
        scores=state["scores"],
        report_dir="data/reports",
        errors=state["errors"],
        synthesis=state["per_ticker_synthesis"],
    )
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
    path = persist_report(state["report_json"], state["run_date"], report_dir="data/reports")
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
    graph.add_node("synthesize_evidence", synthesize_evidence_node)
    graph.add_node("emit_signals", emit_signals_node)
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

    graph.add_edge("compute_scores", "synthesize_evidence")
    graph.add_edge("synthesize_evidence", "emit_signals")
    graph.add_edge("emit_signals", "post_alerts")
    graph.add_edge("post_alerts", "post_candidates")
    graph.add_edge("post_candidates", "assemble_report_json")
    graph.add_edge("assemble_report_json", "assemble_markdown")
    graph.add_edge("assemble_markdown", "post_to_n8n")
    graph.add_edge("post_to_n8n", "persist_report")
    graph.add_edge("persist_report", "persist_snapshot")
    graph.add_edge("persist_snapshot", END)

    return graph.compile()
