import { useState, useRef, useEffect } from "react";
import { Search, Plus, Loader2, AlertCircle } from "lucide-react";
import { useTickerSearch } from "@/lib/report";
import { STATIC_TICKERS } from "@/data/tickers";
import type { StaticTicker } from "@/data/tickers";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TickerSearchResult {
  ticker: string;
  name: string;
  exchange: string;
}

interface Props {
  onSelect: (ticker: string, name: string) => void;
  placeholder?: string;
  /** Tickers already in the list — shown as disabled in results */
  existing?: string[];
  /**
   * Whether to clear the input after a selection.
   * Default: true (good for Watchlist / Alerts — clear after add).
   * Set to false for Stock Analysis — keep the selected ticker in the box.
   */
  clearOnSelect?: boolean;
}

/** Instant local search against the static ticker list. */
function searchLocal(query: string): TickerSearchResult[] {
  const q = query.toUpperCase().trim();
  if (!q) return [];

  return STATIC_TICKERS.filter(
    (t: StaticTicker) =>
      t.ticker.startsWith(q) || t.name.toUpperCase().includes(q)
  )
    .sort((a: StaticTicker, b: StaticTicker) => {
      // Exact ticker match → float to top
      if (a.ticker === q) return -1;
      if (b.ticker === q) return 1;
      // Ticker prefix match ranks above name-only match
      const aStarts = a.ticker.startsWith(q);
      const bStarts = b.ticker.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      // Alphabetical tiebreak
      return a.ticker.localeCompare(b.ticker);
    })
    .slice(0, 8)
    .map((t: StaticTicker) => ({ ticker: t.ticker, name: t.name, exchange: t.exchange }));
}

export function TickerSearch({
  onSelect,
  placeholder = "Search ticker or company…",
  existing = [],
  clearOnSelect = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Prevents dropdown reopening on focus when clearOnSelect=false and user just selected
  const justSelectedRef = useRef(false);

  // 300 ms debounce — API only fires after user stops typing
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Local results — instant, no network
  const localResults = searchLocal(query);
  const localTickers = new Set(localResults.map((r) => r.ticker));

  // API results — debounced, only runs when query >= 2 chars and not empty
  const {
    data: apiResults,
    isLoading: apiLoading,
    isError: apiError,
  } = useTickerSearch(debouncedQuery);

  // Merge: local first, then any API results not already shown locally
  const apiOnly = (apiResults ?? []).filter((r) => !localTickers.has(r.ticker));
  const merged: TickerSearchResult[] = [...localResults, ...apiOnly].slice(0, 10);

  const showResults = open && query.length >= 1 && merged.length > 0;
  const showEmpty =
    open && query.length >= 2 && !apiLoading && merged.length === 0;
  const showError = open && query.length >= 1 && apiError && merged.length === 0;
  // Show spinner only when API is loading AND we have no local results yet
  const showSpinner = apiLoading && localResults.length === 0;

  const handleSelect = (ticker: string, name: string) => {
    onSelect(ticker, name);
    justSelectedRef.current = !clearOnSelect;
    setQuery(clearOnSelect ? "" : ticker);
    setDebouncedQuery(clearOnSelect ? "" : ticker);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        {showSpinner ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        )}
        <Input
          className="pl-9 h-9 text-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            justSelectedRef.current = false;
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (justSelectedRef.current) return;
            if (query.length >= 1) setOpen(true);
          }}
        />
      </div>

      {/* Results dropdown */}
      {showResults && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto">
          {merged.map((r) => {
            const alreadyAdded = existing.includes(r.ticker);
            return (
              <li key={r.ticker}>
                <button
                  disabled={alreadyAdded}
                  onClick={() => handleSelect(r.ticker, r.name)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors",
                    alreadyAdded
                      ? "text-muted-foreground cursor-not-allowed"
                      : "hover:bg-muted cursor-pointer"
                  )}
                >
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-foreground">
                      {r.ticker}
                    </span>
                    <span className="ml-2 text-muted-foreground truncate text-xs">
                      {r.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-xs text-muted-foreground">{r.exchange}</span>
                    {!alreadyAdded && <Plus className="h-3.5 w-3.5 text-primary" />}
                    {alreadyAdded && (
                      <span className="text-xs text-muted-foreground/60">Added</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* No results */}
      {showEmpty && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 px-3 py-3 text-sm text-muted-foreground">
          No results for &ldquo;{query}&rdquo;
        </div>
      )}

      {/* API error (only shown when local results are also empty) */}
      {showError && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 px-3 py-3 text-sm text-muted-foreground flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          Search unavailable — type a known ticker directly
        </div>
      )}
    </div>
  );
}
