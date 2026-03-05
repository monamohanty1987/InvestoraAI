import { Link } from "react-router-dom";
import { Trash2, TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMarketQuotes, type Quote } from "@/lib/report";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  tickers: string[];
  onRemove: (ticker: string) => void;
  isUpdating?: boolean;
}

function ChangeCell({ change, pct }: { change: number; pct: number }) {
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <div className={cn("flex items-center gap-1 text-sm font-mono", up ? "text-green-500" : flat ? "text-muted-foreground" : "text-red-400")}>
      {flat ? (
        <Minus className="h-3.5 w-3.5" />
      ) : up ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" />
      )}
      <span>{up ? "+" : ""}{change.toFixed(2)}</span>
      <span className="text-xs opacity-80">({up ? "+" : ""}{pct.toFixed(2)}%)</span>
    </div>
  );
}

function fmt(n: number | null, decimals = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtBig(n: number | null) {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function QuoteRow({
  ticker,
  quote,
  onRemove,
  isUpdating,
}: {
  ticker: string;
  quote?: Quote;
  onRemove: (t: string) => void;
  isUpdating: boolean;
}) {
  const hasData = quote && !quote.error;
  return (
    <tr className="border-b border-border/40 hover:bg-muted/30 transition-colors">
      {/* Ticker */}
      <td className="px-4 py-3 whitespace-nowrap">
        <Link
          to={`/stock/${ticker}`}
          className="flex items-center gap-1 font-mono font-bold text-primary hover:underline"
        >
          {ticker}
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Link>
      </td>

      {/* Price */}
      <td className="px-4 py-3 text-right font-mono text-sm">
        {hasData ? `$${fmt(quote.price)}` : "—"}
      </td>

      {/* Change */}
      <td className="px-4 py-3 text-right">
        {hasData ? (
          <ChangeCell change={quote.change} pct={quote.change_pct} />
        ) : (
          <span className="text-xs text-muted-foreground">{quote?.error ?? "—"}</span>
        )}
      </td>

      {/* Volume */}
      <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground hidden sm:table-cell">
        {hasData ? fmtBig(quote.volume) : "—"}
      </td>

      {/* Mkt cap */}
      <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground hidden md:table-cell">
        {hasData ? fmtBig(quote.mkt_cap) : "—"}
      </td>

      {/* Remove */}
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="icon"
          disabled={isUpdating}
          onClick={() => onRemove(ticker)}
          className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

export function WatchlistTable({ tickers, onRemove, isUpdating = false }: Props) {
  const { data: quotes, isLoading } = useMarketQuotes(tickers);

  const quoteMap = (quotes ?? []).reduce<Record<string, Quote>>((acc, q) => {
    acc[q.ticker] = q;
    return acc;
  }, {});

  if (tickers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Your watchlist is empty. Use the search above to add tickers.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <th className="px-4 py-2.5 text-left">Ticker</th>
            <th className="px-4 py-2.5 text-right">Price</th>
            <th className="px-4 py-2.5 text-right">Change</th>
            <th className="px-4 py-2.5 text-right hidden sm:table-cell">Volume</th>
            <th className="px-4 py-2.5 text-right hidden md:table-cell">Mkt Cap</th>
            <th className="px-4 py-2.5 text-right">Remove</th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? tickers.map((t) => (
                <tr key={t} className="border-b border-border/40">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <td key={i} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : tickers.map((t) => (
                <QuoteRow
                  key={t}
                  ticker={t}
                  quote={quoteMap[t]}
                  onRemove={onRemove}
                  isUpdating={isUpdating}
                />
              ))}
        </tbody>
      </table>
    </div>
  );
}
