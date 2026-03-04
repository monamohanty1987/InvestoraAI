import { motion } from "framer-motion";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { InsightItem } from "@/lib/report";

interface NewsItem {
  id: number;
  title: string;
  source: string;
  sentiment: "positive" | "negative" | "neutral";
  score: number;
  time: string;
  url: string;
  tickers: string[];
}

const mockNews: NewsItem[] = [
  { id: 1, title: "Apple Reports Record Q4 Revenue, Beats Analyst Expectations", source: "Alpha Vantage", sentiment: "positive", score: 0.78, time: "3 min ago", url: "#", tickers: ["AAPL"] },
  { id: 2, title: "Fed Signals Potential Rate Cuts in Early 2026", source: "News API", sentiment: "positive", score: 0.65, time: "8 min ago", url: "#", tickers: ["SPY", "QQQ"] },
  { id: 3, title: "Tesla Faces Production Delays in European Gigafactory", source: "Finnhub", sentiment: "negative", score: -0.54, time: "12 min ago", url: "#", tickers: ["TSLA"] },
  { id: 4, title: "Microsoft Cloud Division Grows 33% Year-Over-Year", source: "Alpha Vantage", sentiment: "positive", score: 0.71, time: "18 min ago", url: "#", tickers: ["MSFT"] },
  { id: 5, title: "Oil Prices Stabilize After Middle East Tensions Ease", source: "News API", sentiment: "neutral", score: 0.05, time: "25 min ago", url: "#", tickers: ["USO", "XLE"] },
  { id: 6, title: "Crypto Market Sees $2B Liquidations Amid Volatility", source: "Finnhub", sentiment: "negative", score: -0.68, time: "32 min ago", url: "#", tickers: ["BTC", "ETH"] },
  { id: 7, title: "Amazon Expands AI Infrastructure with New Data Centers", source: "Alpha Vantage", sentiment: "positive", score: 0.58, time: "45 min ago", url: "#", tickers: ["AMZN"] },
  { id: 8, title: "Global Semiconductor Shortage Shows Signs of Recovery", source: "News API", sentiment: "positive", score: 0.42, time: "1h ago", url: "#", tickers: ["NVDA", "AMD"] },
];

const sentimentConfig = {
  positive: { icon: TrendingUp, color: "text-positive", bg: "bg-positive/10", label: "Bullish" },
  negative: { icon: TrendingDown, color: "text-negative", bg: "bg-negative/10", label: "Bearish" },
  neutral: { icon: Minus, color: "text-warning", bg: "bg-warning/10", label: "Neutral" },
};

interface NewsFeedProps {
  insights?: InsightItem[];
}

export function NewsFeed({ insights }: NewsFeedProps) {
  const items: NewsItem[] =
    insights && insights.length > 0
      ? insights.map((ins, i) => ({
          id: i + 1,
          title: ins.text,
          source: "LangGraph Report",
          sentiment: "neutral" as const,
          score: 0,
          time: "This week",
          url: "#",
          tickers: [ins.company],
        }))
      : mockNews;

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const config = sentimentConfig[item.sentiment];
        const Icon = config.icon;
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="bg-card border border-border/50 rounded-lg p-4 hover:border-glow transition-all group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h4 className="font-sans text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-tight">
                  {item.title}
                </h4>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground">{item.source}</span>
                  <span className="text-xs font-mono text-muted-foreground">{item.time}</span>
                  <div className="flex gap-1">
                    {item.tickers.map((t) => (
                      <span key={t} className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className={`flex items-center gap-1.5 ${config.bg} px-2 py-1 rounded-md`}>
                  <Icon className={`w-3 h-3 ${config.color}`} />
                  <span className={`text-xs font-mono font-medium ${config.color}`}>
                    {item.score > 0 ? "+" : ""}{item.score.toFixed(2)}
                  </span>
                </div>
                <a href={item.url} className="text-muted-foreground hover:text-primary transition-colors">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
