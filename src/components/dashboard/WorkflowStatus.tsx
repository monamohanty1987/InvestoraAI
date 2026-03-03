import { CheckCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

const nodes = [
  { name: "News API Fetch", status: "running", lastRun: "2 min ago" },
  { name: "Alpha Vantage", status: "success", lastRun: "2 min ago" },
  { name: "Finnhub Market", status: "success", lastRun: "2 min ago" },
  { name: "LangChain ReAct", status: "running", lastRun: "1 min ago" },
  { name: "Pinecone RAG", status: "success", lastRun: "1 min ago" },
  { name: "Telegram Alert", status: "success", lastRun: "1 min ago" },
  { name: "Notion Save", status: "success", lastRun: "1 min ago" },
  { name: "Weekly Report", status: "pending", lastRun: "3 days ago" },
];

const statusConfig = {
  success: { icon: CheckCircle, color: "text-positive", bg: "bg-positive/10" },
  running: { icon: RefreshCw, color: "text-primary", bg: "bg-primary/10" },
  error: { icon: AlertTriangle, color: "text-negative", bg: "bg-negative/10" },
  pending: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
};

export function WorkflowStatus() {
  return (
    <div className="bg-card border border-border/50 rounded-lg p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-sm text-muted-foreground">n8n Workflow Nodes</h3>
        <span className="text-xs font-mono text-positive bg-positive/10 px-2 py-0.5 rounded">
          7/8 Active
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {nodes.map((node, i) => {
          const config = statusConfig[node.status as keyof typeof statusConfig];
          const Icon = config.icon;
          return (
            <motion.div
              key={node.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              className={`${config.bg} rounded-md p-2.5 border border-border/30`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`w-3 h-3 ${config.color} ${node.status === "running" ? "animate-spin" : ""}`} />
                <span className="text-xs font-mono text-foreground truncate">{node.name}</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">{node.lastRun}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
