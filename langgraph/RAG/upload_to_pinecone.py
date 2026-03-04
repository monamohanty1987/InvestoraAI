import os
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

# ============================================
# CONFIGURATION
# ============================================
news_api_key = os.getenv("NEWS_API_KEY")
pinecone_api_key = os.getenv("PINECONE_API_KEY")
pinecone_host = os.getenv("PINECONE_HOST")

pinecone_headers = {
    "Api-Key": pinecone_api_key,
    "Content-Type": "application/json",
    "X-Pinecone-API-Version": "2024-07"
}

# Helper function to guess tickers from title
def extract_ticker(title):
    tickers = {
        "Nvidia": "NVDA", "Apple": "AAPL", "Microsoft": "MSFT", 
        "Google": "GOOGL", "Amazon": "AMZN", "Tesla": "TSLA",
        "Meta": "META", "Netflix": "NFLX", "Intel": "INTC",
        "AMD": "AMD", "IBM": "IBM", "Salesforce": "CRM",
        "Adobe": "ADBE", "Spotify": "SPOT", "Uber": "UBER",
        "Airbnb": "ABNB", "Twitter": "TWTR", "Snap": "SNAP"
    }
    for company, ticker in tickers.items():
        if company.lower() in title.lower():
            return ticker
    return "UNKNOWN"

# ============================================
# STEP 1: DELETE ALL DUMMY ARTICLES
# ============================================
print("🧹 Cleaning up old dummy articles...")

delete_url = f"{pinecone_host}/vectors/delete"

# Delete by ID prefix (simpler approach)
delete_data = {
    "deleteAll": True,
    "namespace": ""  # Delete everything in default namespace
}

response = requests.post(delete_url, json=delete_data, headers=pinecone_headers)

if response.status_code == 200:
    print("✅ Cleared all vectors from Pinecone")
else:
    print("⚠️ Delete failed:", response.json())

# ============================================
# STEP 2: FETCH REAL ARTICLES FROM NEWS API
# ============================================
print("\n📡 Fetching real articles from News API...")

news_url = "https://newsapi.org/v2/everything"
params = {
    "q": "(stock OR market OR earnings OR IPO OR acquisition) AND (tech OR technology)",
    "domains": "bloomberg.com,reuters.com,wsj.com,ft.com,cnbc.com",
    "from": (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d"),
    "sortBy": "relevancy",
    "language": "en",
    "pageSize": 100,
    "apiKey": news_api_key
}

response = requests.get(news_url, params=params)
articles_data = response.json()

if articles_data.get("status") != "ok":
    print("❌ News API error:", articles_data)
    exit()

print(f"✅ Found {len(articles_data['articles'])} real articles")

# ============================================
# STEP 3: PREPARE FOR PINECONE
# ============================================
pinecone_vectors = []
for i, article in enumerate(articles_data['articles']):
    if not article.get('title'):
        continue
        
    pinecone_vectors.append({
        "id": f"real_article_{i:04d}",
        "values": [0.1] * 1024,
        "metadata": {
            "title": article['title'][:200],
            "description": article.get('description', '')[:500] if article.get('description') else "",
            "source": article['source']['name'],
            "url": article['url'],
            "date": article['publishedAt'][:10] if article.get('publishedAt') else "",
            "content": (article.get('content') or "")[:200],
            "ticker": extract_ticker(article['title'])
        }
    })

print(f"📦 Prepared {len(pinecone_vectors)} articles for Pinecone")

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
        print(f"✅ Batch {i//batch_size + 1}: Uploaded {len(batch)} real articles")
    else:
        print(f"❌ Batch failed: {response.json()}")

print(f"\n🎉 Done! {total_uploaded} real financial articles in Pinecone")

# ============================================
# STEP 5: SHOW SAMPLE
# ============================================
print("\n📰 Sample articles uploaded:")
for i, article in enumerate(pinecone_vectors[:5]):
    ticker = article['metadata'].get('ticker', 'UNKNOWN')
    print(f"{i+1}. {article['metadata']['title']} ({article['metadata']['source']}) [Ticker: {ticker}]")

# ============================================
# STEP 6: VERIFY WITH QUERY
# ============================================
print("\n🔍 Querying Pinecone to verify...")
query_url = f"{pinecone_host}/query"
query_data = {
    "vector": [0.1] * 1024,
    "top_k": 5,
    "include_metadata": True
}

query_response = requests.post(query_url, json=query_data, headers=pinecone_headers)

if query_response.status_code == 200:
    matches = query_response.json().get('matches', [])
    print(f"✅ Query returned {len(matches)} matches")
    for match in matches:
        print(f"  - {match['metadata']['title']} (Score: {match['score']:.2f})")
else:
    print("❌ Query failed:", query_response.json())