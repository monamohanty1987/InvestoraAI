import { RefreshCw, Bot, AlertTriangle } from "lucide-react";
import { useStockAIView } from "@/lib/report";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  ticker: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AIView({ ticker }: Props) {
  const { data, isLoading, isFetching, refetch } = useStockAIView(ticker);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            AI View
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn("h-3 w-3", isFetching && "animate-spin")}
            />
            {isFetching ? "Generating…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[75%]" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">
            Unable to generate AI view at this time.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground leading-relaxed">
              {data.summary}
            </p>

            {data.generated_at && (
              <p className="text-xs text-muted-foreground">
                Generated {timeAgo(data.generated_at)}
              </p>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-500/90 leading-snug">
            AI-generated summary. Educational only — not investment advice. Always do your own research.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
