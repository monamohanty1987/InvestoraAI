import { useMemo } from "react";
import { Info } from "lucide-react";
import type { UserReportBundle } from "@/lib/report";
import { useMarketQuotes } from "@/lib/report";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PortfolioPulseProps {
  bundle: UserReportBundle | undefined;
  watchlist: string[];
  isLoading: boolean;
  isError: boolean;
}

function regimeTone(regime: UserReportBundle["market_regime"] | undefined): string {
  if (regime === "Risk-On") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (regime === "Risk-Off") return "bg-red-500/10 text-red-400 border-red-500/30";
  return "bg-amber-500/10 text-amber-400 border-amber-500/30";
}

function alignmentTone(alignment: UserReportBundle["risk_alignment"] | undefined): string {
  if (alignment === "Aligned") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (alignment === "Off-Profile") return "bg-red-500/10 text-red-400 border-red-500/30";
  return "bg-amber-500/10 text-amber-400 border-amber-500/30";
}

export function PortfolioPulse({ bundle, watchlist, isLoading, isError }: PortfolioPulseProps) {
  const { data: quotes } = useMarketQuotes(watchlist);

  const watchlistTodayPct = useMemo(() => {
    if (quotes && quotes.length > 0) {
      const vals = quotes.map((q) => q.change_pct).filter((v) => Number.isFinite(v));
      if (vals.length > 0) {
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        return `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}% today`;
      }
    }
    if (bundle) {
      const vals = Object.values(bundle.watchlist_performance || {})
        .map((x) => x["1d"])
        .filter((v): v is number => typeof v === "number");
      if (vals.length > 0) {
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        return `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}% today`;
      }
    }
    return "No watchlist performance yet";
  }, [quotes, bundle]);

  if (isLoading) {
    return <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">Loading portfolio pulse...</div>;
  }
  if (isError || !bundle) {
    return <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">Unable to load Portfolio Pulse</div>;
  }

  return (
    <section className="rounded-lg border border-border/50 bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-mono text-muted-foreground">Portfolio Pulse</h3>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/80 hover:text-primary transition-colors"
                aria-label="About Portfolio Pulse"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs font-mono leading-relaxed">
              Quick snapshot of your watchlist move, current market regime, and how closely current signals match your risk profile.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-border/50 bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">Watchlist Performance</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{watchlistTodayPct}</p>
        </div>
        <div className={`rounded-md border p-3 ${regimeTone(bundle.market_regime)}`}>
          <p className="text-xs opacity-90">Market Regime</p>
          <p className="mt-1 text-sm font-semibold">{bundle.market_regime}</p>
        </div>
        <div className={`rounded-md border p-3 ${alignmentTone(bundle.risk_alignment)}`}>
          <p className="text-xs opacity-90">Risk Alignment</p>
          <p className="mt-1 text-sm font-semibold">{bundle.risk_alignment}</p>
        </div>
      </div>
    </section>
  );
}
