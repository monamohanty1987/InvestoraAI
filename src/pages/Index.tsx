import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Download, Newspaper, Bell, RefreshCw, History, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { MarketStatusBar } from "@/components/MarketStatusBar";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { SentimentGauge } from "@/components/dashboard/SentimentGauge";
import { WorkflowStatus } from "@/components/dashboard/WorkflowStatus";
import { DownloadSection } from "@/components/dashboard/DownloadSection";
import { TopOpportunities } from "@/components/dashboard/TopOpportunities";
import { StrategyBreakdown } from "@/components/dashboard/StrategyBreakdown";
import { TopMovers } from "@/components/dashboard/TopMovers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { useLatestReport, useRunWeekly, useStreamRun, useRunHistory } from "@/lib/report";
import { FetchErrorBanner, ToolErrorsBanner, StaleReportNotice } from "@/components/dashboard/ReportStatusBanner";
import { ChatAgent } from "@/components/ChatAgent";

// ── Constants ─────────────────────────────────────────────────────────────────

const INTEREST_LABELS: Record<string, string> = {
  tech: "Tech",
  crypto: "Crypto",
  energy: "Energy",
  forex: "Forex",
  commodities: "Commodities",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-positive/10 text-positive border-positive/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high: "bg-negative/10 text-negative border-negative/30",
};

type Tab = "feed" | "alerts" | "downloads";

// ── Component ─────────────────────────────────────────────────────────────────

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [showRunHistory, setShowRunHistory] = useState(false);

  const { user, watchlist } = useUser();
  const navigate = useNavigate();

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
    error: reportErrorDetail,
    isFetching: reportFetching,
    refetch: refetchReport,
  } = useLatestReport();

  const { mutate: runWeekly, isPending: isGeneratingSync } = useRunWeekly();
  const { startStream, nodeProgress, isStreaming, streamError } = useStreamRun();
  const { data: runHistory } = useRunHistory();

  const isGenerating = isGeneratingSync || isStreaming;

  // Tickers for top movers: watchlist tickers merged with top-5 opportunity tickers
  const moverTickers = useMemo(() => {
    const fromReport = (report?.top_opportunities ?? []).slice(0, 5).map((o) => o.company.ticker);
    const merged = Array.from(new Set([...watchlist, ...fromReport]));
    return merged.slice(0, 12);
  }, [watchlist, report]);

  const watchlistStrategyBreakdown = useMemo(() => {
    if (!report) return { quality: [], momentum: [] };
    if (watchlist.length === 0) return report.strategy_breakdown;

    const watch = new Set(watchlist.map((t) => t.toUpperCase()));
    const quality = report.strategy_breakdown.quality.filter((item) => watch.has(item.company.toUpperCase()));
    const momentum = report.strategy_breakdown.momentum.filter((item) => watch.has(item.company.toUpperCase()));
    return { quality, momentum };
  }, [watchlist, report]);

  const sentimentScore = useMemo(() => {
    if (!report || report.top_opportunities.length === 0) return undefined;
    const top3 = report.top_opportunities.slice(0, 3);
    const avg = top3.reduce((s, o) => s + o.momentum.score, 0) / top3.length;
    return (avg / 10) * 2 - 1;
  }, [report]);

  const handleGenerateReport = () => {
    startStream({ skipSynthesis: true })
      .then(() => toast.success("Report generated successfully"))
      .catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : "Generation failed")
      );
    if (streamError) toast.error(streamError);
  };

  const risk = user?.profile.riskTolerance ?? "medium";
  const interests = user?.profile.interests ?? [];
  const latestRun = runHistory?.[0];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Market status bar — thin strip at the very top */}
      <MarketStatusBar />

      {/* Page header */}
      <header className="px-6 py-4 border-b border-border/50 flex items-center justify-between gap-3 sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
        <div>
          <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Weekly AI analysis &amp; market signals
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Run history popover */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRunHistory((v) => !v)}
              className="h-8 gap-1.5 font-mono text-xs"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">History</span>
            </Button>

            {showRunHistory && runHistory && runHistory.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-card border border-border rounded-lg shadow-xl z-50 p-2 space-y-0.5">
                {runHistory.slice(0, 5).map((run) => (
                  <button
                    key={run.run_id}
                    onClick={() => setShowRunHistory(false)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-muted text-xs font-mono text-left"
                  >
                    <span>{run.run_date}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{run.scope}</span>
                      {run.error_count > 0 && (
                        <span className="text-red-400">{run.error_count} err</span>
                      )}
                      <span>{run.signal_count} sig</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Generate report */}
          <Button
            size="sm"
            onClick={handleGenerateReport}
            disabled={isGenerating}
            className="h-8 gap-1.5 font-mono text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">
              {isStreaming ? "Running…" : isGeneratingSync ? "Generating…" : "Generate Report"}
            </span>
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-6 py-5 space-y-5 max-w-[1400px] mx-auto w-full">
        {/* Stats row */}
        <StatsBar
          weeklyChangePct={report?.report.performance.weekly_change_percent}
          opportunityCount={report?.top_opportunities.length}
          errorCount={latestRun?.error_count}
          runTimestamp={latestRun?.timestamp}
        />

        {/* Personalization badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Your filters:</span>
          <Badge
            variant="outline"
            className={`text-xs ${RISK_COLORS[risk] ?? RISK_COLORS.medium}`}
          >
            {risk.charAt(0).toUpperCase() + risk.slice(1)} risk
          </Badge>
          {interests.map((interest) => (
            <Badge
              key={interest}
              variant="outline"
              className="text-xs bg-primary/10 text-primary border-primary/30"
            >
              {INTEREST_LABELS[interest] ?? interest}
            </Badge>
          ))}
          <button
            onClick={() => navigate("/profile")}
            className="text-xs text-primary hover:underline ml-1 inline-flex items-center gap-1"
          >
            <Settings2 className="h-3 w-3" />
            Edit preferences
          </button>
        </div>

        {/* Main 2-column grid */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">
          {/* ── Left column: primary content ─────────────────────────── */}
          <div className="space-y-5">
            {/* Tab navigation */}
            <div className="flex gap-0.5 bg-card rounded-lg p-1 border border-border/50 w-fit">
              {[
                { id: "feed" as const, label: "News Feed", icon: Newspaper },
                { id: "alerts" as const, label: "Alerts", icon: Bell },
                { id: "downloads" as const, label: "Downloads", icon: Download },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-mono transition-all ${
                    activeTab === tab.id
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-5"
            >
              {activeTab === "feed" && (
                <>
                  {reportLoading && (
                    <div className="flex items-center gap-3 py-4">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="text-sm font-mono text-muted-foreground">
                        Loading report…
                      </span>
                    </div>
                  )}

                  {!reportLoading && reportError && reportErrorDetail && (
                    <FetchErrorBanner
                      error={reportErrorDetail}
                      onRetry={() => refetchReport()}
                      isRetrying={reportFetching}
                    />
                  )}

                  {report && <StaleReportNotice runDate={report.report.run_date} />}

                  {report && report.tool_errors?.length > 0 && (
                    <ToolErrorsBanner errors={report.tool_errors} />
                  )}

                  {report && (
                    <>
                      <TopOpportunities opportunities={report.top_opportunities} />
                      <StrategyBreakdown breakdown={watchlistStrategyBreakdown} />
                    </>
                  )}

                  <NewsFeed insights={report?.insights} />
                </>
              )}

              {activeTab === "alerts" && <AlertsPanel />}
              {activeTab === "downloads" && <DownloadSection />}
            </motion.div>
          </div>

          {/* ── Right column: widgets ──────────────────────────────────── */}
          <div className="space-y-4">
            {/* Top Movers */}
            <TopMovers tickers={moverTickers} />

            {/* Workflow status + Sentiment */}
            <WorkflowStatus
              dataSources={isStreaming ? undefined : report?.data_sources}
              graphProgress={isStreaming ? nodeProgress : undefined}
            />
            <SentimentGauge score={sentimentScore} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-4 pb-16">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} InvestoraAI — For informational purposes only. Not financial advice.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link to="/disclaimer" className="hover:text-primary transition-colors">Financial Disclaimer</Link>
          </div>
        </div>
      </footer>

      {/* Floating chat agent */}
      <ChatAgent />
    </div>
  );
};

export default Index;
