"""
profile_store.py
----------------
High-level CRUD for user profiles.

Wraps the low-level event_store helpers and handles field-name translation
between the camelCase JSON coming from the React frontend and the snake_case
Python TypedDicts consumed by the LangGraph pipeline.

Public API
----------
save_profile(user_id, profile_json)  → None
load_profile(user_id)                → UserProfileContext | None
load_all_profiles()                  → list[UserProfileContext]
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .event_store import (
    get_watchlist,
    load_all_profile_jsons,
    load_user_profile_json,
    save_user_profile,
)
from .models import UserProfileContext

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_VALID_RISK: frozenset = frozenset({"low", "medium", "high"})
_VALID_HORIZON: frozenset = frozenset({"short", "medium", "long"})


def _json_to_context(
    user_id: str,
    data: Dict[str, Any],
    watchlist: List[str],
) -> UserProfileContext:
    """
    Map a raw profile JSON dict (frontend camelCase) to a UserProfileContext.

    Missing / invalid fields fall back to safe defaults so the Personalization
    Node never receives None where a typed value is expected.
    """
    risk = data.get("riskTolerance", "medium")
    if risk not in _VALID_RISK:
        risk = "medium"

    horizon = data.get("horizon", "medium")
    if horizon not in _VALID_HORIZON:
        horizon = "medium"

    risk_pct = data.get("riskTolerancePercent", 50)
    if not isinstance(risk_pct, int):
        try:
            risk_pct = int(risk_pct)
        except (TypeError, ValueError):
            risk_pct = 50

    return UserProfileContext(
        user_id=user_id,
        risk_tolerance=risk,
        risk_tolerance_pct=risk_pct,
        interests=data.get("interests") or [],
        horizon=horizon,
        constraints=data.get("constraints") or [],
        preferred_assets=data.get("preferredAssets") or [],
        watchlist=watchlist,
        positions=data.get("positions") or [],
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def save_profile(user_id: str, profile_json: Dict[str, Any]) -> None:
    """
    Upsert a user profile JSON blob to the user_profiles SQLite table.

    Called by the ``PUT /user/{user_id}/profile`` endpoint whenever the
    frontend saves new profile settings.  The full JSON payload (including
    camelCase fields) is stored verbatim; field translation happens at read
    time in ``load_profile`` / ``load_all_profiles``.
    """
    save_user_profile(user_id, profile_json)


def load_profile(user_id: str) -> Optional[UserProfileContext]:
    """
    Return the UserProfileContext for a single user, or None if not found.

    Watchlist is loaded from the user_watchlists table and merged in so
    the returned context is fully populated.
    """
    data = load_user_profile_json(user_id)
    if data is None:
        return None
    watchlist = get_watchlist(user_id)
    return _json_to_context(user_id, data, watchlist)


def load_all_profiles() -> List[UserProfileContext]:
    """
    Return UserProfileContext objects for every user who has saved a profile.

    Used by the LangGraph ``init_state`` node to populate
    ``GraphState.user_profiles`` at the start of each analysis run.
    Watchlists are loaded per-user and merged in.
    """
    raw_profiles = load_all_profile_jsons()  # each dict has a synthetic "_user_id" key
    contexts: List[UserProfileContext] = []
    for raw in raw_profiles:
        uid = raw.get("_user_id", "")
        if not uid:
            continue
        watchlist = get_watchlist(uid)
        contexts.append(_json_to_context(uid, raw, watchlist))
    return contexts
