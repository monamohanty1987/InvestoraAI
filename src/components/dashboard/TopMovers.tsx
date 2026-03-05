import { useMemo } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTopMovers } from "@/lib/report";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  tickers: string[];
}

function PctBadge({ pct }: { pct: number }) {
  const positive = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-mono font-medium",
        positive ? "text-green-500" : "text-red-400"
      )}
    >
      {positive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {positive ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

export function TopMovers({ tickers }: Props) {
  const { data, isLoading, isError, error } = useTopMovers(tickers);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data]
      .sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))
      .slice(0, 8);
  }, [data]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          Top Movers
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading && (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && tickers.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            Add tickers to your{" "}
            <Link to="/watchlist" className="text-primary hover:underline">
              watchlist
            </Link>{" "}
            to see live movers.
          </p>
        )}

        {!isLoading && !isError && tickers.length > 0 && sorted.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            No mover data available right now for your selected tickers.
          </p>
        )}

        {!isLoading && isError && (
          <p className="text-xs text-red-400 py-2">
            Failed to load movers{error?.message ? `: ${error.message}` : "."}
          </p>
        )}

        {!isLoading && sorted.length > 0 && (
          <ul className="divide-y divide-border/40">
            {sorted.map((mover) => (
              <li key={mover.ticker}>
                <Link
                  to={`/stock/${mover.ticker}`}
                  className="flex items-center justify-between py-2 hover:bg-muted/40 -mx-1 px-1 rounded transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {mover.ticker}
                    </span>
                    <span className="ml-1.5 text-xs text-muted-foreground truncate max-w-[100px] hidden sm:inline">
                      {mover.name}
                    </span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="font-mono text-sm text-foreground">
                      ${mover.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <PctBadge pct={mover.change_pct} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
