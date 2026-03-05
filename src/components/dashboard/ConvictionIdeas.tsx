import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import type { UserReportBundle } from "@/lib/report";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConvictionIdeasProps {
  bundle: UserReportBundle | undefined;
  isLoading: boolean;
  isError: boolean;
}

function confidenceTone(v: number): string {
  if (v >= 0.75) return "bg-emerald-500";
  if (v >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

export function ConvictionIdeas({ bundle, isLoading, isError }: ConvictionIdeasProps) {
  if (isLoading) {
    return <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">Loading conviction ideas...</div>;
  }
  if (isError || !bundle) {
    return <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">Unable to load Highest-Conviction Ideas</div>;
  }

  const top = (bundle.top_conviction || []).slice(0, 3);
  if (top.length === 0) {
    return <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">No high-conviction signals in current analysis run.</div>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-mono text-muted-foreground">Highest-Conviction Ideas</h3>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/80 hover:text-primary transition-colors"
                aria-label="About Highest-Conviction Ideas"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs font-mono leading-relaxed">
              Top ranked opportunities for your profile, combining signal strength, confidence, and fit score.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {top.map((s) => (
          <article key={s.signal_id} className="rounded-lg border border-border/50 bg-card p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">{s.ticker}</h4>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">{s.signal_type}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {s.narrative?.trim() || "No data available"}
            </p>
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">Confidence {(s.confidence * 100).toFixed(0)}%</p>
              <div className="mt-1 h-1.5 rounded bg-muted">
                <div className={`h-1.5 rounded ${confidenceTone(s.confidence)}`} style={{ width: `${Math.max(0, Math.min(100, s.confidence * 100))}%` }} />
              </div>
            </div>
            {s.risk_flags?.[0] ? (
              <p className="mt-2 text-xs text-amber-300">Risk: {s.risk_flags[0]}</p>
            ) : null}
            <Link to={`/stock/${s.ticker}`} className="mt-3 inline-block text-xs text-primary hover:underline">
              View Analysis →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
