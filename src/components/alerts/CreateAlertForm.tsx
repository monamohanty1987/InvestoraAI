import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";
import { useCreateAlert } from "@/lib/report";
import type { Alert, CreateAlertPayload } from "@/lib/report";
import { TickerSearch } from "@/components/TickerSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const CONDITION_LABELS: Record<Alert["condition"], string> = {
  price_above: "Price rises above",
  price_below: "Price falls below",
  daily_move: "Daily move exceeds %",
};

interface Props {
  onCreated?: () => void;
}

export function CreateAlertForm({ onCreated }: Props) {
  const { user } = useUser();
  const createAlert = useCreateAlert(user?.userId);

  const [ticker, setTicker] = useState("");
  const [condition, setCondition] = useState<Alert["condition"]>("price_above");
  const [value, setValue] = useState("");

  const isPct = condition === "daily_move";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ticker.trim()) {
      toast.error("Please select a ticker.");
      return;
    }
    const numVal = parseFloat(value);
    if (isNaN(numVal) || numVal <= 0) {
      toast.error("Please enter a valid positive number.");
      return;
    }

    const payload: CreateAlertPayload = {
      ticker: ticker.toUpperCase(),
      condition,
      value: numVal,
    };

    try {
      await createAlert.mutateAsync(payload);
      toast.success(`Alert created for ${ticker.toUpperCase()}`);
      setTicker("");
      setValue("");
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create alert");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          Create Alert
        </CardTitle>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
          {/* Ticker */}
          <div className="flex flex-col gap-1.5 min-w-[180px] flex-1">
            <Label className="text-xs text-muted-foreground">Ticker</Label>
            <TickerSearch
              placeholder="Search ticker…"
              existing={[]}
              onSelect={(t) => setTicker(t)}
            />
            {ticker && (
              <span className="text-xs text-primary font-mono mt-0.5">
                Selected: {ticker.toUpperCase()}
              </span>
            )}
          </div>

          {/* Condition */}
          <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
            <Label className="text-xs text-muted-foreground">Condition</Label>
            <Select
              value={condition}
              onValueChange={(v) => setCondition(v as Alert["condition"])}
            >
              <SelectTrigger className="h-9 text-sm bg-card border-border">
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
          </div>

          {/* Value */}
          <div className="flex flex-col gap-1.5 min-w-[120px] w-32">
            <Label className="text-xs text-muted-foreground">
              {isPct ? "Percent (%)" : "Price ($)"}
            </Label>
            <Input
              type="number"
              min="0"
              step={isPct ? "0.1" : "0.01"}
              placeholder={isPct ? "e.g. 5" : "e.g. 200"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-9 text-sm bg-card border-border"
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            size="sm"
            className="h-9 gap-1.5 shrink-0"
            disabled={createAlert.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            {createAlert.isPending ? "Creating…" : "Create Alert"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
