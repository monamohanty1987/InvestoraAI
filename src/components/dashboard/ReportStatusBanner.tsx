import { useState, useMemo } from "react";
import { AlertTriangle, WifiOff, RefreshCw, ChevronDown, ChevronUp, Info } from "lucide-react";
import type { ToolError } from "@/lib/report";

// ── API fetch error (FastAPI unreachable or 5xx) ──────────────────────────────

interface FetchErrorBannerProps {
  error: Error;
  onRetry: () => void;
  isRetrying: boolean;
}

export function FetchErrorBanner({ error, onRetry, isRetrying }: FetchErrorBannerProps) {
  const isNotFound = error.message.includes("404");
  const isOffline = error.message.toLowerCase().includes("failed to fetch");

  if (isNotFound) {
    return (
      <div className="flex items-start gap-3 bg-warning/5 border border-warning/20 rounded-lg p-4">
        <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono font-medium text-warning">No report generated yet</p>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">
            Run the weekly agent to generate your first report:
            <code className="ml-1 bg-muted px-1 py-0.5 rounded text-foreground">
              python -m app.run_weekly --no-post
            </code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 bg-negative/5 border border-negative/20 rounded-lg p-4">
      <WifiOff className="w-4 h-4 text-negative shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono font-medium text-negative">
          {isOffline ? "Report service unreachable" : "Failed to load report"}
        </p>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">
          {isOffline
            ? "Start the FastAPI server: cd langgraph && uvicorn app.api:app --port 8000"
            : error.message}
        </p>
      </div>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="shrink-0 flex items-center gap-1.5 text-xs font-mono text-negative hover:text-foreground transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
        Retry
      </button>
    </div>
  );
}

// ── Partial data warning (some tools failed during the run) ───────────────────

interface ToolErrorsBannerProps {
  errors: ToolError[];
}

export function ToolErrorsBanner({ errors }: ToolErrorsBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!errors.length) return null;

  // Group by tool type for a cleaner summary — memoised since errors is stable between renders
  const summary = useMemo(() => {
    const byTool: Record<string, string[]> = {};
    for (const e of errors) {
      byTool[e.tool] = byTool[e.tool] ?? [];
      byTool[e.tool].push(e.ticker);
    }
    return Object.entries(byTool)
      .map(([tool, tickers]) => `${tool} (${tickers.join(", ")})`)
      .join(" · ");
  }, [errors]);

  return (
    <div className="bg-warning/5 border border-warning/20 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-warning/5 transition-colors"
      >
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono font-medium text-warning">
            Partial data — {errors.length} tool error{errors.length > 1 ? "s" : ""}
          </p>
          <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{summary}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-warning/10 px-4 pb-3 space-y-1.5">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                {e.ticker}
              </span>
              <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                {e.tool}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground mt-0.5 break-all">
                {e.error}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stale data notice (report older than 7 days) ──────────────────────────────

interface StaleReportNoticeProps {
  runDate: string;
}

export function StaleReportNotice({ runDate }: StaleReportNoticeProps) {
  const daysSince = Math.floor(
    (Date.now() - new Date(runDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSince < 7) return null;

  return (
    <div className="flex items-center gap-3 bg-muted/50 border border-border/50 rounded-lg px-4 py-3">
      <Info className="w-4 h-4 text-muted-foreground shrink-0" />
      <p className="text-xs font-mono text-muted-foreground">
        Report is {daysSince} days old (generated {runDate}). Run the weekly agent to refresh.
      </p>
    </div>
  );
}
