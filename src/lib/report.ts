import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

// ── TypeScript interfaces (mirror Python TypedDicts exactly) ──────────────────

export interface CompanyInfo {
  name: string;
  ticker: string;
  icon: string;
}

export interface QualityBlock {
  rating: "Strong" | "Good" | "Solid" | "Weak";
  score: number;
}

export interface MomentumBlock {
  rating: "Strong" | "Positive" | "Neutral" | "Negative";
  score: number;
}

export interface WeeklyChangeBlock {
  value: number | null;
  direction: "up" | "down" | "flat";
}

export interface TopOpportunity {
  rank: number;
  company: CompanyInfo;
  score: number;
  prior_score: number | null;
  quality: QualityBlock;
  momentum: MomentumBlock;
  weekly_change: WeeklyChangeBlock;
}

export interface StrategyItem {
  company: string;
  score: number;
  rating: string;
  bar_percentage: number;
}

export interface InsightItem {
  company: string;
  text: string;
}

export interface DataSourceItem {
  name: string;
  type: "market" | "fundamental" | "news";
}

export interface ToolError {
  ticker: string;
  tool: string;
  error: string;
}

export interface ReportPayload {
  report: {
    title: string;
    run_date: string;
    performance: {
      weekly_change_percent: number;
      since_date: string;
      trend: "up" | "down" | "flat";
    };
  };
  top_opportunities: TopOpportunity[];
  strategy_breakdown: {
    quality: StrategyItem[];
    momentum: StrategyItem[];
  };
  insights: InsightItem[];
  data_sources: DataSourceItem[];
  system_metadata: {
    vector_index: {
      provider: string;
      stored_memos: number;
      lookback_weeks: number;
    };
  };
  tool_errors: ToolError[];
}

// ── Fetch function ────────────────────────────────────────────────────────────

export async function fetchLatestReport(): Promise<ReportPayload> {
  const res = await fetch(`${API_BASE}/latest-report`);
  if (!res.ok) throw new Error(`Failed to fetch report: ${res.status}`);
  return res.json() as Promise<ReportPayload>;
}

// ── React Query hooks ─────────────────────────────────────────────────────────

export function useLatestReport() {
  return useQuery<ReportPayload, Error>({
    queryKey: ["latest-report"],
    queryFn: fetchLatestReport,
    staleTime: 60 * 60 * 1000, // 1 hour — weekly data rarely changes
    retry: 1,
  });
}

async function triggerWeeklyRun(): Promise<void> {
  const res = await fetch(`${API_BASE}/run-weekly`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ no_post: false }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Report generation failed (${res.status}): ${text.slice(0, 120)}`);
  }
}

export function useRunWeekly() {
  const queryClient = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: triggerWeeklyRun,
    onSuccess: () => {
      // Invalidate so the dashboard auto-refetches the new report
      queryClient.invalidateQueries({ queryKey: ["latest-report"] });
    },
  });
}

// ── SSE streaming types & hook ─────────────────────────────────────────────

export type StreamNodeStatus = "pending" | "running" | "completed" | "error";

export interface GraphNodeProgress {
  node: string;
  status: StreamNodeStatus;
}

export interface StreamEvent {
  type: "node_complete" | "done" | "error" | "ping";
  node?: string;
  run_id?: string;
  message?: string;
}

// Ordered graph nodes for display (must match LangGraph pipeline order in graph.py)
export const GRAPH_NODES = [
  "init_state",
  "plan_next_action",
  "execute_tool_action",
  "compute_scores",
  "retrieve_rag_context",   // ← was missing
  "synthesize_evidence",
  "emit_signals",
  "check_user_alerts",      // ← new node (Task 3)
  "post_alerts",
  "post_candidates",
  "assemble_report_json",
  "assemble_markdown",
  "post_to_n8n",
  "persist_report",
  "persist_snapshot",
];

export function useStreamRun() {
  const queryClient = useQueryClient();
  const [nodeProgress, setNodeProgress] = useState<GraphNodeProgress[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const startStream = useCallback(
    async (opts: { skipSynthesis?: boolean; tickers?: string[] } = {}) => {
      setIsStreaming(true);
      setStreamError(null);
      setNodeProgress(GRAPH_NODES.map((n) => ({ node: n, status: "pending" })));

      try {
        const res = await fetch(`${API_BASE}/run-analysis-stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skip_synthesis: opts.skipSynthesis ?? true,
            tickers: opts.tickers ?? null,
            no_post: false,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Mark first node as running
        setNodeProgress((prev) =>
          prev.map((n, i) => (i === 0 ? { ...n, status: "running" } : n))
        );

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(raw) as StreamEvent;
            } catch {
              continue;
            }

            if (event.type === "node_complete" && event.node) {
              setNodeProgress((prev) => {
                const idx = prev.findIndex((n) => n.node === event.node);
                const nextIdx = idx + 1;
                return prev.map((n, i) => {
                  if (i === idx) return { ...n, status: "completed" };
                  if (i === nextIdx) return { ...n, status: "running" };
                  return n;
                });
              });
            } else if (event.type === "done") {
              setNodeProgress((prev) => prev.map((n) => ({ ...n, status: "completed" })));
              queryClient.invalidateQueries({ queryKey: ["latest-report"] });
              queryClient.invalidateQueries({ queryKey: ["run-history"] });
              queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["personalized-signals"] });
            } else if (event.type === "error") {
              setStreamError(event.message ?? "Unknown error");
              setNodeProgress((prev) =>
                prev.map((n) => (n.status === "running" ? { ...n, status: "error" } : n))
              );
            }
          }
        }
      } catch (err) {
        setStreamError(err instanceof Error ? err.message : "Streaming failed");
      } finally {
        setIsStreaming(false);
      }
    },
    [queryClient]
  );

  return { startStream, nodeProgress, isStreaming, streamError };
}

// ── Run history ────────────────────────────────────────────────────────────

export interface RunHistoryItem {
  run_id: string;
  run_date: string;
  timestamp: string;
  scope: string;
  error_count: number;
  failed_tickers: string[];
  signal_count: number;
}

async function fetchRunHistory(): Promise<RunHistoryItem[]> {
  const res = await fetch(`${API_BASE}/run-history?limit=10`);
  if (!res.ok) throw new Error(`Failed to fetch run history: ${res.status}`);
  return res.json() as Promise<RunHistoryItem[]>;
}

export function useRunHistory() {
  return useQuery<RunHistoryItem[], Error>({
    queryKey: ["run-history"],
    queryFn: fetchRunHistory,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ── v2 interfaces ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ── Market status ──────────────────────────────────────────────────────────

export interface MarketStatus {
  status: "OPEN" | "CLOSED";
  last_update: string;
}

// ── Real-time quotes ───────────────────────────────────────────────────────

export interface Quote {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  mkt_cap: number | null;
  error?: string;
}

// ── Chart data ────────────────────────────────────────────────────────────

export interface StockChart {
  ticker: string;
  range: string;
  timestamps: Array<number | string>;
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

// ── Snapshot (key fundamentals) ───────────────────────────────────────────

export interface StockSnapshot {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  week_52_high: number | null;
  week_52_low: number | null;
  day_high: number | null;
  day_low: number | null;
  volume: number | null;
  avg_volume: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  market_cap: number | null;
  dividend_yield: number | null;
  beta: number | null;
  description: string | null;
}

// ── News ───────────────────────────────────────────────────────────────────

export interface StockNewsItem {
  headline: string;
  source: string;
  url: string | null;
  sentiment: "positive" | "negative" | "neutral" | null;
  datetime: number | null; // Unix timestamp (seconds)
}

// ── AI view ───────────────────────────────────────────────────────────────

export interface StockAIView {
  ticker: string;
  summary: string;
  generated_at: string;
}

// ── Top movers ────────────────────────────────────────────────────────────

export interface TopMover {
  ticker: string;
  name: string;
  price: number;
  change: number;
  change_pct: number;
}

// ── Ticker search ─────────────────────────────────────────────────────────

export interface TickerSearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

// ── User-defined price alerts ─────────────────────────────────────────────

export interface Alert {
  id: string;
  user_id: string;
  ticker: string;
  condition: "price_above" | "price_below" | "daily_move";
  value: number;
  status: "active" | "triggered" | "disabled";
  created_at: string;
  last_triggered_at: string | null;
}

export interface CreateAlertPayload {
  ticker: string;
  condition: Alert["condition"];
  value: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── v2 React Query hooks ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ── Market status ──────────────────────────────────────────────────────────

export function useMarketStatus() {
  return useQuery<MarketStatus, Error>({
    queryKey: ["market-status"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/market/status`);
      if (!res.ok) throw new Error(`market/status: ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: false,
  });
}

// ── Watchlist (from backend) ───────────────────────────────────────────────

export function useWatchlist(userId: string | undefined) {
  return useQuery<string[], Error>({
    queryKey: ["watchlist", userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/user/${userId}/watchlist`);
      if (!res.ok) throw new Error(`watchlist: ${res.status}`);
      const payload: unknown = await res.json();
      if (Array.isArray(payload)) return payload as string[];
      if (
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { tickers?: unknown }).tickers)
      ) {
        return (payload as { tickers: string[] }).tickers;
      }
      return [];
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}

export function useSetWatchlist(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string[]>({
    mutationFn: async (tickers) => {
      const res = await fetch(`${API_BASE}/user/${userId}/watchlist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) throw new Error(`set watchlist: ${res.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist", userId] });
    },
  });
}

// ── Real-time quotes ───────────────────────────────────────────────────────

export function useMarketQuotes(tickers: string[]) {
  return useQuery<Quote[], Error>({
    queryKey: ["market-quotes", tickers.join(",")],
    queryFn: async () => {
      if (!tickers.length) return [];
      const params = `tickers=${encodeURIComponent(tickers.join(","))}`;
      const res = await fetch(`${API_BASE}/market/quotes?${params}`);
      if (!res.ok) throw new Error(`market/quotes: ${res.status}`);
      const payload: unknown = await res.json();
      if (Array.isArray(payload)) return payload as Quote[];
      if (payload && typeof payload === "object") {
        return Object.entries(payload as Record<string, unknown>).map(([ticker, value]) => {
          const q = (value && typeof value === "object" ? value : {}) as Partial<Quote>;
          return { ticker, price: 0, change: 0, change_pct: 0, volume: 0, mkt_cap: null, ...q };
        });
      }
      return [];
    },
    enabled: tickers.length > 0,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
}

// ── Top movers ────────────────────────────────────────────────────────────

export function useTopMovers(tickers: string[]) {
  return useQuery<TopMover[], Error>({
    queryKey: ["top-movers", tickers.join(",")],
    queryFn: async () => {
      if (!tickers.length) return [];
      const params = `tickers=${encodeURIComponent(tickers.join(","))}`;
      const res = await fetch(`${API_BASE}/market/top-movers?${params}`);
      if (!res.ok) throw new Error(`market/top-movers: ${res.status}`);
      const payload: unknown = await res.json();

      if (Array.isArray(payload)) return payload as TopMover[];

      if (payload && typeof payload === "object") {
        const p = payload as { gainers?: unknown; losers?: unknown };
        const gainers = Array.isArray(p.gainers) ? (p.gainers as TopMover[]) : [];
        const losers = Array.isArray(p.losers) ? (p.losers as TopMover[]) : [];
        const merged = [...gainers, ...losers];
        return Array.from(new Map(merged.map((m) => [m.ticker, m])).values());
      }

      return [];
    },
    enabled: tickers.length > 0,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
}

// ── Stock chart ───────────────────────────────────────────────────────────

export function useStockChart(ticker: string | undefined, range = "1mo") {
  return useQuery<StockChart, Error>({
    queryKey: ["stock-chart", ticker, range],
    queryFn: async () => {
      const rangeMap: Record<string, string> = {
        "1d": "1D",
        "5d": "5D",
        "1mo": "1M",
        "3mo": "3M",
        "6mo": "6M",
        "1y": "1Y",
      };
      const normalizedRange = rangeMap[range.toLowerCase()] ?? "1M";
      const res = await fetch(
        `${API_BASE}/market/chart/${ticker}?range=${normalizedRange}`
      );
      if (!res.ok) throw new Error(`chart: ${res.status}`);
      return res.json();
    },
    enabled: Boolean(ticker),
    staleTime: 5 * 60_000,
  });
}

// ── Stock snapshot ─────────────────────────────────────────────────────────

export function useStockSnapshot(ticker: string | undefined) {
  return useQuery<StockSnapshot, Error>({
    queryKey: ["stock-snapshot", ticker],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/market/snapshot/${ticker}`);
      if (!res.ok) throw new Error(`snapshot: ${res.status}`);
      return res.json();
    },
    enabled: Boolean(ticker),
    staleTime: 10 * 60_000,
  });
}

// ── Stock news ────────────────────────────────────────────────────────────

export function useStockNews(ticker: string | undefined, limit = 10) {
  return useQuery<StockNewsItem[], Error>({
    queryKey: ["stock-news", ticker, limit],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/market/news/${ticker}?limit=${limit}`
      );
      if (!res.ok) throw new Error(`news: ${res.status}`);
      const payload: unknown = await res.json();

      if (Array.isArray(payload)) return payload as StockNewsItem[];

      if (
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { articles?: unknown }).articles)
      ) {
        return (payload as { articles: StockNewsItem[] }).articles;
      }

      return [];
    },
    enabled: Boolean(ticker),
    staleTime: 15 * 60_000,
  });
}

// ── Stock AI view ─────────────────────────────────────────────────────────

export function useStockAIView(ticker: string | undefined) {
  return useQuery<StockAIView, Error>({
    queryKey: ["stock-ai-view", ticker],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/market/ai-view/${ticker}`);
      if (!res.ok) throw new Error(`ai-view: ${res.status}`);
      return res.json();
    },
    enabled: Boolean(ticker),
    staleTime: 60 * 60_000, // 1 h — AI summary changes infrequently
  });
}

// ── Ticker search ─────────────────────────────────────────────────────────

export function useTickerSearch(query: string) {
  return useQuery<TickerSearchResult[], Error>({
    queryKey: ["ticker-search", query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await fetch(
        `${API_BASE}/market/search?q=${encodeURIComponent(query)}&limit=8`
      );
      if (!res.ok) throw new Error(`search: ${res.status}`);
      return res.json();
    },
    // Local static list covers 1-char queries instantly — API kicks in at 2+ chars
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}

// ── User alerts ───────────────────────────────────────────────────────────

export function useAlerts(userId: string | undefined) {
  return useQuery<Alert[], Error>({
    queryKey: ["alerts", userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/user/${userId}/alerts`);
      if (!res.ok) throw new Error(`alerts: ${res.status}`);
      return res.json();
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCreateAlert(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<Alert, Error, CreateAlertPayload>({
    mutationFn: async (payload) => {
      const res = await fetch(`${API_BASE}/user/${userId}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`create alert failed (${res.status}): ${text.slice(0, 120)}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts", userId] });
    },
  });
}

export function useUpdateAlert(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<Alert, Error, Partial<Alert> & { id: string }>({
    mutationFn: async ({ id, ...updates }) => {
      const res = await fetch(`${API_BASE}/user/${userId}/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`update alert: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts", userId] });
    },
  });
}

export function useDeleteAlert(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (alertId) => {
      const res = await fetch(`${API_BASE}/user/${userId}/alerts/${alertId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`delete alert: ${res.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts", userId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ── v3 Personalization interfaces & hooks ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export interface PersonalizedSignal {
  signal_id: string;
  ticker: string;
  signal_type: string;
  direction: string;
  severity: string;
  narrative: string | null;
  confidence: number;
  watchlist_relevance: number;
  profile_fit_score: number;
  risk_mismatch_penalty: number;
  bucket: "in_watchlist" | "discovery";
  action_frame: string;
  urgency: "High" | "Medium" | "Low";
  catalyst_window: string | null;
  risk_flags: string[];
  fit_score: number;
}

export interface UserReportBundle {
  user_id: string;
  run_id: string;
  run_date: string;
  generated_at: string;
  // Portfolio Pulse
  watchlist_performance: Record<string, { "1d": number | null; "1w": number | null; "1m": number | null }>;
  market_regime: "Risk-On" | "Neutral" | "Risk-Off";
  risk_alignment: "Aligned" | "Caution" | "Off-Profile";
  // Signal buckets
  watchlist_signals: PersonalizedSignal[];
  discovery_signals: PersonalizedSignal[];
  top_conviction: PersonalizedSignal[];
  // Profile mismatch
  mismatch_alerts: Array<{ ticker: string; issue: string; recommendation: string }>;
}

export function useDashboard(userId: string | undefined) {
  return useQuery<UserReportBundle, Error>({
    queryKey: ["dashboard", userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/user/${userId}/dashboard`);
      if (!res.ok) throw new Error(`dashboard: ${res.status}`);
      return res.json() as Promise<UserReportBundle>;
    },
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,   // 5 minutes — bundles update per analysis run
    retry: false,             // 404 (no bundle yet) should not be retried
  });
}

export function usePersonalizedSignals(userId: string | undefined) {
  return useQuery<Pick<UserReportBundle, "watchlist_signals" | "discovery_signals">, Error>({
    queryKey: ["personalized-signals", userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/user/${userId}/personalized-signals`);
      if (!res.ok) throw new Error(`personalized-signals: ${res.status}`);
      return res.json();
    },
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
