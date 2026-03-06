import { motion } from "framer-motion";
import { Bell, TrendingUp, TrendingDown, AlertTriangle, ExternalLink } from "lucide-react";

interface Alert {
  id: number;
  type: "opportunity" | "risk" | "warning";
  title: string;
  ticker: string;
  sentiment: number;
  time: string;
  delivered: boolean;
}

const mockAlerts: Alert[] = [
  { id: 1, type: "opportunity", title: "Apple beats Q4 estimates — strong buy signal", ticker: "AAPL", sentiment: 0.78, time: "3 min ago", delivered: true },
  { id: 2, type: "opportunity", title: "Fed rate cut signals boost tech sector outlook", ticker: "QQQ", sentiment: 0.65, time: "8 min ago", delivered: true },
  { id: 3, type: "risk", title: "Tesla production delays may impact Q1 delivery numbers", ticker: "TSLA", sentiment: -0.54, time: "12 min ago", delivered: true },
  { id: 4, type: "opportunity", title: "Microsoft Azure revenue surge exceeds forecasts", ticker: "MSFT", sentiment: 0.71, time: "18 min ago", delivered: true },
  { id: 5, type: "risk", title: "Crypto liquidations hit $2B — high volatility warning", ticker: "BTC", sentiment: -0.68, time: "32 min ago", delivered: true },
  { id: 6, type: "warning", title: "Oil market uncertainty — monitor Middle East developments", ticker: "USO", sentiment: 0.05, time: "25 min ago", delivered: false },
];

const typeConfig = {
  opportunity: { icon: TrendingUp, color: "text-positive", bg: "bg-positive/10", border: "border-positive/20" },
  risk: { icon: TrendingDown, color: "text-negative", bg: "bg-negative/10", border: "border-negative/20" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
};

export function AlertsPanel() {
  return (
    <div className="space-y-3">
      {mockAlerts.map((alert, i) => {
        const config = typeConfig[alert.type];
        const Icon = config.icon;
        return (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`bg-card border ${config.border} rounded-lg p-4`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`${config.bg} rounded-md p-1.5 mt-0.5`}>
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">{alert.ticker}</span>
                  </div>
                  <p className="text-sm text-foreground">{alert.title}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs font-mono text-muted-foreground">{alert.time}</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      via Telegram {alert.delivered ? "✓" : "pending"}
                    </span>
                  </div>
                </div>
              </div>
              <span className={`text-sm font-mono font-bold ${alert.sentiment > 0 ? "text-positive" : "text-negative"}`}>
                {alert.sentiment > 0 ? "+" : ""}{alert.sentiment.toFixed(2)}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
