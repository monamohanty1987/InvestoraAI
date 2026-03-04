import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Download, Activity, Newspaper, Bell, Radio, LogOut, RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { SentimentGauge } from "@/components/dashboard/SentimentGauge";
import { WorkflowStatus } from "@/components/dashboard/WorkflowStatus";
import { DownloadSection } from "@/components/dashboard/DownloadSection";
import { TopOpportunities } from "@/components/dashboard/TopOpportunities";
import { StrategyBreakdown } from "@/components/dashboard/StrategyBreakdown";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import { useLatestReport, useRunWeekly, useStreamRun, useRunHistory } from "@/lib/report";
import { FetchErrorBanner, ToolErrorsBanner, StaleReportNotice } from "@/components/dashboard/ReportStatusBanner";

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

const Index = () => {
  const [activeTab, setActiveTab] = useState<"feed" | "alerts" | "downloads">("feed");
  const [showRunHistory, setShowRunHistory] = useState(false);
  const { user, logout } = useUser();
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

  const handleGenerateReport = () => {
    // Use SSE streaming run for live progress
    startStream({ skipSynthesis: false }).then(() => {
      toast.success("Report generated successfully");
    }).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    });
    if (streamError) toast.error(streamError);
  };

  const sentimentScore = useMemo(() => {
    if (!report || report.top_opportunities.length === 0) return undefined;
    const top3 = report.top_opportunities.slice(0, 3);
    const avg = top3.reduce((s, o) => s + o.momentum.score, 0) / top3.length;
    return (avg / 10) * 2 - 1;
  }, [report]);

  const initials = (user?.username ?? "??").slice(0, 2).toUpperCase();
  const risk = user?.profile.riskTolerance ?? "medium";
  const interests = user?.profile.interests ?? [];

  const latestRun = runHistory?.[0];

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center glow-primary">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-lg font-mono font-bold text-gradient-primary">
              Investora AI
            </h1>
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              v1.0
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-mono text-positive">
              <Radio className="w-3 h-3 animate-pulse" />
              LIVE
            </div>

            {/* Run history dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowRunHistory((v) => !v)}
                title="Run history"
                className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md border border-border/50 bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                <History className="w-3 h-3" />
                <span className="hidden sm:inline">History</span>
              </button>
              {showRunHistory && runHistory && runHistory.length > 0 && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-card border border-border/60 rounded-lg shadow-xl z-50 p-2 space-y-1">
                  {runHistory.slice(0, 5).map((run) => (
                    <div
                      key={run.run_id}
                      className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer text-xs font-mono"
                      onClick={() => setShowRunHistory(false)}
                    >
                      <span className="text-foreground">{run.run_date}</span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{run.scope}</span>
                        {run.error_count > 0 && (
                          <span className="text-negative">{run.error_count} err</span>
                        )}
                        <span>{run.signal_count} signals</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              title="Generate a new weekly report"
              className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md border border-border/50 bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3 h-3 ${isGenerating ? "animate-spin text-primary" : ""}`} />
              <span className="hidden sm:inline">
                {isStreaming ? "Running…" : isGeneratingSync ? "Generating…" : "Generate Report"}
              </span>
            </button>

            <div className="w-px h-4 bg-border/60" />

            {/* User widget */}
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-mono font-bold text-primary">
                {initials}
              </div>
              <span className="hidden sm:block text-xs font-mono text-muted-foreground">
                {user?.username}
              </span>
            </button>

            <button
              onClick={logout}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <StatsBar
          weeklyChangePct={report?.report.performance.weekly_change_percent}
          opportunityCount={report?.top_opportunities.length}
          errorCount={latestRun?.error_count}
          runTimestamp={latestRun?.timestamp}
        />

        {/* Personalization badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">Your filters:</span>
          <Badge
            variant="outline"
            className={`font-mono text-xs ${RISK_COLORS[risk] ?? RISK_COLORS.medium}`}
          >
            {risk.charAt(0).toUpperCase() + risk.slice(1)} risk
          </Badge>
          {interests.map((interest) => (
            <Badge
              key={interest}
              variant="outline"
              className="font-mono text-xs bg-primary/10 text-primary border-primary/30"
            >
              {INTEREST_LABELS[interest] ?? interest}
            </Badge>
          ))}
          <button
            onClick={() => navigate("/profile")}
            className="text-xs font-mono text-primary hover:underline ml-1"
          >
            Edit preferences
          </button>
        </div>

        {/* Sentiment + Workflow Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SentimentGauge score={sentimentScore} />
          <WorkflowStatus
            dataSources={isStreaming ? undefined : report?.data_sources}
            graphProgress={isStreaming ? nodeProgress : undefined}
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-card rounded-lg p-1 border border-border/50 w-fit">
          {[
            { id: "feed" as const, label: "News Feed", icon: Newspaper },
            { id: "alerts" as const, label: "Alerts", icon: Bell },
            { id: "downloads" as const, label: "Downloads", icon: Download },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-mono transition-all ${
                activeTab === tab.id
                  ? "bg-primary/15 text-primary glow-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "feed" && (
            <div className="space-y-6">
              {/* Loading state */}
              {reportLoading && (
                <div className="flex items-center gap-3 py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm font-mono text-muted-foreground">Loading report…</span>
                </div>
              )}

              {/* API fetch error (service down, network error, 404) */}
              {!reportLoading && reportError && reportErrorDetail && (
                <FetchErrorBanner
                  error={reportErrorDetail}
                  onRetry={() => refetchReport()}
                  isRetrying={reportFetching}
                />
              )}

              {/* Stale data notice */}
              {report && (
                <StaleReportNotice runDate={report.report.run_date} />
              )}

              {/* Partial data warning — tool errors from the last run */}
              {report && report.tool_errors?.length > 0 && (
                <ToolErrorsBanner errors={report.tool_errors} />
              )}

              {/* Report content */}
              {report && (
                <>
                  <TopOpportunities opportunities={report.top_opportunities} />
                  <StrategyBreakdown breakdown={report.strategy_breakdown} />
                </>
              )}

              <NewsFeed insights={report?.insights} />
            </div>
          )}
          {activeTab === "alerts" && <AlertsPanel />}
          {activeTab === "downloads" && <DownloadSection />}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-10 pb-20">
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs font-mono text-muted-foreground">
            © {new Date().getFullYear()} InvestoraAI — For informational purposes only. Not financial advice.
          </p>
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link to="/disclaimer" className="hover:text-primary transition-colors">Financial Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
