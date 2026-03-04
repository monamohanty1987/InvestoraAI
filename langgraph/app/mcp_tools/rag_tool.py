from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from openai import OpenAI
from pydantic import BaseModel, Field
import requests

from .base import MCPToolError, MCPValidationError, HTTPCachedTool


class RAGInput(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    query: str = Field(min_length=3, max_length=1000)
    lookback_days: int = Field(default=42, ge=1, le=365)
    top_k: int = Field(default=5, ge=1, le=8)
    namespace: str = Field(default="")
    end_date: Optional[str] = None


class RAGRetrievalTool(HTTPCachedTool):
    """Query Pinecone for ticker-filtered evidence used in synthesis."""

    def __init__(self) -> None:
        super().__init__(cache_dir="data/cache", min_sleep_s=0.2)
        self.pinecone_host = os.environ.get("PINECONE_HOST", "").rstrip("/")
        self.pinecone_api_key = os.environ.get("PINECONE_API_KEY", "")
        self.embedding_model = os.environ.get("RAG_EMBED_MODEL", "text-embedding-3-small")
        self._openai_api_key = os.environ.get("OPENAI_API_KEY", "")

    def _enabled(self) -> bool:
        return bool(self.pinecone_host and self.pinecone_api_key and self._openai_api_key)

    def _embed(self, text: str) -> List[float]:
        client = OpenAI(api_key=self._openai_api_key)
        resp = client.embeddings.create(model=self.embedding_model, input=text)
        return list(resp.data[0].embedding)

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        model = RAGInput(**payload)
        ticker = model.ticker.upper()

        if not self._enabled():
            return {
                "ticker": ticker,
                "query": model.query,
                "matches": [],
                "retrieved_count": 0,
                "enabled": False,
            }

        try:
            to_date = date.fromisoformat(model.end_date) if model.end_date else date.today()
        except ValueError as exc:
            raise MCPValidationError(f"Invalid end_date format: {model.end_date}") from exc
        from_date = to_date - timedelta(days=model.lookback_days)

        cache_payload = {
            "tool": "rag",
            "ticker": ticker,
            "query": model.query,
            "lookback_days": model.lookback_days,
            "top_k": model.top_k,
            "namespace": model.namespace,
            "to": to_date.isoformat(),
        }
        cached = self._read_cache("rag", cache_payload)
        if cached:
            return cached

        try:
            vector = self._embed(model.query)
            cutoff_ts = int(datetime(from_date.year, from_date.month, from_date.day).timestamp())
            request_body: Dict[str, Any] = {
                "vector": vector,
                "topK": model.top_k,
                "includeMetadata": True,
                "filter": {
                    "ticker": {"$eq": ticker},
                    "timestamp": {"$gte": cutoff_ts},
                },
            }
            if model.namespace:
                request_body["namespace"] = model.namespace
            headers = {
                "Api-Key": self.pinecone_api_key,
                "Content-Type": "application/json",
                "X-Pinecone-API-Version": "2024-07",
            }
            endpoint = f"{self.pinecone_host}/query"
            self._respect_rate_limit()
            post_resp = requests.post(endpoint, headers=headers, json=request_body, timeout=self.timeout)
            if post_resp.status_code >= 400:
                raise MCPToolError(f"Pinecone query failed {post_resp.status_code}: {post_resp.text[:200]}")
            data = post_resp.json()
        except Exception as exc:  # noqa: BLE001
            raise MCPToolError(f"RAG retrieval failed for {ticker}: {exc}") from exc

        raw_matches = data.get("matches", []) if isinstance(data, dict) else []
        matches: List[Dict[str, Any]] = []
        for m in raw_matches[: model.top_k]:
            meta = m.get("metadata") or {}
            matches.append(
                {
                    "id": m.get("id"),
                    "score": float(m.get("score", 0.0)),
                    "title": str(meta.get("title", "")),
                    "text": str(meta.get("text") or meta.get("content") or meta.get("description") or ""),
                    "source": str(meta.get("source", "")),
                    "date": str(meta.get("date", "")),
                    "url": str(meta.get("url", "")),
                    "signal_type": str(meta.get("signal_type", "")),
                    "ticker": str(meta.get("ticker", ticker)),
                }
            )

        result = {
            "ticker": ticker,
            "query": model.query,
            "matches": matches,
            "retrieved_count": len(matches),
            "enabled": True,
        }
        self._write_cache("rag", cache_payload, result)
        return result
