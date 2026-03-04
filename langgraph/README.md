# LangGraph Weekly Stock Report Agent

Python LangGraph agent that builds a weekly stock report for a fixed stock universe, uses MCP-style API tool wrappers (Marketstack, FMP, Finnhub), and posts the final JSON to n8n.

## Project Structure

```text
app/
  api.py
  graph.py
  n8n_client.py
  reporting.py
  run_weekly.py
  scoring.py
  state.py
  mcp_tools/
    __init__.py
    base.py
    market_data_tool.py
    fundamentals_tool.py
    news_tool.py
data/
  cache/
  reports/
requirements.txt
.env.example
README.md
```

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Required environment variable names are already present in `.env.example`:

- `MARKET_DATA_API_BASE_URL`
- `MARKET_DATA_API_KEY`
- `FUNDAMENTALS_API_BASE_URL`
- `FUNDAMENTALS_API_KEY`
- `NEWS_API_BASE_URL`
- `NEWS_API_KEY`
- `N8N_WEBHOOK_URL`
- `OPENAI_API_KEY`
- `PINECONE_API_KEY`
- `PINECONE_HOST`
- `RAG_EMBED_MODEL` (optional, default `text-embedding-3-small`)
- `RAG_LOOKBACK_DAYS` (optional, default `42`)
- `RAG_TOP_K` (optional, default `5`)
- `RAG_STORED_MEMOS` (optional reporting metadata only)

## Run (CLI)

```bash
python -m app.run_weekly --date 2024-04-22
```

Skip n8n post (local testing):

```bash
python -m app.run_weekly --date 2024-04-22 --no-post
```

## Run (FastAPI)

```bash
uvicorn app.api:app --reload
```

Trigger report:

```bash
curl -X POST "http://127.0.0.1:8000/run-weekly" \
  -H "Content-Type: application/json" \
  -d '{"run_date":"2024-04-22","no_post":false}'
```

## Direct n8n Webhook Test

Posts EXACT report schema body (sample):

```bash
curl -X POST "https://ai-experiementation.app.n8n.cloud/webhook-test/langgraph-results" \
  -H "Content-Type: application/json" \
  -d '{
    "report": {
      "title": "Weekly Investment Report",
      "run_date": "2024-04-22",
      "performance": {
        "weekly_change_percent": 0.0,
        "since_date": "2024-04-15",
        "trend": "flat"
      }
    },
    "top_opportunities": [],
    "strategy_breakdown": {"quality": [], "momentum": []},
    "insights": [],
    "data_sources": [
      {"name": "Market Data API", "type": "market"},
      {"name": "Fundamental Data API", "type": "fundamental"},
      {"name": "News/Search API", "type": "news"}
    ],
    "system_metadata": {
      "vector_index": {"provider": "Pinecone", "stored_memos": 0, "lookback_weeks": 6}
    }
  }'
```

## Behavior Notes

- Universe is loaded from `STOCK_UNIVERSE` (CSV). Default is 3 tickers for now. If over 50 symbols, symbols are sorted and first 50 are used deterministically.
- ReAct loop is implemented via `plan_next_action` node that decides missing tool calls per ticker (`market -> news`) and iterates until complete.
- ReAct planner uses the OpenAI API (`OPENAI_API_KEY`) to choose the next tool action; if planning fails, an error is recorded.
- RAG retrieval runs after scoring and before synthesis. It queries Pinecone by ticker + lookback window and adds retrieved evidence to LLM synthesis context.
- RAG retrieval is soft-fail: if Pinecone/OpenAI embedding config is missing, runs continue with empty retrieval context.
- Tool failures skip only the affected ticker and append structured errors.
- Caching is stored in `data/cache`; weekly reports in `data/reports/YYYY-MM-DD.json`.
- `prior_score` is loaded from the previous dated report file if it exists.
- Top-level `weekly_change_percent` is the average weekly change across top 3 opportunities (v1 simplification).
