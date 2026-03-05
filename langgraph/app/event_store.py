from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

from .models import AnalysisSnapshot, SignalEvent, UserReportBundle

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

CREATE TABLE IF NOT EXISTS user_watchlists (
    user_id    TEXT PRIMARY KEY,
    tickers    TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_alerts (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    ticker           TEXT NOT NULL,
    condition        TEXT NOT NULL,
    value            REAL NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active',
    created_at       TEXT NOT NULL,
    last_triggered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ua_user_id ON user_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_ua_status  ON user_alerts(status);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id      TEXT PRIMARY KEY,
    profile_json TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_report_bundles (
    user_id     TEXT NOT NULL,
    run_id      TEXT NOT NULL,
    run_date    TEXT NOT NULL,
    bundle_json TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (user_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_urb_user_id ON user_report_bundles(user_id, run_date);

CREATE TABLE IF NOT EXISTS api_budget_log (
    date         TEXT NOT NULL,
    provider     TEXT NOT NULL,
    call_count   INTEGER DEFAULT 0,
    run_id       TEXT,
    PRIMARY KEY (date, provider)
);
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


import uuid as _uuid


# ---------------------------------------------------------------------------
# Watchlist helpers (Task 2.2)
# ---------------------------------------------------------------------------

def get_watchlist(user_id: str) -> List[str]:
    """Return the tickers in a user's watchlist (empty list if not found)."""
    with _conn() as con:
        row = con.execute(
            "SELECT tickers FROM user_watchlists WHERE user_id = ?", (user_id,)
        ).fetchone()
    return json.loads(row["tickers"]) if row else []


def set_watchlist(user_id: str, tickers: List[str]) -> None:
    """Insert or replace a user's watchlist."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute(
            "INSERT OR REPLACE INTO user_watchlists (user_id, tickers, updated_at) VALUES (?, ?, ?)",
            (user_id, json.dumps([t.upper() for t in tickers]), now),
        )


# ---------------------------------------------------------------------------
# Alert helpers (Task 2.2)
# ---------------------------------------------------------------------------

def get_alerts(user_id: str) -> List[Dict[str, Any]]:
    """Return all alerts for a user, newest first."""
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM user_alerts WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [_row_to_alert(r) for r in rows]


def create_alert(user_id: str, ticker: str, condition: str, value: float) -> Dict[str, Any]:
    """Insert a new active alert and return it."""
    from datetime import datetime, timezone
    alert_id = str(_uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute(
            """
            INSERT INTO user_alerts (id, user_id, ticker, condition, value, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?)
            """,
            (alert_id, user_id, ticker.upper(), condition, value, now),
        )
    return {
        "id": alert_id,
        "user_id": user_id,
        "ticker": ticker.upper(),
        "condition": condition,
        "value": value,
        "status": "active",
        "created_at": now,
        "last_triggered_at": None,
    }


def update_alert(
    alert_id: str,
    *,
    status: Optional[str] = None,
    ticker: Optional[str] = None,
    condition: Optional[str] = None,
    value: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """Update mutable alert fields. Returns updated alert or None if not found/no fields."""
    updates: List[str] = []
    params: List[Any] = []

    if status is not None:
        updates.append("status = ?")
        params.append(status)
    if ticker is not None:
        updates.append("ticker = ?")
        params.append(ticker.upper())
    if condition is not None:
        updates.append("condition = ?")
        params.append(condition)
    if value is not None:
        updates.append("value = ?")
        params.append(value)

    if not updates:
        return None

    with _conn() as con:
        con.execute(
            f"UPDATE user_alerts SET {', '.join(updates)} WHERE id = ?",
            (*params, alert_id),
        )
        row = con.execute(
            "SELECT * FROM user_alerts WHERE id = ?", (alert_id,)
        ).fetchone()
    return _row_to_alert(row) if row else None


def delete_alert(alert_id: str) -> bool:
    """Delete an alert. Returns True if it existed."""
    with _conn() as con:
        cur = con.execute("DELETE FROM user_alerts WHERE id = ?", (alert_id,))
    return cur.rowcount > 0


def get_active_alerts() -> List[Dict[str, Any]]:
    """Return all active alerts across all users (for LangGraph alert checking)."""
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM user_alerts WHERE status = 'active' ORDER BY ticker",
        ).fetchall()
    return [_row_to_alert(r) for r in rows]


def mark_alert_triggered(alert_id: str) -> None:
    """Set alert status to 'triggered' and record the timestamp."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute(
            "UPDATE user_alerts SET status = 'triggered', last_triggered_at = ? WHERE id = ?",
            (now, alert_id),
        )


def _row_to_alert(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "ticker": row["ticker"],
        "condition": row["condition"],
        "value": row["value"],
        "status": row["status"],
        "created_at": row["created_at"],
        "last_triggered_at": row["last_triggered_at"],
    }


# ---------------------------------------------------------------------------
# User profile helpers (v3 Iteration 1)
# ---------------------------------------------------------------------------

def save_user_profile(user_id: str, profile_json: Dict[str, Any]) -> None:
    """Upsert a user profile JSON blob to user_profiles. Idempotent."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute(
            """
            INSERT OR REPLACE INTO user_profiles (user_id, profile_json, updated_at)
            VALUES (?, ?, ?)
            """,
            (user_id, json.dumps(profile_json), now),
        )


def load_user_profile_json(user_id: str) -> Optional[Dict[str, Any]]:
    """Return the raw profile JSON dict for a user, or None."""
    with _conn() as con:
        row = con.execute(
            "SELECT profile_json FROM user_profiles WHERE user_id = ?", (user_id,)
        ).fetchone()
    return json.loads(row["profile_json"]) if row else None


def load_all_profile_jsons() -> List[Dict[str, Any]]:
    """Return all user profile JSON dicts (for LangGraph init_state)."""
    with _conn() as con:
        rows = con.execute("SELECT user_id, profile_json FROM user_profiles").fetchall()
    result = []
    for r in rows:
        data = json.loads(r["profile_json"])
        data["_user_id"] = r["user_id"]
        result.append(data)
    return result


# ---------------------------------------------------------------------------
# User report bundle helpers (v3 Iteration 1)
# ---------------------------------------------------------------------------

def save_bundle(bundle: UserReportBundle) -> None:
    """Upsert a UserReportBundle to user_report_bundles."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    bundle_str = json.dumps(bundle)  # will raise if not serializable — intentional
    with _conn() as con:
        con.execute(
            """
            INSERT OR REPLACE INTO user_report_bundles
                (user_id, run_id, run_date, bundle_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                bundle["user_id"],
                bundle["run_id"],
                bundle["run_date"],
                bundle_str,
                now,
            ),
        )


def load_latest_bundle(user_id: str) -> Optional[Dict[str, Any]]:
    """Return the most recent UserReportBundle for a user, or None."""
    with _conn() as con:
        row = con.execute(
            """
            SELECT bundle_json FROM user_report_bundles
            WHERE user_id = ?
            ORDER BY run_date DESC, created_at DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
    return json.loads(row["bundle_json"]) if row else None


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


# ---------------------------------------------------------------------------
# API budget log helpers (v3 Iteration 2)
# ---------------------------------------------------------------------------

def record_api_call(date_str: str, provider: str, run_id: str) -> None:
    """Upsert one API call into api_budget_log, incrementing call_count.

    Uses SQLite ON CONFLICT to atomically increment the counter for the
    (date, provider) primary key.  Called by BudgetManager.record_call().
    """
    with _conn() as con:
        con.execute(
            """
            INSERT INTO api_budget_log (date, provider, call_count, run_id)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(date, provider) DO UPDATE SET
                call_count = call_count + 1,
                run_id     = excluded.run_id
            """,
            (date_str, provider, run_id),
        )


def get_api_budget_usage(date_str: str) -> Dict[str, int]:
    """Return {provider: total_call_count} for a given date.

    Returns an empty dict if no calls were logged for that date.
    """
    with _conn() as con:
        rows = con.execute(
            "SELECT provider, call_count FROM api_budget_log WHERE date = ?",
            (date_str,),
        ).fetchall()
    return {r["provider"]: r["call_count"] for r in rows}
