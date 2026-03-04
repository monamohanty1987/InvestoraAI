import { CheckCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import type { DataSourceItem } from "@/lib/report";
import type { GraphNodeProgress } from "@/lib/report";

const NODE_LABELS: Record<string, string> = {
  init_state: "Init",
  plan_next_action: "Planner",
  execute_tool_action: "Fetch Data",
  compute_scores: "Scoring",
  synthesize_evidence: "LLM Synthesis",
  emit_signals: "Emit Signals",
  post_alerts: "Alert Webhook",
  post_candidates: "Candidates",
  assemble_report_json: "Build Report",
  assemble_markdown: "Markdown",
  post_to_n8n: "n8n Post",
  persist_report: "Save Report",
  persist_snapshot: "Save DB",
};

const fallbackNodes = [
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
  completed: { icon: CheckCircle, color: "text-positive", bg: "bg-positive/10" },
};

interface WorkflowStatusProps {
  dataSources?: DataSourceItem[];
  graphProgress?: GraphNodeProgress[];
}

export function WorkflowStatus({ dataSources, graphProgress }: WorkflowStatusProps) {
  // Live streaming mode — show graph node progress
  if (graphProgress && graphProgress.length > 0) {
    const completedCount = graphProgress.filter((n) => n.status === "completed").length;
    return (
      <div className="bg-card border border-border/50 rounded-lg p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-mono text-sm text-muted-foreground">Live Run Progress</h3>
          <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
            {completedCount}/{graphProgress.length} Steps
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {graphProgress.map((node, i) => {
            const config = statusConfig[node.status as keyof typeof statusConfig] ?? statusConfig.pending;
            const Icon = config.icon;
            const label = NODE_LABELS[node.node] ?? node.node;
            return (
              <motion.div
                key={node.node}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className={`${config.bg} rounded-md p-2.5 border border-border/30`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon
                    className={`w-3 h-3 ${config.color} ${node.status === "running" ? "animate-spin" : ""}`}
                  />
                  <span className="text-xs font-mono text-foreground truncate">{label}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground capitalize">{node.status}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  // Static mode — data sources or fallback
  const displayNodes =
    dataSources && dataSources.length > 0
      ? dataSources.map((ds) => ({ name: ds.name, status: "success", lastRun: "This week" }))
      : fallbackNodes;

  const activeCount = dataSources ? dataSources.length : displayNodes.filter((n) => n.status === "success").length;

  return (
    <div className="bg-card border border-border/50 rounded-lg p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-sm text-muted-foreground">
          {dataSources ? "Data Sources" : "n8n Workflow Nodes"}
        </h3>
        <span className="text-xs font-mono text-positive bg-positive/10 px-2 py-0.5 rounded">
          {activeCount}/{displayNodes.length} Active
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {displayNodes.map((node, i) => {
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
