from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

from .models import AnalysisSnapshot, SignalEvent

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "investora.db"

_DDL = """
CREATE TABLE IF NOT EXISTS analysis_runs (
    run_id              TEXT PRIMARY KEY,
    run_date            TEXT NOT NULL,
    timestamp           TEXT NOT NULL,
    scope               TEXT NOT NULL DEFAULT 'full',
    tickers_json        TEXT NOT NULL,
    scores_json         TEXT NOT NULL,
    failed_tickers_json TEXT NOT NULL,
    error_count         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS signal_events (
    id          TEXT PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES analysis_runs(run_id),
    run_date    TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    ticker      TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    direction   TEXT NOT NULL,
    severity    TEXT NOT NULL,
    confidence  REAL NOT NULL,
    score       REAL NOT NULL,
    narrative   TEXT,
    route       TEXT NOT NULL DEFAULT 'UI_UPDATE'
);

CREATE INDEX IF NOT EXISTS idx_se_ticker_date   ON signal_events(ticker, run_date);
CREATE INDEX IF NOT EXISTS idx_se_run_id        ON signal_events(run_id);
CREATE INDEX IF NOT EXISTS idx_se_signal_type   ON signal_events(signal_type, run_date);
"""


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db() -> None:
    """Create tables and indexes if they don't exist. Idempotent."""
    with _conn() as con:
        con.executescript(_DDL)


def persist_run(snapshot: AnalysisSnapshot) -> None:
    """Insert or replace an analysis run and its signal events."""
    with _conn() as con:
        con.execute(
            """
            INSERT OR REPLACE INTO analysis_runs
                (run_id, run_date, timestamp, scope, tickers_json,
                 scores_json, failed_tickers_json, error_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot["run_id"],
                snapshot["run_date"],
                snapshot["timestamp"],
                snapshot["scope"],
                json.dumps(snapshot["tickers"]),
                json.dumps(snapshot["scores"]),
                json.dumps(snapshot["failed_tickers"]),
                snapshot["error_count"],
            ),
        )
        for ev in snapshot["signal_events"]:
            con.execute(
                """
                INSERT OR REPLACE INTO signal_events
                    (id, run_id, run_date, timestamp, ticker, signal_type,
                     direction, severity, confidence, score, narrative, route)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ev["id"],
                    ev["run_id"],
                    ev["run_date"],
                    ev["timestamp"],
                    ev["ticker"],
                    ev["signal_type"],
                    ev["direction"],
                    ev["severity"],
                    ev["confidence"],
                    ev["score"],
                    ev.get("narrative"),
                    ev["route"],
                ),
            )


def load_history(
    ticker: str,
    lookback_weeks: int = 6,
    signal_type: Optional[str] = None,
) -> List[SignalEvent]:
    """Return signal events for a ticker over the last N weeks, newest first."""
    cutoff = (date.today() - timedelta(weeks=lookback_weeks)).isoformat()
    with _conn() as con:
        if signal_type:
            rows = con.execute(
                """
                SELECT * FROM signal_events
                WHERE ticker = ? AND run_date >= ? AND signal_type = ?
                ORDER BY run_date DESC, timestamp DESC
                """,
                (ticker, cutoff, signal_type),
            ).fetchall()
        else:
            rows = con.execute(
                """
                SELECT * FROM signal_events
                WHERE ticker = ? AND run_date >= ?
                ORDER BY run_date DESC, timestamp DESC
                """,
                (ticker, cutoff),
            ).fetchall()
    return [_row_to_signal(r) for r in rows]


def load_run(run_id: str) -> Optional[AnalysisSnapshot]:
    """Reconstruct a snapshot from DB for a given run_id."""
    with _conn() as con:
        run_row = con.execute(
            "SELECT * FROM analysis_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
        if not run_row:
            return None
        signal_rows = con.execute(
            "SELECT * FROM signal_events WHERE run_id = ? ORDER BY ticker, signal_type",
            (run_id,),
        ).fetchall()

    return AnalysisSnapshot(
        run_id=run_row["run_id"],
        run_date=run_row["run_date"],
        timestamp=run_row["timestamp"],
        scope=run_row["scope"],
        tickers=json.loads(run_row["tickers_json"]),
        scores=json.loads(run_row["scores_json"]),
        signal_events=[_row_to_signal(r) for r in signal_rows],
        failed_tickers=json.loads(run_row["failed_tickers_json"]),
        error_count=run_row["error_count"],
    )


def load_recent_runs(limit: int = 10) -> List[Dict[str, Any]]:
    """Return lightweight metadata for the N most recent runs."""
    with _conn() as con:
        rows = con.execute(
            """
            SELECT r.run_id, r.run_date, r.timestamp, r.scope,
                   r.error_count, r.failed_tickers_json,
                   COUNT(s.id) AS signal_count
            FROM analysis_runs r
            LEFT JOIN signal_events s ON s.run_id = r.run_id
            GROUP BY r.run_id
            ORDER BY r.timestamp DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "run_id": r["run_id"],
            "run_date": r["run_date"],
            "timestamp": r["timestamp"],
            "scope": r["scope"],
            "error_count": r["error_count"],
            "failed_tickers": json.loads(r["failed_tickers_json"]),
            "signal_count": r["signal_count"],
        }
        for r in rows
    ]


def _row_to_signal(row: sqlite3.Row) -> SignalEvent:
    return SignalEvent(
        id=row["id"],
        run_id=row["run_id"],
        run_date=row["run_date"],
        timestamp=row["timestamp"],
        ticker=row["ticker"],
        signal_type=row["signal_type"],
        direction=row["direction"],
        severity=row["severity"],
        confidence=row["confidence"],
        score=row["score"],
        narrative=row["narrative"],
        route=row["route"],
    )
