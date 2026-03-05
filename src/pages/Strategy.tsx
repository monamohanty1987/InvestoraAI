import { TrendingUp, BarChart2 } from "lucide-react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Label,
} from "recharts";
import { MarketStatusBar } from "@/components/MarketStatusBar";
import { useLatestReport } from "@/lib/report";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

// ── Shared styles ──────────────────────────────────────────────────────────

const MONO = "JetBrains Mono, ui-monospace, monospace";

const TICK_STYLE = {
  fontSize: 11,
  fontFamily: MONO,
  fill: "hsl(215, 15%, 55%)",
};

// ── Signal classification (0-100 scale per dimension, 0-200 combined) ─────

type SignalTier = { label: "Strong" | "Moderate" | "Weak"; cls: string };

function getSignal(quality100: number, momentum100: number): SignalTier {
  const combined = quality100 + momentum100;
  if (combined >= 150) return { label: "Strong",   cls: "text-green-400" };
  if (combined >= 110) return { label: "Moderate", cls: "text-amber-400" };
  return                      { label: "Weak",     cls: "text-red-400" };
}

// ── Dot color — interpolates green (high momentum) → cyan → muted (low) ───

function dotColor(momentum100: number): string {
  if (momentum100 >= 70) return "hsl(160, 100%, 50%)";   // bright green
  if (momentum100 >= 45) return "hsl(175, 90%, 48%)";    // teal
  if (momentum100 >= 25) return "hsl(190, 100%, 50%)";   // cyan
  return "hsl(215, 20%, 50%)";                            // muted gray-blue
}

// ── Scatter dot — just a circle, no label (tooltip shows on hover) ─────────

function ScatterDot(props: {
  cx?: number;
  cy?: number;
  payload?: { ticker: string; quality: number; momentum: number };
}) {
  const { cx = 0, cy = 0, payload } = props;
  const color = dotColor(payload?.momentum ?? 0);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={7}
      fill={color}
      fillOpacity={0.85}
      stroke={color}
      strokeWidth={1}
      strokeOpacity={0.4}
    />
  );
}

// ── Thin progress bar ──────────────────────────────────────────────────────

function ProgressBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-[5px] rounded-full bg-muted/40 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-xs text-foreground w-7 shrink-0 text-right">
        {Math.round(value)}
      </span>
    </div>
  );
}

// ── Strategy page ──────────────────────────────────────────────────────────

export default function Strategy() {
  const { data: report, isLoading } = useLatestReport();

  const opportunities = report?.top_opportunities ?? [];

  // Scale scores from 0-10 → 0-100 for display
  const scatterData = opportunities.map((o) => ({
    ticker:   o.company.ticker,
    name:     o.company.name,
    quality:  Math.round(o.quality.score * 10),
    momentum: Math.round(o.momentum.score * 10),
  }));

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <MarketStatusBar />

      {/* Page header */}
      <header className="px-6 py-4 border-b border-border/50 flex items-center gap-3 sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
        <TrendingUp className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Strategy Breakdown</h1>
          <p className="text-xs text-muted-foreground">
            Quality vs Momentum analysis of your watchlist
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-6 py-5 space-y-5 max-w-[1200px] mx-auto w-full">

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[420px] w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        ) : !report || opportunities.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <TrendingUp className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">
              No strategy data available. Run an analysis from the{" "}
              <Link to="/" className="text-primary hover:underline">Dashboard</Link> first.
            </p>
          </div>
        ) : (
          <>
            {/* ── Scatter plot ── */}
            <Card className="bg-card border-border">
              {/* Header row */}
              <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-border/50">
                <BarChart2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-mono text-xs font-semibold tracking-widest text-foreground uppercase">
                  Quality × Momentum Map
                </span>
              </div>

              <CardContent className="px-4 pb-4 pt-4">
                <ResponsiveContainer width="100%" height={360}>
                  <ScatterChart margin={{ top: 15, right: 30, bottom: 40, left: 20 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(220, 15%, 13%)"
                      strokeOpacity={0.8}
                    />
                    <XAxis
                      type="number"
                      dataKey="quality"
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={TICK_STYLE}
                    >
                      <Label
                        value="Quality Score"
                        offset={-18}
                        position="insideBottom"
                        style={{ ...TICK_STYLE }}
                      />
                    </XAxis>
                    <YAxis
                      type="number"
                      dataKey="momentum"
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={TICK_STYLE}
                    >
                      <Label
                        value="Momentum Score"
                        angle={-90}
                        position="insideLeft"
                        offset={12}
                        style={{ ...TICK_STYLE }}
                      />
                    </YAxis>
                    <RechartsTooltip
                      cursor={{ strokeDasharray: "3 3", stroke: "hsl(220, 15%, 28%)" }}
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload as (typeof scatterData)[0];
                        const sig = getSignal(d.quality, d.momentum);
                        return (
                          <div
                            className="px-3 py-2 rounded-lg border border-border shadow-xl"
                            style={{
                              background: "hsl(220, 20%, 10%)",
                              fontFamily: MONO,
                              fontSize: 11,
                              color: "hsl(210, 20%, 92%)",
                            }}
                          >
                            <p className="font-semibold mb-1">{d.ticker}</p>
                            <p className="text-muted-foreground">{d.name}</p>
                            <div className="mt-1.5 space-y-0.5">
                              <p>Quality:  <span className="text-green-400">{d.quality}</span></p>
                              <p>Momentum: <span className="text-cyan-400">{d.momentum}</span></p>
                              <p>Signal:   <span className={sig.cls}>{sig.label}</span></p>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={scatterData} shape={<ScatterDot />} />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* ── Score table ── */}
            <Card className="bg-card border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70">
                      {["Ticker", "Quality", "Momentum", "Combined", "Signal"].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {opportunities
                      .slice()
                      .sort((a, b) => b.score - a.score)
                      .map((o) => {
                        const q100 = Math.round(o.quality.score * 10);
                        const m100 = Math.round(o.momentum.score * 10);
                        const combined = q100 + m100;
                        const sig = getSignal(q100, m100);
                        return (
                          <tr
                            key={o.company.ticker}
                            className="hover:bg-muted/20 transition-colors"
                          >
                            {/* Ticker */}
                            <td className="px-5 py-3.5">
                              <Link
                                to={`/stock/${o.company.ticker}`}
                                className="font-mono font-bold text-foreground hover:text-primary transition-colors"
                              >
                                {o.company.ticker}
                              </Link>
                            </td>

                            {/* Quality */}
                            <td className="px-5 py-3.5 min-w-[180px]">
                              <ProgressBar value={q100} color="hsl(160, 100%, 50%)" />
                            </td>

                            {/* Momentum */}
                            <td className="px-5 py-3.5 min-w-[180px]">
                              <ProgressBar value={m100} color="hsl(190, 100%, 50%)" />
                            </td>

                            {/* Combined */}
                            <td className="px-5 py-3.5">
                              <span className="font-mono text-foreground font-semibold">
                                {combined}
                              </span>
                            </td>

                            {/* Signal — plain colored text, no badge */}
                            <td className="px-5 py-3.5">
                              <span className={cn("font-semibold", sig.cls)}>
                                {sig.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
