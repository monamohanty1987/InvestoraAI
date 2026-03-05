import { ExternalLink, Newspaper } from "lucide-react";
import { useStockNews } from "@/lib/report";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  ticker: string;
}

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const s = sentiment.toLowerCase();
  const cls = cn(
    "text-[10px] font-medium capitalize",
    s === "positive" && "border-green-500/40 text-green-400 bg-green-500/10",
    s === "negative" && "border-red-500/40 text-red-400 bg-red-500/10",
    s === "neutral"  && "border-border text-muted-foreground bg-muted/30"
  );
  return (
    <Badge variant="outline" className={cls}>
      {sentiment}
    </Badge>
  );
}

export function RecentNews({ ticker }: Props) {
  const { data, isLoading } = useStockNews(ticker);

  const items = Array.isArray(data) ? data.slice(0, 5) : [];

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          Recent News
        </CardTitle>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[80%]" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent news found.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((item, i) => (
              <li key={i} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2 mb-1">
                  {item.sentiment && (
                    <SentimentBadge sentiment={item.sentiment} />
                  )}
                </div>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                  >
                    <p className="text-sm text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {item.headline}
                      <ExternalLink className="inline h-3 w-3 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </p>
                  </a>
                ) : (
                  <p className="text-sm text-foreground leading-snug line-clamp-2">
                    {item.headline}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.source}
                  {item.datetime ? (
                    <> · {timeAgo(item.datetime)}</>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
