import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useStockChart } from "@/lib/report";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const RANGES = [
  { label: "1D", value: "1d" },
  { label: "1W", value: "5d" },
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
] as const;

type Range = (typeof RANGES)[number]["value"];

interface Props {
  ticker: string;
}

interface ChartPoint {
  time: string;
  close: number;
  open: number;
  high: number;
  low: number;
}

function formatTime(ts: number | string, range: Range): string {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  if (range === "1d") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "5d") {
    return d.toLocaleDateString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartPoint;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono shadow-lg space-y-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-foreground font-semibold">
        ${d.close.toFixed(2)}
      </div>
      <div className="text-muted-foreground/70">
        H: ${d.high.toFixed(2)} · L: ${d.low.toFixed(2)}
      </div>
    </div>
  );
}

export function PriceChart({ ticker }: Props) {
  const [range, setRange] = useState<Range>("1mo");
  const { data, isLoading } = useStockChart(ticker, range);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    return data.timestamps.map((ts, i) => ({
      time: formatTime(ts, range),
      close: data.closes[i],
      open: data.opens[i],
      high: data.highs[i],
      low: data.lows[i],
    }));
  }, [data, range]);

  const isUp = chartData.length >= 2 && chartData[chartData.length - 1].close >= chartData[0].close;
  const strokeColor = isUp ? "#22c55e" : "#f87171";
  const gradientId = `chart-fill-${ticker}`;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{ticker} Price Chart</CardTitle>
        {/* Range selector */}
        <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                "px-2 py-0.5 rounded text-xs font-mono font-medium transition-colors",
                range === r.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-4">
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">
            No chart data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="close"
                stroke={strokeColor}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
