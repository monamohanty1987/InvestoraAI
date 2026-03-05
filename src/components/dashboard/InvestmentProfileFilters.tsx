import { useEffect, useRef, useState } from "react";
import { Info, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ASSET_OPTIONS,
  CONSTRAINT_OPTIONS,
  HORIZON_OPTIONS,
  INTEREST_OPTIONS,
  type UserProfile,
} from "@/lib/auth";

interface InvestmentProfileFiltersProps {
  profile: UserProfile | undefined;
  isApplying: boolean;
  onApply: (updates: Pick<UserProfile, "horizon" | "preferredAssets" | "constraints" | "interests">) => Promise<void>;
}

const INTEREST_LABELS: Record<string, string> = {
  tech: "Tech",
  crypto: "Crypto",
  energy: "Energy",
  forex: "Forex",
  commodities: "Commodities",
};

const HORIZON_LABELS: Record<string, string> = {
  short: "Short-term",
  medium: "Medium-term",
  long: "Long-term",
};

const CONSTRAINT_LABELS: Record<string, string> = {
  no_crypto: "No Crypto",
  ESG: "ESG Only",
  max_20pct: "Max 20% Position",
};

const ASSET_LABELS: Record<string, string> = {
  stocks: "Stocks",
  ETFs: "ETFs",
  crypto: "Crypto",
};

export function InvestmentProfileFilters({
  profile,
  isApplying,
  onApply,
}: InvestmentProfileFiltersProps) {
  const [open, setOpen] = useState(false);
  const [horizon, setHorizon] = useState<"short" | "medium" | "long">("medium");
  const [interests, setInterests] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [preferredAssets, setPreferredAssets] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHorizon(profile?.horizon ?? "medium");
    setInterests(profile?.interests ?? []);
    setConstraints(profile?.constraints ?? []);
    setPreferredAssets(profile?.preferredAssets ?? []);
  }, [profile]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (value: string, values: string[], setter: (next: string[]) => void) => {
    setter(values.includes(value) ? values.filter((x) => x !== value) : [...values, value]);
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="h-8 gap-1.5 text-xs font-mono"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Filters</span>
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-[340px] rounded-lg border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">Profile Filters</h3>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground/70 hover:text-primary transition-colors"
                    aria-label="About dashboard profile filters"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs font-mono leading-relaxed">
                  Update profile filters and refresh personalized signals.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Horizon</Label>
              <div className="flex flex-wrap gap-1">
                {HORIZON_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setHorizon(opt)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all select-none ${
                      horizon === opt
                        ? "bg-primary/12 text-primary border-primary/30"
                        : "border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    }`}
                  >
                    {HORIZON_LABELS[opt]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Interests</Label>
                <div className="flex flex-wrap gap-1">
                  {INTEREST_OPTIONS.map((opt) => (
                    <Badge
                      key={opt}
                      variant="outline"
                      className={`cursor-pointer px-1.5 py-0 text-[10px] transition-all select-none ${
                        interests.includes(opt)
                          ? "bg-primary/12 text-primary border-primary/30"
                          : "text-muted-foreground hover:text-foreground hover:border-border"
                      }`}
                      onClick={() => toggle(opt, interests, setInterests)}
                    >
                      {INTEREST_LABELS[opt]}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Assets</Label>
                <div className="flex flex-wrap gap-1">
                  {ASSET_OPTIONS.map((opt) => (
                    <Badge
                      key={opt}
                      variant="outline"
                      className={`cursor-pointer px-1.5 py-0 text-[10px] transition-all select-none ${
                        preferredAssets.includes(opt)
                          ? "bg-primary/12 text-primary border-primary/30"
                          : "text-muted-foreground hover:text-foreground hover:border-border"
                      }`}
                      onClick={() => toggle(opt, preferredAssets, setPreferredAssets)}
                    >
                      {ASSET_LABELS[opt]}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Constraints</Label>
              <div className="flex flex-wrap gap-1">
                {CONSTRAINT_OPTIONS.map((opt) => (
                  <Badge
                    key={opt}
                    variant="outline"
                    className={`cursor-pointer px-1.5 py-0 text-[10px] transition-all select-none ${
                      constraints.includes(opt)
                        ? "bg-amber-500/12 text-amber-500 border-amber-500/30"
                        : "text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                    onClick={() => toggle(opt, constraints, setConstraints)}
                  >
                    {CONSTRAINT_LABELS[opt]}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                await onApply({ horizon, interests, constraints, preferredAssets });
                setOpen(false);
              }}
              disabled={isApplying}
              className="h-7 text-[11px] font-mono"
            >
              {isApplying ? "Updating…" : "Apply & Refresh"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
