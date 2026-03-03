"""
Investora AI - FastAPI + LangChain/LangGraph
ReAct Pattern Implementation

Requirements:
    pip install -r requirements.txt

Run:
    uvicorn main:app --reload --port 8000

Environment Variables (.env):
    OPENAI_API_KEY=sk-...
    PINECONE_API_KEY=...
    PINECONE_INDEX_NAME=financial-agent
    API_SECRET_KEY=your-secret-key-min-32-chars
    CORS_ORIGINS=http://localhost:5173,https://yourdomain.com
    REDIS_URL=redis://localhost:6379          (optional)
    SENTRY_DSN=https://...@sentry.io/...     (optional)
    MAX_TOKENS=1000
    RATE_LIMIT=20/minute
"""

import os
import json
import hashlib
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

# ─── Sentry Setup ──────────────────────────────────────────
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[
            FastApiIntegration(),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        traces_sample_rate=0.2,
        environment=os.getenv("ENVIRONMENT", "production"),
    )

# ─── Logging ───────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("agent.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("financial-agent")

# ─── Rate Limiter ──────────────────────────────────────────
RATE_LIMIT = os.getenv("RATE_LIMIT", "20/minute")
limiter = Limiter(key_func=get_remote_address, default_limits=[RATE_LIMIT])

# ─── Redis Cache (optional) ────────────────────────────────
_redis_client = None

def get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            import redis
            url = os.getenv("REDIS_URL", "redis://localhost:6379")
            _redis_client = redis.Redis.from_url(url, decode_responses=True, socket_timeout=2)
            _redis_client.ping()
            logger.info("Redis connected ✓")
        except Exception as e:
            logger.warning(f"Redis unavailable, caching disabled: {e}")
            _redis_client = None
    return _redis_client


def cache_get(key: str) -> Optional[dict]:
    r = get_redis()
    if not r:
        return None
    try:
        val = r.get(key)
        return json.loads(val) if val else None
    except Exception:
        return None


def cache_set(key: str, value: dict, ttl: int = 3600):
    r = get_redis()
    if not r:
        return
    try:
        r.setex(key, ttl, json.dumps(value))
    except Exception:
        pass


# ─── Authentication ────────────────────────────────────────
API_SECRET_KEY = os.getenv("API_SECRET_KEY", "changeme-set-a-strong-secret-in-env")
security = HTTPBearer(auto_error=False)


def verify_api_key(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """
    Validates Bearer token. Internal services (n8n) pass the API_SECRET_KEY.
    Public /health endpoint is unauthenticated.
    """
    if not credentials or credentials.credentials != API_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key. Pass: Authorization: Bearer <API_SECRET_KEY>",
        )
    return credentials.credentials


# ─── Input Models ──────────────────────────────────────────

class ArticleInput(BaseModel):
    action: str = Field(..., min_length=1, max_length=100)
    article: Optional[Dict[str, Any]] = None

    @field_validator("article")
    @classmethod
    def sanitize_article(cls, v):
        if v is None:
            return v
        allowed_keys = {"title", "description", "source", "url", "publishedAt", "ticker"}
        sanitized = {k: str(val)[:2000] for k, val in v.items() if k in allowed_keys}
        return sanitized


class UserProfile(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    risk_tolerance: str = Field(..., pattern="^(low|medium|high)$")
    interests: List[str] = Field(..., min_length=1, max_length=10)
    constraints: Optional[List[str]] = Field(default=[], max_length=10)

    @field_validator("interests", "constraints")
    @classmethod
    def validate_list_items(cls, v):
        return [item[:100] for item in (v or [])]


class WeeklyReportRequest(BaseModel):
    action: str = Field(..., min_length=1, max_length=100)


class AgentResponse(BaseModel):
    title: str
    sentiment: str
    sentimentScore: float
    action: str
    embedding: List[float]
    reasoning: str
    timestamp: str
    cached: bool = False


# ─── LangChain Setup ──────────────────────────────────────

MAX_TOKENS = int(os.getenv("MAX_TOKENS", "1000"))
OPENAI_TIMEOUT = int(os.getenv("OPENAI_TIMEOUT", "30"))


def get_llm():
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model="gpt-4",
        temperature=0.1,
        max_tokens=MAX_TOKENS,
        timeout=OPENAI_TIMEOUT,
        api_key=os.getenv("OPENAI_API_KEY"),
    )


def get_embeddings():
    from langchain_openai import OpenAIEmbeddings
    return OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=os.getenv("OPENAI_API_KEY"),
    )


def get_pinecone_index():
    from pinecone import Pinecone
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    return pc.Index(os.getenv("PINECONE_INDEX_NAME", "financial-agent"))


# ─── Fallback Response ────────────────────────────────────

def fallback_agent_response(article: Dict[str, Any], reason: str) -> AgentResponse:
    """Return a safe fallback when the AI pipeline fails."""
    logger.warning(f"[FALLBACK] Using fallback response. Reason: {reason}")
    return AgentResponse(
        title=article.get("title", "Unknown"),
        sentiment="neutral",
        sentimentScore=0.0,
        action="LOG_NEUTRAL",
        embedding=[0.0] * 1536,
        reasoning=f"Fallback: AI processing unavailable ({reason}). Article logged for manual review.",
        timestamp=datetime.utcnow().isoformat(),
        cached=False,
    )


# ─── LangGraph ReAct Agent ────────────────────────────────

def build_react_agent():
    from langchain.tools import tool
    from langgraph.graph import StateGraph, END
    from typing import TypedDict, Annotated
    import operator

    class AgentState(TypedDict):
        article: Dict[str, Any]
        thoughts: Annotated[List[str], operator.add]
        actions: Annotated[List[str], operator.add]
        embedding: List[float]
        sentiment: str
        sentiment_score: float
        final_action: str
        reasoning: str

    @tool
    def analyze_sentiment(text: str) -> Dict[str, Any]:
        """Analyze financial sentiment of text using LLM."""
        llm = get_llm()
        response = llm.invoke(
            f"Analyze the financial sentiment of this text. "
            f"Return ONLY a JSON with 'sentiment' (positive/negative/neutral) "
            f"and 'score' (-1.0 to 1.0):\n\n{text[:1500]}"
        )
        try:
            result = json.loads(response.content)
            return result
        except json.JSONDecodeError:
            content = response.content.lower()
            if "positive" in content:
                return {"sentiment": "positive", "score": 0.5}
            elif "negative" in content:
                return {"sentiment": "negative", "score": -0.5}
            return {"sentiment": "neutral", "score": 0.0}

    @tool
    def generate_embedding(text: str) -> List[float]:
        """Generate vector embedding for text."""
        embeddings = get_embeddings()
        return embeddings.embed_query(text[:1500])

    def think_node(state: AgentState) -> AgentState:
        article = state["article"]
        thought = (
            f"Received article: '{article.get('title', 'Unknown')}' "
            f"from {article.get('source', 'unknown')}. "
            f"Analyzing sentiment and relevance."
        )
        logger.info(f"[THINK] {thought}")
        return {
            "thoughts": [thought], "actions": [], "embedding": [],
            "sentiment": "", "sentiment_score": 0.0, "final_action": "", "reasoning": "",
        }

    def act_sentiment_node(state: AgentState) -> AgentState:
        article = state["article"]
        text = f"{article.get('title', '')} {article.get('description', '')}"
        try:
            result = analyze_sentiment.invoke(text)
            sentiment = result.get("sentiment", "neutral")
            score = float(result.get("score", 0.0))
            logger.info(f"[ACT] Sentiment: {sentiment} ({score})")
            return {
                "sentiment": sentiment, "sentiment_score": score,
                "actions": [f"Sentiment: {sentiment} ({score:.2f})"],
            }
        except Exception as e:
            logger.error(f"[ACT ERROR] Sentiment failed: {e}")
            return {
                "sentiment": "neutral", "sentiment_score": 0.0,
                "actions": [f"Sentiment fallback: {e}"],
            }

    def act_embedding_node(state: AgentState) -> AgentState:
        article = state["article"]
        text = f"{article.get('title', '')} {article.get('description', '')}"
        try:
            embedding = generate_embedding.invoke(text)
            logger.info(f"[ACT] Embedding dim={len(embedding)}")
            return {
                "embedding": embedding,
                "actions": [f"Embedding dim={len(embedding)}"],
            }
        except Exception as e:
            logger.error(f"[ACT ERROR] Embedding failed: {e}")
            return {"embedding": [0.0] * 1536, "actions": [f"Embedding fallback: {e}"]}

    def decide_node(state: AgentState) -> AgentState:
        sentiment = state.get("sentiment", "neutral")
        score = state.get("sentiment_score", 0.0)
        if sentiment == "positive" and score > 0.2:
            action = "ALERT_OPPORTUNITY"
            reasoning = f"Positive sentiment ({score:.2f}). Potential investment opportunity."
        elif sentiment == "negative" and score < -0.2:
            action = "ALERT_RISK"
            reasoning = f"Negative sentiment ({score:.2f}). Potential market risk."
        elif abs(score) <= 0.2:
            action = "LOG_NEUTRAL"
            reasoning = f"Neutral sentiment ({score:.2f}). Logged for reference."
        else:
            action = "DISCARD"
            reasoning = "Insufficient signal."
        logger.info(f"[DECIDE] {action}: {reasoning}")
        return {
            "final_action": action, "reasoning": reasoning,
            "thoughts": [f"Decision: {action}"], "actions": [f"Final: {action}"],
        }

    graph = StateGraph(AgentState)
    graph.add_node("think", think_node)
    graph.add_node("analyze_sentiment", act_sentiment_node)
    graph.add_node("generate_embedding", act_embedding_node)
    graph.add_node("decide", decide_node)
    graph.set_entry_point("think")
    graph.add_edge("think", "analyze_sentiment")
    graph.add_edge("think", "generate_embedding")
    graph.add_edge("analyze_sentiment", "decide")
    graph.add_edge("generate_embedding", "decide")
    graph.add_edge("decide", END)
    return graph.compile()


# ─── FastAPI App ───────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Investora AI starting up...")
    get_redis()  # pre-connect to Redis on startup
    yield
    logger.info("Investora AI shutting down.")


app = FastAPI(
    title="Investora AI",
    description="ReAct Agent with LangChain/LangGraph for financial news analysis",
    version="1.1.0",
    lifespan=lifespan,
    docs_url="/docs",       # disable in production: docs_url=None
    redoc_url="/redoc",
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — load allowed origins from env, fallback to localhost only
_raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── Middleware: Request timing & logging ─────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000)
    logger.info(f"{request.method} {request.url.path} → {response.status_code} [{duration_ms}ms]")
    response.headers["X-Response-Time"] = f"{duration_ms}ms"
    return response


# ─── API Endpoints ─────────────────────────────────────────

@app.get("/health")
async def health():
    """Public health check — no auth required."""
    redis_ok = get_redis() is not None
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "redis": "connected" if redis_ok else "unavailable",
        "version": "1.1.0",
    }


@app.post("/api/react-agent", response_model=AgentResponse)
@limiter.limit("10/minute")
async def react_agent(
    request: Request,
    input_data: ArticleInput,
    _key: str = Depends(verify_api_key),
):
    """
    Main ReAct agent endpoint.
    Processes a single article through the ReAct cycle.
    Results are cached by article title hash for 1 hour.
    """
    if not input_data.article:
        raise HTTPException(status_code=400, detail="Article data is required")

    article = input_data.article
    title = article.get("title", "")

    # ── Cache lookup ──
    cache_key = "agent:" + hashlib.sha256(title.encode()).hexdigest()
    cached = cache_get(cache_key)
    if cached:
        logger.info(f"[CACHE HIT] {title[:60]}")
        return AgentResponse(**cached, cached=True)

    logger.info(f"[API] Processing article: {title[:60]}")

    try:
        agent = build_react_agent()
        initial_state = {
            "article": article,
            "thoughts": [], "actions": [], "embedding": [],
            "sentiment": "", "sentiment_score": 0.0,
            "final_action": "", "reasoning": "",
        }
        result = agent.invoke(initial_state)
        response = AgentResponse(
            title=title or "Unknown",
            sentiment=result.get("sentiment", "neutral"),
            sentimentScore=result.get("sentiment_score", 0.0),
            action=result.get("final_action", "DISCARD"),
            embedding=result.get("embedding", []),
            reasoning=result.get("reasoning", ""),
            timestamp=datetime.utcnow().isoformat(),
            cached=False,
        )
        cache_set(cache_key, response.model_dump(), ttl=3600)
        logger.info(f"[API] Done: action={response.action}, sentiment={response.sentiment}")
        return response

    except TimeoutError as e:
        logger.error(f"[TIMEOUT] OpenAI timed out: {e}")
        sentry_sdk.capture_exception(e)
        return fallback_agent_response(article, "OpenAI timeout")

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[API ERROR] ReAct agent failed: {error_msg}", exc_info=True)
        sentry_sdk.capture_exception(e)
        # Return fallback instead of 500 crash
        if "openai" in error_msg.lower() or "api" in error_msg.lower():
            return fallback_agent_response(article, "OpenAI API error")
        raise HTTPException(status_code=500, detail=f"Agent processing failed: {error_msg}")


@app.post("/api/weekly-report")
@limiter.limit("5/minute")
async def weekly_report(
    request: Request,
    req: WeeklyReportRequest,
    _key: str = Depends(verify_api_key),
):
    """Generate weekly report from Pinecone history. Cached for 30 minutes."""
    cache_key = "weekly-report:" + datetime.utcnow().strftime("%Y-%m-%d-%H")
    cached = cache_get(cache_key)
    if cached:
        logger.info("[CACHE HIT] Weekly report")
        return cached

    logger.info("[API] Generating weekly report")
    try:
        index = get_pinecone_index()
        embeddings = get_embeddings()
        llm = get_llm()

        query_embedding = embeddings.embed_query("financial market weekly summary")
        results = index.query(
            vector=query_embedding,
            top_k=50,
            include_metadata=True,
            namespace="financial-news",
        )

        articles_summary = []
        opportunities = risks = 0

        for match in results.get("matches", []):
            meta = match.get("metadata", {})
            articles_summary.append(
                f"- {meta.get('title', 'N/A')} [{meta.get('sentiment', 'N/A')}]"
            )
            if meta.get("action") == "ALERT_OPPORTUNITY":
                opportunities += 1
            elif meta.get("action") == "ALERT_RISK":
                risks += 1

        report_prompt = (
            f"Generate a concise weekly financial report based on these analyzed articles:\n\n"
            f"{chr(10).join(articles_summary[:20])}\n\n"
            f"Total: {len(articles_summary)} | Opportunities: {opportunities} | Risks: {risks}\n\n"
            f"Provide: 1) Market Overview 2) Key Opportunities 3) Risk Factors 4) Recommendations"
        )

        report = llm.invoke(report_prompt)
        now = datetime.utcnow()
        result_data = {
            "report": report.content,
            "period": f"{(now - timedelta(days=7)).strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')}",
            "totalAlerts": len(articles_summary),
            "opportunities": opportunities,
            "risks": risks,
            "timestamp": now.isoformat(),
        }
        cache_set(cache_key, result_data, ttl=1800)
        return result_data

    except Exception as e:
        logger.error(f"[API ERROR] Weekly report failed: {e}", exc_info=True)
        sentry_sdk.capture_exception(e)
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@app.post("/api/user-profile")
@limiter.limit("30/minute")
async def upsert_user_profile(
    request: Request,
    profile: UserProfile,
    _key: str = Depends(verify_api_key),
):
    """Store/update user risk profile in Pinecone for RAG matching."""
    logger.info(f"[API] Upserting profile: {profile.user_id}")
    try:
        index = get_pinecone_index()
        embeddings = get_embeddings()

        profile_text = (
            f"Risk tolerance: {profile.risk_tolerance}. "
            f"Interests: {', '.join(profile.interests)}. "
            f"Constraints: {', '.join(profile.constraints or [])}."
        )
        embedding = embeddings.embed_query(profile_text)

        index.upsert(
            vectors=[{
                "id": f"user-{profile.user_id}",
                "values": embedding,
                "metadata": {
                    "user_id": profile.user_id,
                    "risk_tolerance": profile.risk_tolerance,
                    "interests": profile.interests,
                    "constraints": profile.constraints or [],
                    "updated_at": datetime.utcnow().isoformat(),
                },
            }],
            namespace="user-profiles",
        )
        return {"status": "success", "user_id": profile.user_id}

    except Exception as e:
        logger.error(f"[API ERROR] Profile upsert failed: {e}", exc_info=True)
        sentry_sdk.capture_exception(e)
        raise HTTPException(status_code=500, detail=f"Profile update failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
