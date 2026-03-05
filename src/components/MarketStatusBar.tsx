import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

interface MarketStatus {
  status: "OPEN" | "CLOSED";
  last_update: string;
}

async function fetchMarketStatus(): Promise<MarketStatus> {
  const res = await fetch(`${API_BASE}/market/status`);
  if (!res.ok) throw new Error("Failed to fetch market status");
  return res.json();
}

export function MarketStatusBar() {
  const { data } = useQuery<MarketStatus, Error>({
    queryKey: ["market-status"],
    queryFn: fetchMarketStatus,
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: false,
  });

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          data?.status === "OPEN" ? "bg-green-500" : "bg-red-500"
        )}
      />
      <span>
        Market:{" "}
        <span
          className={
            data?.status === "OPEN" ? "text-green-500 font-medium" : "text-red-400 font-medium"
          }
        >
          {data?.status ?? "—"}
        </span>
      </span>
      {data?.last_update && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span>Last update: {data.last_update}</span>
        </>
      )}
    </div>
  );
}
