from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

if __package__ in (None, ""):
    # Support direct execution: python app/run_weekly.py
    sys.path.append(str(Path(__file__).resolve().parents[1]))
    from app.graph import build_graph
else:
    from .graph import build_graph


def run_weekly(run_date: str | None = None, skip_post: bool = False) -> Dict[str, Any]:
    load_dotenv()
    if run_date:
        os.environ["RUN_DATE"] = run_date
    os.environ["SKIP_N8N_POST"] = "true" if skip_post else "false"
    recursion_limit = int(os.environ.get("GRAPH_RECURSION_LIMIT", "120"))

    app = build_graph()
    result = app.invoke({}, config={"recursion_limit": recursion_limit})
    return {
        "report_json": result.get("report_json"),
        "report_markdown": result.get("report_markdown", ""),
        "errors": result.get("errors", []),
        "run_date": result.get("run_date"),
        "tickers": result.get("tickers", []),
    }


def run_analysis(
    tickers: Optional[List[str]] = None,
    skip_synthesis: bool = False,
    skip_post: bool = False,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Run a targeted analysis — optionally on a subset of tickers, optionally skipping LLM synthesis."""
    load_dotenv()
    os.environ["SKIP_N8N_POST"] = "true" if skip_post else "false"
    recursion_limit = int(os.environ.get("GRAPH_RECURSION_LIMIT", "120"))

    initial: Dict[str, Any] = {
        "skip_synthesis": skip_synthesis,
        "scope": "fast" if skip_synthesis else "full",
    }
    if tickers:
        initial["tickers"] = [t.upper() for t in tickers]
    if run_id:
        initial["run_id"] = run_id

    app = build_graph()
    result = app.invoke(initial, config={"recursion_limit": recursion_limit})
    return {
        "run_id": result.get("run_id"),
        "scope": result.get("scope", "full"),
        "report_json": result.get("report_json"),
        "report_markdown": result.get("report_markdown", ""),
        "errors": result.get("errors", []),
        "run_date": result.get("run_date"),
        "tickers": result.get("tickers", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run weekly LangGraph stock report")
    parser.add_argument("--date", dest="run_date", help="Run date YYYY-MM-DD", default=None)
    parser.add_argument("--no-post", action="store_true", help="Skip posting payload to n8n webhook")
    args = parser.parse_args()

    result = run_weekly(run_date=args.run_date, skip_post=args.no_post)
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
