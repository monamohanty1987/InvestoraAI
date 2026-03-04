import os
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta
from openai import OpenAI

load_dotenv()

# ============================================
# CONFIGURATION
# ============================================
news_api_key = os.getenv("NEWS_API_KEY")
pinecone_api_key = os.getenv("PINECONE_API_KEY")
pinecone_host = os.getenv("PINECONE_HOST")
openai_api_key = os.getenv("OPENAI_API_KEY")

pinecone_headers = {
    "Api-Key": pinecone_api_key,
    "Content-Type": "application/json",
    "X-Pinecone-API-Version": "2024-07"
}

openai_client = OpenAI(api_key=openai_api_key)

_EMBED_MODEL = "text-embedding-3-small"  # 1536-dim — matches the Pinecone index


def embed_text(text: str) -> list:
    """Embed text using OpenAI text-embedding-3-small (1536 dims)."""
    response = openai_client.embeddings.create(
        model=_EMBED_MODEL,
        input=text,
    )
    return response.data[0].embedding



# ============================================
# STEP 1: DELETE ALL OLD ARTICLES
# ============================================
print("Cleaning up old articles...")

delete_url = f"{pinecone_host}/vectors/delete"
delete_data = {
    "deleteAll": True,
    "namespace": ""
}

response = requests.post(delete_url, json=delete_data, headers=pinecone_headers)

if response.status_code == 200:
    print("Cleared all vectors from Pinecone")
else:
    print("Delete failed:", response.json())

# ============================================
# STEP 2: FETCH ARTICLES FROM FINNHUB PER TICKER
# ============================================
TICKERS = ["AAPL", "AMZN", "GOOGL", "JPM", "MA", "META", "MSFT", "NVDA", "TSLA", "V"]

to_date = datetime.now().strftime("%Y-%m-%d")
from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

print(f"\nFetching articles from Finnhub ({from_date} → {to_date})...")

raw_articles = []  # [{ticker, headline, summary, source, url, date}, ...]
for ticker in TICKERS:
    params = {
        "symbol": ticker,
        "from": from_date,
        "to": to_date,
        "token": news_api_key,
    }
    resp = requests.get("https://finnhub.io/api/v1/company-news", params=params)
    items = resp.json() if resp.status_code == 200 else []
    if not isinstance(items, list):
        print(f"  {ticker}: unexpected response, skipping")
        continue
    for item in items[:10]:  # cap at 10 per ticker
        raw_articles.append({
            "ticker": ticker,
            "title": (item.get("headline") or "").strip(),
            "description": (item.get("summary") or "").strip(),
            "source": (item.get("source") or "Finnhub").strip(),
            "url": item.get("url", ""),
            "date": datetime.fromtimestamp(item["datetime"]).strftime("%Y-%m-%d") if item.get("datetime") else "",
        })
    print(f"  {ticker}: {len(items[:10])} articles")

print(f"Found {len(raw_articles)} articles across {len(TICKERS)} tickers")

# ============================================
# STEP 3: EMBED AND PREPARE FOR PINECONE
# ============================================
print("\nEmbedding articles with OpenAI text-embedding-3-small (1536 dims)...")

pinecone_vectors = []
for i, article in enumerate(raw_articles):
    if not article.get('title'):
        continue

    text_to_embed = article['title']
    if article.get('description'):
        text_to_embed += " " + article['description'][:300]

    try:
        embedding = embed_text(text_to_embed)
    except Exception as e:
        print(f"  Embedding failed for article {i}: {e}")
        continue

    date_ts = int(datetime.strptime(article['date'], "%Y-%m-%d").timestamp()) if article['date'] else 0
    pinecone_vectors.append({
        "id": f"article_{article['ticker']}_{i:04d}",
        "values": embedding,
        "metadata": {
            "title": article['title'][:200],
            "description": article['description'][:500],
            "source": article['source'],
            "url": article['url'],
            "date": article['date'],
            "timestamp": date_ts,
            "ticker": article['ticker'],
        }
    })

    if (i + 1) % 10 == 0:
        print(f"  Embedded {i + 1} articles...")

print(f"Prepared {len(pinecone_vectors)} articles for Pinecone")

# ============================================
# STEP 4: UPLOAD TO PINECONE (IN BATCHES)
# ============================================
url = f"{pinecone_host}/vectors/upsert"

batch_size = 50
total_uploaded = 0

for i in range(0, len(pinecone_vectors), batch_size):
    batch = pinecone_vectors[i:i + batch_size]
    data = {"vectors": batch}
    response = requests.post(url, json=data, headers=pinecone_headers)

    if response.status_code == 200:
        total_uploaded += len(batch)
        print(f"Batch {i//batch_size + 1}: Uploaded {len(batch)} articles")
    else:
        print(f"Batch failed: {response.json()}")

print(f"\nDone! {total_uploaded} financial articles in Pinecone")

# ============================================
# STEP 5: SHOW SAMPLE
# ============================================
print("\nSample articles uploaded:")
for i, article in enumerate(pinecone_vectors[:5]):
    ticker = article['metadata'].get('ticker', 'UNKNOWN')
    print(f"{i+1}. {article['metadata']['title']} ({article['metadata']['source']}) [Ticker: {ticker}]")

# ============================================
# STEP 6: VERIFY WITH QUERY
# ============================================
print("\nQuerying Pinecone to verify...")
query_url = f"{pinecone_host}/query"

test_vector = embed_text("NVDA NVIDIA AI chip earnings growth data center")
query_data = {
    "vector": test_vector,
    "top_k": 5,
    "include_metadata": True
}

query_response = requests.post(query_url, json=query_data, headers=pinecone_headers)

if query_response.status_code == 200:
    matches = query_response.json().get('matches', [])
    print(f"Query returned {len(matches)} matches")
    for match in matches:
        print(f"  - {match['metadata']['title']} (Score: {match['score']:.3f})")
else:
    print("Query failed:", query_response.json())
