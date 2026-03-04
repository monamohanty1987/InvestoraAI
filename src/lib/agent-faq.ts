// ── InvestoraAI Chat Agent — Predefined Q&A ──────────────────────────────────

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqCategory {
  id: string;
  label: string;
  icon: string;
  items: FaqItem[];
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "dashboard",
    label: "Using the Dashboard",
    icon: "📊",
    items: [
      {
        id: "run-analysis",
        question: "How do I run an analysis?",
        answer:
          'Click the "Generate Report" button at the top of the dashboard. The AI agent will fetch live market, fundamental, and news data for all 10 stocks and generate a fresh weekly report. It usually takes 1–2 minutes.',
      },
      {
        id: "read-report",
        question: "How do I read the report?",
        answer:
          "The Top Opportunities section ranks all stocks by their Composite Score (0–10). Higher score = stronger opportunity. Each card shows the Quality rating (fundamentals) and Momentum rating (price action) separately. Click any ticker to see its full history.",
      },
      {
        id: "partial-data",
        question: "What does the 'Partial data' warning mean?",
        answer:
          "Some API calls failed during the run — usually because a market data API quota was reached or there was a temporary network issue. The report still shows results for tickers where data was available. Try running again or check your API quotas.",
      },
      {
        id: "download-report",
        question: "How do I download the report?",
        answer:
          'Go to the "Downloads" tab at the top of the dashboard. You can download the latest report as a JSON file for your own analysis or record-keeping.',
      },
      {
        id: "run-history",
        question: "How do I view past runs?",
        answer:
          'Click the "History" button near the top-right of the dashboard. It shows your last 10 analysis runs with the date, number of signals detected, and any errors that occurred.',
      },
      {
        id: "alerts-tab",
        question: "What is the Alerts tab?",
        answer:
          "The Alerts tab shows all ALERT_EVENT signals from the latest run — stocks that scored ≥ 8.5 (strong buy) or ≤ 1.5 (strong sell). These are the highest-priority signals for the week.",
      },
    ],
  },
  {
    id: "investing",
    label: "Investment Basics",
    icon: "📈",
    items: [
      {
        id: "quality-score",
        question: "What is a Quality Score?",
        answer:
          "Quality Score (0–10) measures a company's financial health using fundamentals: P/E ratio, earnings growth, revenue trends, and balance sheet strength. A score of 8+ means Strong, 6–8 is Good, 4–6 is Solid, and below 4 is Weak.",
      },
      {
        id: "momentum-score",
        question: "What is a Momentum Score?",
        answer:
          "Momentum Score (0–10) measures recent price performance, trading volume trends, and news sentiment. It tells you how the stock is moving right now. 8+ = Strong, 6–8 = Positive, 4–6 = Neutral, below 4 = Negative.",
      },
      {
        id: "composite-score",
        question: "How is the Composite Score calculated?",
        answer:
          "Composite Score = Quality × 55% + Momentum × 45%. It blends long-term financial strength (quality) with short-term price action (momentum). Weights can be adjusted in the backend settings.",
      },
      {
        id: "alert-signals",
        question: "What are ALERT signals?",
        answer:
          "Stocks scoring ≥ 8.5 (very strong opportunity) or ≤ 1.5 (very weak / potential short) are classified as ALERT_EVENT signals. These are the most actionable findings and can trigger Telegram notifications via n8n.",
      },
      {
        id: "weekly-candidates",
        question: "What are Weekly Candidates?",
        answer:
          "Stocks scoring between 7.0 and 8.4 are classified as WEEKLY_CANDIDATE signals — strong enough to watch but not yet at alert level. They're posted to a separate n8n webhook for your watchlist.",
      },
      {
        id: "not-advice",
        question: "Is this financial advice?",
        answer:
          "No. InvestoraAI is a research and screening tool that provides data-driven signals for informational purposes only. It is not financial advice. Always do your own research and consult a qualified financial advisor before making any investment decisions.",
      },
    ],
  },
  {
    id: "platform",
    label: "About the Platform",
    icon: "🤖",
    items: [
      {
        id: "stocks-analyzed",
        question: "What stocks are analyzed?",
        answer:
          "The default universe covers 10 large-cap US equities: AAPL, AMZN, GOOGL, JPM, MA, META, MSFT, NVDA, TSLA, and V. The list can be customised in the backend settings via the STOCK_UNIVERSE environment variable.",
      },
      {
        id: "how-often",
        question: "How often should I run the analysis?",
        answer:
          "InvestoraAI is designed for weekly analysis — ideally every Monday morning before markets open. Running it more frequently won't significantly change results since it uses weekly price and fundamental data.",
      },
      {
        id: "data-sources",
        question: "What data sources are used?",
        answer:
          "Three external APIs power the analysis: Marketstack (stock prices & OHLCV data), Financial Modeling Prep / FMP (fundamentals like P/E and earnings), and Finnhub (news articles and sentiment). GPT-4o-mini synthesizes everything into insights.",
      },
      {
        id: "mock-mode",
        question: "What is Mock Mode?",
        answer:
          "Mock Mode (USE_MOCK_DATA=true) runs the full analysis pipeline using pre-built simulated data — no real API keys needed. It's useful for testing the dashboard UI or when your API quotas are exhausted.",
      },
      {
        id: "render-sleep",
        question: "Why does the first request take so long?",
        answer:
          "The backend runs on Render's free tier which 'sleeps' after 15 minutes of inactivity. The first request wakes it up, which takes 30–60 seconds. Subsequent requests are fast. Upgrading to a paid Render plan keeps it always awake.",
      },
    ],
  },
  {
    id: "account",
    label: "Account & Preferences",
    icon: "⚙️",
    items: [
      {
        id: "change-prefs",
        question: "How do I change my preferences?",
        answer:
          'Click "Edit preferences" below your profile tags on the dashboard, or navigate to the Profile page. You can update your name, risk tolerance, and sector interests.',
      },
      {
        id: "risk-tolerance",
        question: "What is risk tolerance?",
        answer:
          "Risk tolerance reflects how much investment risk you're comfortable with: Low (prefer stable, dividend-paying stocks), Medium (balanced approach), or High (growth-oriented, higher volatility accepted). It personalises the dashboard display.",
      },
      {
        id: "interests",
        question: "What do the interest tags do?",
        answer:
          "Interest tags (Tech, Crypto, Energy, Forex, Commodities) personalise your dashboard. They appear as badges on your profile and will be used in future updates to filter and prioritise relevant signals for you.",
      },
      {
        id: "api-quotas",
        question: "What happens when an API quota runs out?",
        answer:
          "The affected tickers will show as tool errors in the Partial data warning. The rest of the report still generates normally. Check your API dashboards: Marketstack (100 req/month free), FMP (250 req/day free), Finnhub (60 req/min free).",
      },
    ],
  },
];

export const GREETING_MESSAGE =
  "Hi! 👋 I'm the InvestoraAI assistant. How can I help you today?";

export const FALLBACK_MESSAGE =
  "I'm not sure about that yet! Try selecting one of the categories below, or check the documentation for more details.";
