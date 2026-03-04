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

// Ordered graph nodes for display
export const GRAPH_NODES = [
  "init_state",
  "plan_next_action",
  "execute_tool_action",
  "compute_scores",
  "synthesize_evidence",
  "emit_signals",
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
            skip_synthesis: opts.skipSynthesis ?? false,
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
