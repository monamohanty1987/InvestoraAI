import { useState } from "react";
import { BookMarked, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MarketStatusBar } from "@/components/MarketStatusBar";
import { TickerSearch } from "@/components/TickerSearch";
import { WatchlistTable } from "@/components/WatchlistTable";
import { useUser } from "@/contexts/UserContext";

export default function Watchlist() {
  const { watchlist, setWatchlist } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleAdd = async (ticker: string) => {
    if (watchlist.includes(ticker)) return;
    setIsUpdating(true);
    try {
      await setWatchlist([...watchlist, ticker]);
      toast.success(`${ticker} added to watchlist`);
    } catch {
      toast.error("Failed to update watchlist");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async (ticker: string) => {
    setIsUpdating(true);
    try {
      await setWatchlist(watchlist.filter((t) => t !== ticker));
      toast.success(`${ticker} removed`);
    } catch {
      toast.error("Failed to update watchlist");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <MarketStatusBar />

      {/* Page header */}
      <header className="px-6 py-4 border-b border-border/50 flex items-center justify-between gap-3 sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Watchlist</h1>
            <p className="text-xs text-muted-foreground">
              {watchlist.length} ticker{watchlist.length !== 1 ? "s" : ""} tracked · live quotes refresh every minute
            </p>
          </div>
        </div>

        {isUpdating && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Saving…
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 px-6 py-5 space-y-4 max-w-[1200px] mx-auto w-full">
        {/* Search */}
        <TickerSearch
          onSelect={(ticker) => handleAdd(ticker)}
          existing={watchlist}
          placeholder="Search ticker or company to add…"
        />

        {/* Table */}
        <WatchlistTable
          tickers={watchlist}
          onRemove={handleRemove}
          isUpdating={isUpdating}
        />
      </div>
    </div>
  );
}
