# Financial AI Agent - FastAPI + LangChain/LangGraph

## Quick Start

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 4. Run the server
uvicorn main:app --reload --port 8000
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/react-agent` | POST | Process article through ReAct cycle |
| `/api/weekly-report` | POST | Generate weekly financial report |
| `/api/user-profile` | POST | Upsert user risk profile to Pinecone |

## n8n Configuration

Set these environment variables in n8n:

| Variable | Description |
|----------|-------------|
| `FASTAPI_URL` | `http://localhost:8000` |
| `NEWS_API_KEY` | From newsapi.org |
| `ALPHA_VANTAGE_API_KEY` | From alphavantage.co |
| `FINNHUB_API_KEY` | From finnhub.io |
| `PINECONE_API_KEY` | From pinecone.io |
| `PINECONE_HOST` | Your Pinecone index host |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `NOTION_DATABASE_ID` | Notion database for alerts |
| `NOTION_REPORTS_DB_ID` | Notion database for weekly reports |

## Credential Setup in n8n

1. **Telegram Bot**: Create via @BotFather, add credentials in n8n
2. **Notion**: Create integration at notion.so/my-integrations, share databases with integration
3. **Pinecone**: Create index with 1536 dimensions (for OpenAI embeddings)
