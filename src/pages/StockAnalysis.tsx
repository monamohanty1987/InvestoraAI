import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, BarChart2 } from "lucide-react";
import { MarketStatusBar } from "@/components/MarketStatusBar";
import { TickerSearch } from "@/components/TickerSearch";
import { PriceChart } from "@/components/stock/PriceChart";
import { StockSnapshot } from "@/components/stock/StockSnapshot";
import { AIView } from "@/components/stock/AIView";
import { RecentNews } from "@/components/stock/RecentNews";
import { useStockSnapshot, useMarketQuotes } from "@/lib/report";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";

function StockHeader({ ticker }: { ticker: string }) {
  const { data: snapshot, isLoading: snapLoading } = useStockSnapshot(ticker);
  const { data: quotes, isLoading: quotesLoading } = useMarketQuotes([ticker]);

  const isLoading = snapLoading || quotesLoading;
  const quote = quotes?.[0];
  const positive = (quote?.change_pct ?? 0) >= 0;

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        <div className="h-7 w-16 bg-muted rounded" />
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="h-6 w-32 bg-muted rounded ml-4" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {/* Ticker + company */}
      <div>
        <span className="font-mono text-2xl font-bold text-foreground tracking-tight">
          {ticker.toUpperCase()}
        </span>
        {snapshot?.name && (
          <span className="ml-2 text-sm text-muted-foreground">{snapshot.name}</span>
        )}
      </div>

      {/* Price + change */}
      {quote && (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xl font-semibold text-foreground">
            ${quote.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-sm font-mono font-medium",
              positive ? "text-green-500" : "text-red-400"
            )}
          >
            {positive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {positive ? "+" : ""}
            {quote.change.toFixed(2)}{" "}
            ({positive ? "+" : ""}{quote.change_pct.toFixed(2)}%)
          </span>
        </div>
      )}
    </div>
  );
}

export default function StockAnalysis() {
  const { ticker: paramTicker } = useParams<{ ticker?: string }>();
  const navigate = useNavigate();
  const { watchlist } = useUser();
  const [activeTicker, setActiveTicker] = useState<string>(
    paramTicker?.toUpperCase() ?? ""
  );

  useEffect(() => {
    if (paramTicker) {
      setActiveTicker(paramTicker.toUpperCase());
      return;
    }
    if (!activeTicker && watchlist.length > 0) {
      const first = watchlist[0].toUpperCase();
      setActiveTicker(first);
      navigate(`/stock/${first}`, { replace: true });
    }
  }, [paramTicker, activeTicker, watchlist, navigate]);

  const handleTickerSelect = (t: string) => {
    setActiveTicker(t);
    navigate(`/stock/${t}`, { replace: true });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <MarketStatusBar />

      {/* Page header */}
      <header className="px-6 py-4 border-b border-border/50 flex items-center gap-3 sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
        <Link
          to="/watchlist"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Watchlist
        </Link>

        <span className="text-border">|</span>

        <div className="flex items-center gap-2 text-foreground shrink-0">
          <BarChart2 className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Stock Analysis</span>
        </div>

        {/* Inline ticker search */}
        <div className="flex-1 max-w-xs ml-auto">
          <TickerSearch
            onSelect={handleTickerSelect}
            placeholder="Search ticker…"
            existing={[]}
            clearOnSelect={false}
          />
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-6 py-5 space-y-5 max-w-[1200px] mx-auto w-full">
        {!activeTicker ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <BarChart2 className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm max-w-xs">
              Search for a ticker above to see price charts, key metrics, and AI analysis.
            </p>
          </div>
        ) : (
          <>
            {/* Ticker header row */}
            <StockHeader ticker={activeTicker} />

            {/* Price chart — full width */}
            <PriceChart ticker={activeTicker} />

            {/* Two-column grid: Snapshot + AI View */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <StockSnapshot ticker={activeTicker} />
              <AIView ticker={activeTicker} />
            </div>

            {/* Recent news — full width */}
            <RecentNews ticker={activeTicker} />
          </>
        )}
      </div>
    </div>
  );
}
