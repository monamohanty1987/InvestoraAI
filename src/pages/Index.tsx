import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import { MarketStatusBar } from "@/components/MarketStatusBar";
import { StrategyBreakdown } from "@/components/dashboard/StrategyBreakdown";
import { PortfolioPulse } from "@/components/dashboard/PortfolioPulse";
import { ConvictionIdeas } from "@/components/dashboard/ConvictionIdeas";
import { WatchlistAttention } from "@/components/dashboard/WatchlistAttention";
import { DiscoverySignals } from "@/components/dashboard/DiscoverySignals";
import { InvestmentProfileFilters } from "@/components/dashboard/InvestmentProfileFilters";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { useDashboard, useLatestReport, useRunHistory, useStreamRun } from "@/lib/report";

function SectionFallback({ name }: { name: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 text-sm text-muted-foreground">
      Unable to load {name}
    </div>
  );
}

const Index = () => {
  const { user, watchlist, updateProfile } = useUser();
  const [showRunHistory, setShowRunHistory] = useState(false);
  const { data: dashboard, isLoading, isError } = useDashboard(user?.userId);
  const { data: latestReport } = useLatestReport();
  const { startStream, isStreaming } = useStreamRun();
  const { data: runHistory } = useRunHistory();

  const handleGenerateReport = async () => {
    try {
      await startStream({ skipSynthesis: true });
      toast.success("Analysis run completed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Run failed");
      throw err;
    }
  };

  const handleApplyDashboardFilters = async (
    updates: {
      horizon: "short" | "medium" | "long";
      interests: string[];
      constraints: string[];
      preferredAssets: string[];
    },
  ) => {
    if (!user) return;
    const current = user.profile;
    const ok = await updateProfile({
      ...current,
      riskTolerance: current.riskTolerance ?? "medium",
      interests: updates.interests,
      telegramChatId: current.telegramChatId ?? "",
      horizon: updates.horizon,
      constraints: updates.constraints,
      preferredAssets: updates.preferredAssets,
    });
    if (!ok) {
      toast.error("Could not save profile filters");
      return;
    }

    toast.success("Profile filters saved. Refreshing personalized dashboard…");
    await handleGenerateReport();
  };

  const strategyBreakdown = useMemo(() => {
    const base = latestReport?.strategy_breakdown;
    if (!base) return { quality: [], momentum: [] };
    const topDiscovery = (dashboard?.discovery_signals || []).slice(0, 5).map((x) => x.ticker.toUpperCase());
    const scope = new Set([...watchlist.map((t) => t.toUpperCase()), ...topDiscovery]);
    if (scope.size === 0) return base;
    return {
      quality: base.quality.filter((i) => scope.has(i.company.toUpperCase())),
      momentum: base.momentum.filter((i) => scope.has(i.company.toUpperCase())),
    };
  }, [latestReport, dashboard, watchlist]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketStatusBar />

      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/90 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
            <p className="text-xs text-muted-foreground">Personalized signals and portfolio context</p>
          </div>
          <div className="flex items-center gap-2">
            <InvestmentProfileFilters
              profile={user?.profile}
              isApplying={isStreaming}
              onApply={handleApplyDashboardFilters}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateReport}
              disabled={isStreaming}
              className="h-8 gap-1.5 text-xs font-mono"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isStreaming ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{isStreaming ? "Running…" : "Run Analysis"}</span>
            </Button>
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRunHistory((v) => !v)}
                className="h-8 gap-1.5 text-xs font-mono"
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">History</span>
              </Button>
              {showRunHistory && runHistory && runHistory.length > 0 && (
                <div className="absolute right-0 top-full z-50 mt-1 w-72 space-y-0.5 rounded-lg border border-border bg-card p-2 shadow-xl">
                  {runHistory.slice(0, 5).map((run) => (
                    <div key={run.run_id} className="flex items-center justify-between rounded px-3 py-2 text-xs font-mono hover:bg-muted">
                      <span>{run.run_date}</span>
                      <span className="text-muted-foreground">{run.signal_count} sig</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1400px] flex-1 space-y-5 px-6 py-5">
        <ErrorBoundary fallback={<SectionFallback name="Portfolio Pulse" />}>
          <PortfolioPulse bundle={dashboard} watchlist={watchlist} isLoading={isLoading} isError={isError} />
        </ErrorBoundary>

        <ErrorBoundary fallback={<SectionFallback name="Highest-Conviction Ideas" />}>
          <ConvictionIdeas bundle={dashboard} isLoading={isLoading} isError={isError} />
        </ErrorBoundary>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ErrorBoundary fallback={<SectionFallback name="Watchlist Attention" />}>
            <WatchlistAttention bundle={dashboard} isLoading={isLoading} isError={isError} />
          </ErrorBoundary>
          <ErrorBoundary fallback={<SectionFallback name="Discovery Signals" />}>
            <DiscoverySignals bundle={dashboard} isLoading={isLoading} isError={isError} />
          </ErrorBoundary>
        </div>

        <ErrorBoundary fallback={<SectionFallback name="Strategy Breakdown" />}>
          <StrategyBreakdown breakdown={strategyBreakdown} />
        </ErrorBoundary>

      </div>

      <footer className="mt-4 border-t border-border/50 pb-16">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-3 px-6 py-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} InvestoraAI — For informational purposes only. Not financial advice.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/terms" className="transition-colors hover:text-primary">Terms of Service</Link>
            <Link to="/privacy" className="transition-colors hover:text-primary">Privacy Policy</Link>
            <Link to="/disclaimer" className="transition-colors hover:text-primary">Financial Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
