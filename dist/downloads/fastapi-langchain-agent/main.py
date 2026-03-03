"""
Financial AI Agent - FastAPI + LangChain/LangGraph
ReAct Pattern Implementation

Requirements:
    pip install fastapi uvicorn langchain langchain-openai langgraph pinecone-client pydantic python-dotenv

Run:
    uvicorn main:app --reload --port 8000
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from enum import Enum

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

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

# ─── FastAPI App ───────────────────────────────────────────
app = FastAPI(
    title="Financial AI Agent",
    description="ReAct Agent with LangChain/LangGraph for financial news analysis",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Models ────────────────────────────────────────────────

class ArticleInput(BaseModel):
    action: str
    article: Optional[Dict[str, Any]] = None

class UserProfile(BaseModel):
    user_id: str
    risk_tolerance: str  # low, medium, high
    interests: List[str]  # e.g., ["tech", "crypto", "energy"]
    constraints: Optional[List[str]] = []

class WeeklyReportRequest(BaseModel):
    action: str

class AgentResponse(BaseModel):
    title: str
    sentiment: str
    sentimentScore: float
    action: str
    embedding: List[float]
    reasoning: str
    timestamp: str


# ─── LangChain Setup ──────────────────────────────────────

def get_llm():
    """Initialize LLM - supports OpenAI or any LangChain-compatible model."""
    from langchain_openai import ChatOpenAI
    
    return ChatOpenAI(
        model="gpt-4",
        temperature=0.1,
        api_key=os.getenv("OPENAI_API_KEY"),
    )


def get_embeddings():
    """Initialize embedding model for Pinecone vectors."""
    from langchain_openai import OpenAIEmbeddings
    
    return OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=os.getenv("OPENAI_API_KEY"),
    )


def get_pinecone_index():
    """Initialize Pinecone client."""
    from pinecone import Pinecone
    
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    return pc.Index(os.getenv("PINECONE_INDEX_NAME", "financial-agent"))


# ─── LangGraph ReAct Agent ────────────────────────────────

def build_react_agent():
    """
    Build a LangGraph-based ReAct agent for financial analysis.
    
    The agent follows the ReAct (Reason + Act) cycle:
    1. Thought: Analyze the incoming article
    2. Act: Generate embeddings, query sentiment
    3. Observe: Check results
    4. Decide: Alert, log, or discard
    """
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
            f"and 'score' (-1.0 to 1.0):\n\n{text}"
        )
        import json
        try:
            result = json.loads(response.content)
            return result
        except json.JSONDecodeError:
            # Fallback parsing
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
        return embeddings.embed_query(text)

    def think_node(state: AgentState) -> AgentState:
        """Thought step: Analyze what we have."""
        article = state["article"]
        thought = f"Received article: '{article.get('title', 'Unknown')}' from {article.get('source', 'unknown')}. Need to analyze sentiment and relevance."
        logger.info(f"[THINK] {thought}")
        return {"thoughts": [thought], "actions": [], "embedding": [], "sentiment": "", "sentiment_score": 0.0, "final_action": "", "reasoning": ""}

    def act_sentiment_node(state: AgentState) -> AgentState:
        """Act step: Analyze sentiment."""
        article = state["article"]
        text = f"{article.get('title', '')} {article.get('description', '')}"
        
        try:
            result = analyze_sentiment.invoke(text)
            sentiment = result.get("sentiment", "neutral")
            score = float(result.get("score", 0.0))
            logger.info(f"[ACT] Sentiment: {sentiment} ({score})")
            return {"sentiment": sentiment, "sentiment_score": score, "actions": [f"Analyzed sentiment: {sentiment} ({score})"]}
        except Exception as e:
            logger.error(f"[ACT ERROR] Sentiment analysis failed: {e}")
            return {"sentiment": "neutral", "sentiment_score": 0.0, "actions": [f"Sentiment analysis failed: {e}"]}

    def act_embedding_node(state: AgentState) -> AgentState:
        """Act step: Generate embedding for RAG."""
        article = state["article"]
        text = f"{article.get('title', '')} {article.get('description', '')}"
        
        try:
            embedding = generate_embedding.invoke(text)
            logger.info(f"[ACT] Generated embedding (dim={len(embedding)})")
            return {"embedding": embedding, "actions": [f"Generated embedding (dim={len(embedding)})"]}
        except Exception as e:
            logger.error(f"[ACT ERROR] Embedding generation failed: {e}")
            return {"embedding": [0.0] * 1536, "actions": [f"Embedding failed: {e}"]}

    def decide_node(state: AgentState) -> AgentState:
        """Decision step: Determine action based on analysis."""
        sentiment = state.get("sentiment", "neutral")
        score = state.get("sentiment_score", 0.0)
        
        if sentiment == "positive" and score > 0.2:
            action = "ALERT_OPPORTUNITY"
            reasoning = f"Positive sentiment ({score:.2f}) detected. This may present an investment opportunity."
        elif sentiment == "negative" and score < -0.2:
            action = "ALERT_RISK"
            reasoning = f"Negative sentiment ({score:.2f}) detected. This may indicate market risk."
        elif abs(score) <= 0.2:
            action = "LOG_NEUTRAL"
            reasoning = f"Neutral sentiment ({score:.2f}). Logging for reference."
        else:
            action = "DISCARD"
            reasoning = "Insufficient signal for action."
        
        logger.info(f"[DECIDE] Action: {action} - {reasoning}")
        return {
            "final_action": action,
            "reasoning": reasoning,
            "thoughts": [f"Decision: {action}"],
            "actions": [f"Final action: {action}"]
        }

    # Build the graph
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


# ─── API Endpoints ─────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/react-agent", response_model=AgentResponse)
async def react_agent(input_data: ArticleInput):
    """
    Main ReAct agent endpoint called by n8n.
    Processes a single article through the ReAct cycle.
    """
    logger.info(f"[API] Received article for analysis: {input_data.action}")
    
    if not input_data.article:
        raise HTTPException(status_code=400, detail="Article data is required")
    
    try:
        agent = build_react_agent()
        
        initial_state = {
            "article": input_data.article,
            "thoughts": [],
            "actions": [],
            "embedding": [],
            "sentiment": "",
            "sentiment_score": 0.0,
            "final_action": "",
            "reasoning": "",
        }
        
        result = agent.invoke(initial_state)
        
        response = AgentResponse(
            title=input_data.article.get("title", "Unknown"),
            sentiment=result.get("sentiment", "neutral"),
            sentimentScore=result.get("sentiment_score", 0.0),
            action=result.get("final_action", "DISCARD"),
            embedding=result.get("embedding", []),
            reasoning=result.get("reasoning", ""),
            timestamp=datetime.utcnow().isoformat(),
        )
        
        logger.info(f"[API] Response: action={response.action}, sentiment={response.sentiment}")
        return response
        
    except Exception as e:
        logger.error(f"[API ERROR] ReAct agent failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent processing failed: {str(e)}")


@app.post("/api/weekly-report")
async def weekly_report(request: WeeklyReportRequest):
    """
    Generate weekly report by querying Pinecone for all
    stored articles from the past week.
    """
    logger.info("[API] Generating weekly report")
    
    try:
        index = get_pinecone_index()
        embeddings = get_embeddings()
        llm = get_llm()
        
        # Query recent articles
        query_embedding = embeddings.embed_query("financial market weekly summary")
        results = index.query(
            vector=query_embedding,
            top_k=50,
            include_metadata=True,
            namespace="financial-news",
        )
        
        articles_summary = []
        opportunities = 0
        risks = 0
        
        for match in results.get("matches", []):
            meta = match.get("metadata", {})
            articles_summary.append(f"- {meta.get('title', 'N/A')} [{meta.get('sentiment', 'N/A')}]")
            if meta.get("action") == "ALERT_OPPORTUNITY":
                opportunities += 1
            elif meta.get("action") == "ALERT_RISK":
                risks += 1
        
        # Generate report with LLM
        report_prompt = f"""Generate a concise weekly financial report based on these analyzed articles:

{chr(10).join(articles_summary[:20])}

Total articles analyzed: {len(articles_summary)}
Opportunities identified: {opportunities}
Risks identified: {risks}

Provide: 1) Market Overview 2) Key Opportunities 3) Risk Factors 4) Recommendations"""
        
        report = llm.invoke(report_prompt)
        
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)
        
        return {
            "report": report.content,
            "period": f"{week_ago.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')}",
            "totalAlerts": len(articles_summary),
            "opportunities": opportunities,
            "risks": risks,
            "timestamp": now.isoformat(),
        }
        
    except Exception as e:
        logger.error(f"[API ERROR] Weekly report failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@app.post("/api/user-profile")
async def upsert_user_profile(profile: UserProfile):
    """
    Store/update user risk profile in Pinecone for RAG matching.
    """
    logger.info(f"[API] Upserting user profile: {profile.user_id}")
    
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
            vectors=[
                {
                    "id": f"user-{profile.user_id}",
                    "values": embedding,
                    "metadata": {
                        "user_id": profile.user_id,
                        "risk_tolerance": profile.risk_tolerance,
                        "interests": profile.interests,
                        "constraints": profile.constraints or [],
                        "updated_at": datetime.utcnow().isoformat(),
                    },
                }
            ],
            namespace="user-profiles",
        )
        
        return {"status": "success", "user_id": profile.user_id}
        
    except Exception as e:
        logger.error(f"[API ERROR] Profile upsert failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Profile update failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
