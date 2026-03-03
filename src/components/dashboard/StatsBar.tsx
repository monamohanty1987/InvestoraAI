import { TrendingUp, TrendingDown, Newspaper, Bell, Activity, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

const stats = [
  { label: "Articles Processed", value: "1,284", change: "+12%", positive: true, icon: Newspaper },
  { label: "Alerts Sent", value: "47", change: "+5", positive: true, icon: Bell },
  { label: "Opportunities", value: "23", change: "+3", positive: true, icon: TrendingUp },
  { label: "Risk Alerts", value: "18", change: "-2", positive: false, icon: TrendingDown },
  { label: "Avg Sentiment", value: "0.32", change: "+0.05", positive: true, icon: BarChart3 },
  { label: "Uptime", value: "99.8%", change: "stable", positive: true, icon: Activity },
];

export function StatsBar() {
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
