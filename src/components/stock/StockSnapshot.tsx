import { useStockSnapshot } from "@/lib/report";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface Props {
  ticker: string;
}

function fmt(n: number | null, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtBig(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function StockSnapshot({ ticker }: Props) {
  const { data, isLoading } = useStockSnapshot(ticker);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Key Metrics</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">No data available</p>
        ) : (
          <>
            {/* Company info */}
            <div className="mb-4 space-y-1">
              <p className="font-semibold text-foreground">{data.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {data.sector && (
                  <Badge variant="outline" className="text-xs">
                    {data.sector}
                  </Badge>
                )}
                {data.industry && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {data.industry}
                  </Badge>
                )}
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <Metric label="52W High" value={`$${fmt(data.week_52_high)}`} />
              <Metric label="52W Low" value={`$${fmt(data.week_52_low)}`} />
              <Metric label="Day High" value={`$${fmt(data.day_high)}`} />
              <Metric label="Day Low" value={`$${fmt(data.day_low)}`} />
              <Metric label="Volume" value={fmtBig(data.volume)} />
              <Metric label="Avg Volume" value={fmtBig(data.avg_volume)} />
              <Metric label="Market Cap" value={fmtBig(data.market_cap)} />
              <Metric label="P/E Ratio" value={fmt(data.pe_ratio)} />
              <Metric label="Fwd P/E" value={fmt(data.forward_pe)} />
              <Metric label="Div Yield" value={fmtPct(data.dividend_yield)} />
              <Metric label="Beta" value={fmt(data.beta)} />
            </div>

            {/* Description */}
            {data.description && (
              <p className="mt-4 text-xs text-muted-foreground leading-relaxed line-clamp-4">
                {data.description}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
