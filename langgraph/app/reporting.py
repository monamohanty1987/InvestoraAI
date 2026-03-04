from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .scoring import momentum_rating, quality_rating

DEFAULT_COMPANIES: Dict[str, Dict[str, str]] = {
    "AAPL": {"name": "Apple", "icon": ""},
    "MSFT": {"name": "Microsoft", "icon": ""},
    "NVDA": {"name": "NVIDIA", "icon": ""},
    "AMZN": {"name": "Amazon", "icon": ""},
    "GOOGL": {"name": "Alphabet", "icon": ""},
    "META": {"name": "Meta", "icon": ""},
    "TSLA": {"name": "Tesla", "icon": ""},
    "JPM": {"name": "JPMorgan Chase", "icon": ""},
    "V": {"name": "Visa", "icon": ""},
    "MA": {"name": "Mastercard", "icon": ""},
    "UNH": {"name": "UnitedHealth", "icon": ""},
    "XOM": {"name": "Exxon Mobil", "icon": ""},
    "AVGO": {"name": "Broadcom", "icon": ""},
    "COST": {"name": "Costco", "icon": ""},
    "HD": {"name": "Home Depot", "icon": ""},
    "PEP": {"name": "PepsiCo", "icon": ""},
    "KO": {"name": "Coca-Cola", "icon": ""},
    "LLY": {"name": "Eli Lilly", "icon": ""},
    "NKE": {"name": "Nike", "icon": ""},
    "DIS": {"name": "Disney", "icon": ""},
}


def _direction(value: Optional[float]) -> str:
    if value is None:
        return "flat"
    if value > 0:
        return "up"
    if value < 0:
        return "down"
    return "flat"


def _load_previous_report(report_dir: Path, run_date: str) -> Optional[Dict[str, Any]]:
    if not report_dir.exists():
        return None

    target = datetime.strptime(run_date, "%Y-%m-%d").date()
    candidates: List[Tuple[date, Path]] = []
    for path in report_dir.glob("*.json"):
        try:
            d = datetime.strptime(path.stem, "%Y-%m-%d").date()
            if d < target:
                candidates.append((d, path))
        except ValueError:
            continue

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    return json.loads(candidates[0][1].read_text(encoding="utf-8"))


def _prior_score_map(previous_report: Optional[Dict[str, Any]]) -> Dict[str, float]:
    out: Dict[str, float] = {}
    if not previous_report:
        return out
    for row in previous_report.get("top_opportunities", []):
        ticker = row.get("company", {}).get("ticker")
        score = row.get("score")
        if ticker and isinstance(score, (int, float)):
            out[ticker] = float(score)
    return out


def _news_insight(news_articles: List[Dict[str, Any]]) -> str:
    if not news_articles:
        return "Limited news flow in the last 7 days; monitor for new catalysts."
    top = [a.get("headline", "").strip() for a in news_articles[:2] if a.get("headline")]
    if not top:
        return "Recent company news is mixed with no clear dominant catalyst."
    return " | ".join(top)


def _synthesis_insight(
    synthesis: Optional[Dict[str, Any]],
    news_articles: List[Dict[str, Any]],
) -> str:
    if synthesis and synthesis.get("news_catalyst", {}).get("present"):
        headline = synthesis["news_catalyst"].get("headline") or ""
        narrative = synthesis.get("quality_narrative") or ""
        return f"{headline} — {narrative}" if headline and narrative else headline or narrative
    return _news_insight(news_articles)


def build_report(
    run_date: str,
    per_ticker_data: Dict[str, Dict[str, Any]],
    scores: Dict[str, Dict[str, float]],
    report_dir: str = "data/reports",
    errors: Optional[List[Dict[str, str]]] = None,
    synthesis: Optional[Dict[str, Any]] = None,
    rag_context: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    rag_stats: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    report_path = Path(report_dir)
    report_path.mkdir(parents=True, exist_ok=True)

    previous = _load_previous_report(report_path, run_date)
    prior_scores = _prior_score_map(previous)

    ranked = sorted(scores.items(), key=lambda x: x[1]["overall"], reverse=True)
    top5 = ranked[:5]

    top_opportunities = []
    insights = []

    for idx, (ticker, score_block) in enumerate(top5, start=1):
        company_meta = DEFAULT_COMPANIES.get(ticker, {"name": ticker, "icon": ""})
        prior_score = prior_scores.get(ticker)
        weekly_val = round(score_block["overall"] - prior_score, 1) if prior_score is not None else None

        top_opportunities.append(
            {
                "rank": idx,
                "company": {"name": company_meta["name"], "ticker": ticker, "icon": company_meta["icon"]},
                "score": round(score_block["overall"], 1),
                "prior_score": round(prior_score, 1) if prior_score is not None else None,
                "quality": {
                    "rating": quality_rating(score_block["quality"]),
                    "score": round(score_block["quality"], 1),
                },
                "momentum": {
                    "rating": momentum_rating(score_block["momentum"]),
                    "score": round(score_block["momentum"], 1),
                },
                "weekly_change": {
                    "value": weekly_val,
                    "direction": _direction(weekly_val),
                },
            }
        )

        news = per_ticker_data.get(ticker, {}).get("news", {}).get("articles", [])
        ticker_syn = (synthesis or {}).get(ticker)
        evidence_rows = (rag_context or {}).get(ticker, [])[:3]
        evidence = [
            {
                "title": str(row.get("title", "")),
                "source": str(row.get("source", "")),
                "date": str(row.get("date", "")),
                "url": str(row.get("url", "")),
                "score": float(row.get("score", 0.0)),
            }
            for row in evidence_rows
            if row.get("title") or row.get("text")
        ]
        insights.append(
            {
                "company": ticker,
                "text": _synthesis_insight(ticker_syn, news),
                "evidence": evidence,
            }
        )

    strategy_quality = []
    strategy_momentum = []
    for ticker, score_block in ranked[:10]:
        q = round(score_block["quality"], 1)
        m = round(score_block["momentum"], 1)
        strategy_quality.append(
            {
                "company": ticker,
                "score": q,
                "rating": quality_rating(q),
                "bar_percentage": int(round(q * 10)),
            }
        )
        strategy_momentum.append(
            {
                "company": ticker,
                "score": m,
                "rating": momentum_rating(m),
                "bar_percentage": int(round(m * 10)),
            }
        )

    change_vals = [item["weekly_change"]["value"] for item in top_opportunities if item["weekly_change"]["value"] is not None]
    weekly_change_percent = round(sum(change_vals) / len(change_vals), 1) if change_vals else 0.0

    report = {
        "report": {
            "title": "Weekly Investment Report",
            "run_date": run_date,
            # v1 choice: top-line weekly performance uses average weekly_change across top 3.
            "performance": {
                "weekly_change_percent": weekly_change_percent,
                "since_date": (datetime.strptime(run_date, "%Y-%m-%d").date() - timedelta(days=7)).isoformat(),
                "trend": _direction(weekly_change_percent),
            },
        },
        "top_opportunities": top_opportunities,
        "strategy_breakdown": {
            "quality": strategy_quality,
            "momentum": strategy_momentum,
        },
        "insights": insights,
        "data_sources": [
            {"name": "Market Data API", "type": "market"},
            {"name": "Fundamental Data API", "type": "fundamental"},
            {"name": "News/Search API", "type": "news"},
        ],
        "system_metadata": {
            "vector_index": {
                "provider": "Pinecone",
                "stored_memos": int(os.environ.get("RAG_STORED_MEMOS", "0")),
                "lookback_weeks": 6,
                "retrieved_items": int((rag_stats or {}).get("retrieved_items", 0)),
                "queries_run": int((rag_stats or {}).get("queries_run", 0)),
            }
        },
        "tool_errors": errors or [],
    }
    return report


def build_markdown(report_json: Dict[str, Any]) -> str:
    lines = [
        f"# {report_json['report']['title']}",
        f"Run Date: {report_json['report']['run_date']}",
        "",
        "## Top Opportunities",
    ]

    for item in report_json.get("top_opportunities", []):
        lines.append(
            f"{item['rank']}. {item['company']['ticker']} ({item['company']['name']}): "
            f"score {item['score']} | Q {item['quality']['score']} ({item['quality']['rating']}) | "
            f"M {item['momentum']['score']} ({item['momentum']['rating']})"
        )

    lines.append("")
    lines.append("## Insights")
    for insight in report_json.get("insights", []):
        lines.append(f"- {insight['company']}: {insight['text']}")

    return "\n".join(lines)


def persist_report(report_json: Dict[str, Any], run_date: str, report_dir: str = "data/reports") -> str:
    path = Path(report_dir)
    path.mkdir(parents=True, exist_ok=True)
    out = path / f"{run_date}.json"
    out.write_text(json.dumps(report_json, ensure_ascii=True, indent=2), encoding="utf-8")
    return str(out)
