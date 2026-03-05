from __future__ import annotations

from functools import lru_cache
import os

from .base import MCPToolError, MCPRetryableError, MCPValidationError
from .fundamentals_tool import FundamentalsTool
from .market_data_tool import MarketDataTool
from .news_tool import NewsTool
from .rag_tool import RAGRetrievalTool

__all__ = [
    "MCPToolError",
    "MCPRetryableError",
    "MCPValidationError",
    "MarketDataTool",
    "FundamentalsTool",
    "NewsTool",
    "RAGRetrievalTool",
    "get_market_tool",
    "get_fundamentals_tool",
    "get_news_tool",
    "get_rag_tool",
]


def _use_mock() -> bool:
    return os.environ.get("USE_MOCK_DATA", "true").lower() == "true"


@lru_cache(maxsize=2)
def _market_tool_cached(use_mock: bool):
    if use_mock:
        from .mock_tools import MockMarketDataTool
        return MockMarketDataTool()
    return MarketDataTool()


@lru_cache(maxsize=2)
def _fundamentals_tool_cached(use_mock: bool):
    if use_mock:
        from .mock_tools import MockFundamentalsTool
        return MockFundamentalsTool()
    return FundamentalsTool()


@lru_cache(maxsize=2)
def _news_tool_cached(use_mock: bool):
    if use_mock:
        from .mock_tools import MockNewsTool
        return MockNewsTool()
    return NewsTool()


@lru_cache(maxsize=1)
def _rag_tool_cached():
    return RAGRetrievalTool()


def get_market_tool():
    return _market_tool_cached(_use_mock())


def get_fundamentals_tool():
    return _fundamentals_tool_cached(_use_mock())


def get_news_tool():
    return _news_tool_cached(_use_mock())


def get_rag_tool():
    # RAG always uses live Pinecone — USE_MOCK_DATA does not affect retrieval.
    return _rag_tool_cached()
