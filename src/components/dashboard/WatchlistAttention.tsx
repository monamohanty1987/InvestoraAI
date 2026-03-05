import type { PersonalizedSignal, UserReportBundle } from "@/lib/report";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WatchlistAttentionProps {
  bundle: UserReportBundle | undefined;
  isLoading: boolean;
  isError: boolean;
}

const urgencyOrder: Record<PersonalizedSignal["urgency"], number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

function urgencyTone(u: PersonalizedSignal["urgency"]): string {
  if (u === "High") return "bg-red-500/10 text-red-400 border-red-500/30";
  if (u === "Medium") return "bg-amber-500/10 text-amber-400 border-amber-500/30";
  return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
}

export function WatchlistAttention({ bundle, isLoading, isError }: WatchlistAttentionProps) {
  if (isLoading) {
    return <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">Loading watchlist attention...</div>;
  }
  if (isError || !bundle) {
    return <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">Unable to load Watchlist Attention</div>;
  }

  const items = [...(bundle.watchlist_signals || [])]
    .sort((a, b) => (urgencyOrder[b.urgency] - urgencyOrder[a.urgency]) || (b.fit_score - a.fit_score))
    .slice(0, 5);

  if (items.length === 0) {
    return <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">Your watchlist is quiet. No signals in the current run.</div>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-mono text-muted-foreground">Watchlist - What Needs Attention</h3>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/80 hover:text-primary transition-colors"
                aria-label="About Watchlist Attention"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs font-mono leading-relaxed">
              Prioritized watchlist signals sorted by urgency first, then fit score, with a suggested action for each ticker.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="space-y-2">
        {items.map((s) => (
          <article key={s.signal_id} className="rounded-lg border border-border/50 bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-mono text-primary">{s.ticker}</span>
                  <span className="text-xs text-muted-foreground">{s.signal_type}</span>
                </div>
                <p className="mt-1 text-sm text-foreground">{s.narrative?.trim() || "No data available"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Suggested action: {s.action_frame}</p>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[11px] font-mono ${urgencyTone(s.urgency)}`}>{s.urgency}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
