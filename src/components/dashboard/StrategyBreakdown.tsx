import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";
import { Info } from "lucide-react";
import type { StrategyItem } from "@/lib/report";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StrategyBreakdownProps {
  breakdown: {
    quality: StrategyItem[];
    momentum: StrategyItem[];
  };
}

// Rating -> bar fill colour using inline HSL values (Tailwind classes don't apply inside SVG)
const qualityFill: Record<string, string> = {
  Strong: "hsl(160, 100%, 50%)",
  Good: "hsl(190, 100%, 50%)",
  Solid: "hsl(38, 92%, 55%)",
  Weak: "hsl(215, 15%, 55%)",
};

const momentumFill: Record<string, string> = {
  Strong: "hsl(160, 100%, 50%)",
  Positive: "hsl(190, 100%, 50%)",
  Neutral: "hsl(38, 92%, 55%)",
  Negative: "hsl(0, 72%, 55%)",
};

const tickStyle = {
  fontSize: 11,
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
  fill: "hsl(215, 15%, 55%)",
};

const tooltipStyle = {
  background: "hsl(220, 20%, 10%)",
  border: "1px solid hsl(220, 15%, 18%)",
  borderRadius: "0.5rem",
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
  fontSize: "11px",
  color: "hsl(210, 20%, 92%)",
};

function MiniBarChart({
  data,
  fillMap,
  title,
  helpText,
}: {
  data: StrategyItem[];
  fillMap: Record<string, string>;
  title: string;
  helpText: string;
}) {
  return (
    <div className="bg-card border border-border/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="font-mono text-xs text-muted-foreground">{title}</h4>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/80 hover:text-primary transition-colors"
                aria-label={`About ${title}`}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs font-mono leading-relaxed">
              {helpText}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ResponsiveContainer width="100%" height={data.length * 30}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
          barSize={7}
          barCategoryGap="22%"
        >
          <XAxis
            type="number"
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            tick={tickStyle}
          />
          <YAxis
            type="category"
            dataKey="company"
            tick={tickStyle}
            width={44}
          />
          <RechartsTooltip
            cursor={{ fill: "hsl(220, 15%, 14%, 0.5)" }}
            contentStyle={tooltipStyle}
            itemStyle={{ color: "hsl(210, 20%, 92%)" }}
            labelStyle={{ color: "hsl(210, 20%, 92%)" }}
            formatter={(_val: number, _name: string, props: { payload: StrategyItem }) => [
              `${props.payload.score.toFixed(1)}/10 (${props.payload.rating})`,
              "Score",
            ]}
          />
          <Bar dataKey="score" radius={[0, 2, 2, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.company}
                fill={fillMap[entry.rating] ?? "hsl(215, 15%, 55%)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StrategyBreakdown({ breakdown }: StrategyBreakdownProps) {
  if (!breakdown.quality.length && !breakdown.momentum.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-sm text-muted-foreground">Strategy Breakdown</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MiniBarChart
          data={breakdown.quality}
          fillMap={qualityFill}
          title="Quality Scores"
          helpText="Quality scores summarize business strength (profitability, balance-sheet health, and growth consistency). Interpret as durability: higher quality names are typically more resilient."
        />
        <MiniBarChart
          data={breakdown.momentum}
          fillMap={momentumFill}
          title="Momentum Scores"
          helpText="Momentum scores reflect recent market direction and trend strength. Interpret as timing signal: stronger momentum suggests current trend support, weaker momentum suggests caution."
        />
      </div>
    </div>
  );
}
