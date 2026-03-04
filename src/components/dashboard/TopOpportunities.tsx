import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { TopOpportunity } from "@/lib/report";

interface TopOpportunitiesProps {
  opportunities: TopOpportunity[];
}

const qualityColors: Record<string, string> = {
  Strong: "text-positive",
  Good: "text-primary",
  Solid: "text-warning",
  Weak: "text-muted-foreground",
};

const momentumColors: Record<string, string> = {
  Strong: "text-positive",
  Positive: "text-primary",
  Neutral: "text-warning",
  Negative: "text-negative",
};

const rankBadgeClass: Record<number, string> = {
  1: "bg-warning/20 text-warning border-warning/30",
};

export function TopOpportunities({ opportunities }: TopOpportunitiesProps) {
  if (!opportunities.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-sm text-muted-foreground">Top Opportunities</h3>
      {opportunities.map((opp, i) => {
        const dir = opp.weekly_change.direction;
        const ChangeIcon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
        const changeColor =
          dir === "up" ? "text-positive" : dir === "down" ? "text-negative" : "text-muted-foreground";

        return (
          <motion.div
            key={opp.company.ticker}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-lg p-4 hover:border-glow transition-all"
          >
            <div className="flex items-center justify-between gap-4">
              {/* Rank + Company */}
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded border text-[11px] font-mono font-bold shrink-0 ${
                    rankBadgeClass[opp.rank] ?? rankBadgeClass[3]
                  }`}
                >
                  {opp.rank}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-foreground">
                      {opp.company.ticker}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {opp.company.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      Q:{" "}
                      <span className={qualityColors[opp.quality.rating] ?? "text-muted-foreground"}>
                        {opp.quality.rating}
                      </span>{" "}
                      {opp.quality.score.toFixed(1)}
                    </span>
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      M:{" "}
                      <span className={momentumColors[opp.momentum.rating] ?? "text-muted-foreground"}>
                        {opp.momentum.rating}
                      </span>{" "}
                      {opp.momentum.score.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Score + Weekly change */}
              <div className="flex flex-col items-end shrink-0 gap-1">
                <span className="font-mono font-bold text-lg text-primary">
                  {opp.score.toFixed(1)}
                </span>
                <div className={`flex items-center gap-1 ${changeColor}`}>
                  <ChangeIcon className="w-3 h-3" />
                  <span className="text-xs font-mono">
                    {opp.weekly_change.value !== null
                      ? `${opp.weekly_change.value > 0 ? "+" : ""}${opp.weekly_change.value.toFixed(1)}`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
