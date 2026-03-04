import { TrendingUp, TrendingDown, Newspaper, Bell, Activity, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

interface StatsBarProps {
  weeklyChangePct?: number;
  opportunityCount?: number;
  errorCount?: number;
  runTimestamp?: string;
}

export function StatsBar({ weeklyChangePct, opportunityCount, errorCount, runTimestamp }: StatsBarProps) {
  const lastRunLabel = runTimestamp
    ? new Date(runTimestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "never";

  const stats = [
    { label: "Articles Processed", value: "1,284", change: "+12%", positive: true, icon: Newspaper },
    { label: "Alerts Sent", value: "47", change: "+5", positive: true, icon: Bell },
    {
      label: "Opportunities",
      value: opportunityCount !== undefined ? String(opportunityCount) : "23",
      change: "+3",
      positive: true,
      icon: TrendingUp,
    },
    {
      label: "Run Errors",
      value: errorCount !== undefined ? String(errorCount) : "—",
      change: errorCount === 0 ? "all clear" : errorCount !== undefined ? "last run" : "—",
      positive: errorCount === 0 || errorCount === undefined,
      icon: TrendingDown,
    },
    {
      label: "Weekly Change",
      value:
        weeklyChangePct !== undefined
          ? `${weeklyChangePct >= 0 ? "+" : ""}${weeklyChangePct.toFixed(1)}%`
          : "0.32",
      change: weeklyChangePct !== undefined ? "from report" : "+0.05",
      positive: weeklyChangePct !== undefined ? weeklyChangePct >= 0 : true,
      icon: BarChart3,
    },
    { label: "Last Run", value: lastRunLabel, change: "timestamp", positive: true, icon: Activity },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="bg-card border border-border/50 rounded-lg p-3 hover:border-glow transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <stat.icon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground truncate">{stat.label}</span>
          </div>
          <div className="font-mono font-bold text-lg text-foreground">{stat.value}</div>
          <div className={`text-xs font-mono mt-1 ${stat.positive ? "text-positive" : "text-negative"}`}>
            {stat.change}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
