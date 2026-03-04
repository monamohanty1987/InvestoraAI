from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Dict, Optional

import requests


class MCPToolError(Exception):
    pass


class MCPValidationError(MCPToolError):
    pass


class MCPRetryableError(MCPToolError):
    pass


class HTTPCachedTool:
    def __init__(self, cache_dir: str = "data/cache", timeout: int = 30, min_sleep_s: float = 1.0) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.timeout = timeout
        self.min_sleep_s = min_sleep_s
        self._last_call_ts = 0.0

    def _cache_key(self, namespace: str, payload: Dict[str, Any]) -> str:
        raw = json.dumps(payload, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        return f"{namespace}_{digest}.json"

    def _read_cache(self, namespace: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        path = self.cache_dir / self._cache_key(namespace, payload)
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return None

    def _write_cache(self, namespace: str, payload: Dict[str, Any], data: Dict[str, Any]) -> None:
        path = self.cache_dir / self._cache_key(namespace, payload)
        path.write_text(json.dumps(data, ensure_ascii=True), encoding="utf-8")

    def _respect_rate_limit(self) -> None:
        now = time.time()
        delta = now - self._last_call_ts
        if delta < self.min_sleep_s:
            time.sleep(self.min_sleep_s - delta)
        self._last_call_ts = time.time()

    def _get_with_retry(self, url: str, params: Dict[str, Any], retries: int = 3, backoff: float = 1.5) -> Dict[str, Any]:
        last_error: Optional[Exception] = None
        for attempt in range(1, retries + 1):
            try:
                self._respect_rate_limit()
                response = requests.get(url, params=params, timeout=self.timeout)
                if response.status_code >= 500:
                    raise MCPRetryableError(f"Server error {response.status_code}")
                if response.status_code >= 400:
                    raise MCPToolError(f"Client error {response.status_code}: {response.text[:200]}")
                return response.json()
            except (requests.Timeout, requests.ConnectionError, MCPRetryableError) as exc:
                last_error = exc
                if attempt == retries:
                    break
                time.sleep(backoff ** attempt)
        raise MCPRetryableError(f"Request failed after retries: {last_error}")
