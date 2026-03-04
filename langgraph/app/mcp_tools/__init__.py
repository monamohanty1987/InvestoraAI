from __future__ import annotations

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
    return os.environ.get("USE_MOCK_DATA", "").lower() == "true"


def get_market_tool():
    if _use_mock():
        from .mock_tools import MockMarketDataTool
        return MockMarketDataTool()
    return MarketDataTool()


def get_fundamentals_tool():
    if _use_mock():
        from .mock_tools import MockFundamentalsTool
        return MockFundamentalsTool()
    return FundamentalsTool()


def get_news_tool():
    if _use_mock():
        from .mock_tools import MockNewsTool
        return MockNewsTool()
    return NewsTool()


def get_rag_tool():
    if _use_mock():
        from .mock_tools import MockRAGRetrievalTool
        return MockRAGRetrievalTool()
    return RAGRetrievalTool()
