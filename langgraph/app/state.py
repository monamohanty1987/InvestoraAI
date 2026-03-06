from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Literal, Optional, TypedDict

from .models import SignalEvent, SynthesisResult, UserProfileContext, UserReportBundle


class CompanyInfo(TypedDict):
    name: str
    ticker: str
    icon: str


class QualityBlock(TypedDict):
    rating: Literal["Strong", "Good", "Solid", "Weak"]
    score: float


class MomentumBlock(TypedDict):
    rating: Literal["Strong", "Positive", "Neutral", "Negative"]
    score: float


class WeeklyChangeBlock(TypedDict):
    value: Optional[float]
    direction: Literal["up", "down", "flat"]


class TopOpportunity(TypedDict):
    rank: int
    company: CompanyInfo
    score: float
    prior_score: Optional[float]
    quality: QualityBlock
    momentum: MomentumBlock
    weekly_change: WeeklyChangeBlock


class StrategyItem(TypedDict):
    company: str
    score: float
    rating: str
    bar_percentage: int


class InsightItem(TypedDict):
    company: str
    text: str
    evidence: List[Dict[str, Any]]


class DataSourceItem(TypedDict):
    name: str
    type: Literal["market", "fundamental", "news"]


class VectorIndexMetadata(TypedDict):
    provider: str
    stored_memos: int
    lookback_weeks: int
    retrieved_items: int
    queries_run: int


class SystemMetadata(TypedDict):
    vector_index: VectorIndexMetadata


class ReportPayload(TypedDict):
    report: Dict[str, Any]
    top_opportunities: List[TopOpportunity]
    strategy_breakdown: Dict[str, List[StrategyItem]]
    insights: List[InsightItem]
    data_sources: List[DataSourceItem]
    system_metadata: SystemMetadata
    tool_errors: List[Dict[str, str]]  # [{ticker, tool, error}] — empty when all tools succeeded
    anomaly_signals: List[Dict[str, Any]]  # SignalEvent dicts produced by detect_anomalies_node


class GraphState(TypedDict):
    run_id: str                          # UUID generated at init; links all DB records for this run
    run_date: str
    tickers: List[str]
    scope: str                           # "full" | "fast"; "fast" skips LLM synthesis
    trigger_weekly_digest: bool          # True only for weekly-run flow (cron /run-weekly)
    skip_synthesis: bool                 # when True, synthesize_evidence_node is bypassed
    current_ticker: Optional[str]
    action: Optional[str]
    action_reason: Optional[str]
    done_collection: bool
    failed_tickers: List[str]
    per_ticker_data: Dict[str, Dict[str, Any]]
    scores: Dict[str, Dict[str, float]]
    per_ticker_rag_context: Dict[str, List[Dict[str, Any]]]  # {ticker: retrieved evidence chunks}
    rag_stats: Dict[str, int]               # {"retrieved_items": int, "queries_run": int}
    per_ticker_synthesis: Dict[str, Any]  # {ticker: SynthesisResult}; populated by synthesize_evidence_node
    signal_events: List[SignalEvent]      # populated by emit_signals_node after scoring
    anomaly_signals: List[SignalEvent]    # populated by detect_anomalies_node; subset of signal_events
    personalized_bundles: Dict[str, UserReportBundle]  # populated by personalize_signals_node
    triggered_user_alerts: List[Dict[str, Any]]  # user-defined price alerts that fired
    report_json: Optional[ReportPayload]
    report_markdown: str
    errors: List[Dict[str, str]]
    react_history: List[Dict[str, str]]
    user_profiles: List[UserProfileContext]  # loaded in init_state; used in Iteration 4 personalisation


def today_iso() -> str:
    return date.today().isoformat()
