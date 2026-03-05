import { Pause, Play, Trash2, Pencil, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";
import { useAlerts, useUpdateAlert, useDeleteAlert } from "@/lib/report";
import type { Alert } from "@/lib/report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: Alert["status"] }) {
  const cls = cn(
    "text-[10px] font-semibold uppercase tracking-wide",
    status === "active"    && "border-green-500/40 text-green-400 bg-green-500/10",
    status === "triggered" && "border-amber-500/40 text-amber-400 bg-amber-500/10",
    status === "disabled"  && "border-border text-muted-foreground bg-muted/30"
  );
  return (
    <Badge variant="outline" className={cls}>
      {status}
    </Badge>
  );
}

const CONDITION_LABELS: Record<Alert["condition"], string> = {
  price_above: "Price >",
  price_below: "Price <",
  daily_move: "Day move >",
};

function fmtValue(condition: Alert["condition"], value: number): string {
  const isPct = condition === "daily_move";
  return isPct ? `${value.toFixed(1)}%` : `$${value.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AlertsTable() {
  const { user } = useUser();
  const { data: alerts, isLoading } = useAlerts(user?.userId);
  const updateAlert = useUpdateAlert(user?.userId);
  const deleteAlert = useDeleteAlert(user?.userId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTicker, setEditTicker] = useState("");
  const [editCondition, setEditCondition] = useState<Alert["condition"]>("price_above");
  const [editValue, setEditValue] = useState("");

  const handleToggle = async (alert: Alert) => {
    const next = alert.status === "active" ? "disabled" : "active";
    try {
      await updateAlert.mutateAsync({ id: alert.id, status: next });
      toast.success(next === "active" ? "Alert resumed" : "Alert paused");
    } catch {
      toast.error("Failed to update alert");
    }
  };

  const handleDelete = async (id: string, ticker: string) => {
    try {
      await deleteAlert.mutateAsync(id);
      toast.success(`Alert for ${ticker} deleted`);
    } catch {
      toast.error("Failed to delete alert");
    }
  };

  const startEdit = (alert: Alert) => {
    setEditingId(alert.id);
    setEditTicker(alert.ticker);
    setEditCondition(alert.condition);
    setEditValue(String(alert.value));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTicker("");
    setEditValue("");
  };

  const saveEdit = async (alert: Alert) => {
    const value = parseFloat(editValue);
    if (!editTicker.trim()) {
      toast.error("Ticker is required");
      return;
    }
    if (Number.isNaN(value) || value <= 0) {
      toast.error("Value must be a positive number");
      return;
    }
    try {
      await updateAlert.mutateAsync({
        id: alert.id,
        ticker: editTicker.trim().toUpperCase(),
        condition: editCondition,
        value,
      });
      toast.success("Alert updated");
      cancelEdit();
    } catch {
      toast.error("Failed to update alert");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No alerts yet. Create one above to get started.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {["Ticker", "Condition", "Value", "Status", "Created", "Last Triggered", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {alerts.map((alert) => (
              <tr key={alert.id} className="hover:bg-muted/20 transition-colors">
                {editingId === alert.id ? (
                  <>
                    <td className="px-4 py-3">
                      <Input
                        value={editTicker}
                        onChange={(e) => setEditTicker(e.target.value)}
                        className="h-8 text-sm font-mono"
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Select
                        value={editCondition}
                        onValueChange={(v) => setEditCondition(v as Alert["condition"])}
                      >
                        <SelectTrigger className="h-8 text-xs min-w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(CONDITION_LABELS) as Alert["condition"][]).map((c) => (
                            <SelectItem key={c} value={c} className="text-sm">
                              {CONDITION_LABELS[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min="0"
                        step={editCondition === "daily_move" ? "0.1" : "0.01"}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 w-28 text-sm font-mono"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={alert.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {fmtDate(alert.created_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {alert.last_triggered_at ? fmtDate(alert.last_triggered_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-green-400"
                          title="Save"
                          onClick={() => saveEdit(alert)}
                          disabled={updateAlert.isPending}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Cancel"
                          onClick={cancelEdit}
                          disabled={updateAlert.isPending}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                {/* Ticker */}
                <td className="px-4 py-3">
                  <span className="font-mono font-semibold text-foreground">
                    {alert.ticker}
                  </span>
                </td>

                {/* Condition */}
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {CONDITION_LABELS[alert.condition]}
                </td>

                {/* Value */}
                <td className="px-4 py-3 font-mono text-foreground whitespace-nowrap">
                  {fmtValue(alert.condition, alert.value)}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge status={alert.status} />
                </td>

                {/* Created */}
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {fmtDate(alert.created_at)}
                </td>

                {/* Last triggered */}
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {alert.last_triggered_at ? fmtDate(alert.last_triggered_at) : "—"}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title={alert.status === "active" ? "Pause alert" : "Resume alert"}
                      onClick={() => handleToggle(alert)}
                      disabled={updateAlert.isPending}
                    >
                      {alert.status === "active" ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Edit alert"
                      onClick={() => startEdit(alert)}
                      disabled={updateAlert.isPending || deleteAlert.isPending}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      title="Delete alert"
                      onClick={() => handleDelete(alert.id, alert.ticker)}
                      disabled={deleteAlert.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inline disclaimer */}
      <div className="px-4 py-2.5 border-t border-border/50 bg-muted/10">
        <p className="text-xs text-muted-foreground">
          Alert conditions are checked during scheduled pipeline runs. Educational only — not investment advice.
        </p>
      </div>
    </div>
  );
}
