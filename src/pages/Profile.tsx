import { useState } from "react";
import { User, Save, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MarketStatusBar } from "@/components/MarketStatusBar";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import {
  INTEREST_OPTIONS,
  MARKET_OPTIONS,
  CURRENCY_OPTIONS,
  HORIZON_OPTIONS,
  CONSTRAINT_OPTIONS,
  ASSET_OPTIONS,
  type Position,
} from "@/lib/auth";

// ── Helpers ────────────────────────────────────────────────────────────────

const INTEREST_LABELS: Record<string, string> = {
  tech: "Tech",
  crypto: "Crypto",
  energy: "Energy",
  forex: "Forex",
  commodities: "Commodities",
};

const MARKET_LABELS: Record<string, string> = {
  US: "US Markets",
  EU: "EU Markets",
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

function riskLabelFromPct(pct: number): string {
  if (pct <= 33) return "Conservative";
  if (pct <= 66) return "Balanced";
  return "Aggressive";
}

function riskFromPct(pct: number): "low" | "medium" | "high" {
  if (pct <= 33) return "low";
  if (pct <= 66) return "medium";
  return "high";
}

function pctFromRisk(risk: "low" | "medium" | "high"): number {
  if (risk === "low") return 16;
  if (risk === "medium") return 50;
  return 83;
}

// ── Profile page ───────────────────────────────────────────────────────────

export default function Profile() {
  const { user, updateProfile, logout } = useUser();
  const { toast } = useToast();

  const p = user?.profile;

  // ── Existing form state ────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(p?.displayName ?? "");
  const [riskPct, setRiskPct] = useState(
    p?.riskTolerancePercent ?? pctFromRisk(p?.riskTolerance ?? "medium")
  );
  const [interests, setInterests] = useState<string[]>(p?.interests ?? []);
  const [defaultMarket, setDefaultMarket] = useState<string>(p?.defaultMarket ?? "US");
  const [baseCurrency, setBaseCurrency] = useState<string>(p?.baseCurrency ?? "USD");
  const [telegramChatId, setTelegramChatId] = useState(p?.telegramChatId ?? "");
  const [dailyEmailDigest, setDailyEmailDigest] = useState(p?.dailyEmailDigest ?? false);
  const [alertNotifications, setAlertNotifications] = useState(
    p?.alertNotifications ?? true
  );
  const [saving, setSaving] = useState(false);

  // ── v3 Investment Profile state ────────────────────────────────────────
  const [horizon, setHorizon] = useState<"short" | "medium" | "long">(
    p?.horizon ?? "medium"
  );
  const [constraints, setConstraints] = useState<string[]>(p?.constraints ?? []);
  const [preferredAssets, setPreferredAssets] = useState<string[]>(
    p?.preferredAssets ?? []
  );

  // ── v3 Portfolio Positions state ───────────────────────────────────────
  const [positions, setPositions] = useState<Position[]>(p?.positions ?? []);
  const [newTicker, setNewTicker] = useState("");
  const [newShares, setNewShares] = useState("");

  // ── Toggle helpers ─────────────────────────────────────────────────────
  const toggleInterest = (opt: string) => {
    setInterests((prev) =>
      prev.includes(opt) ? prev.filter((i) => i !== opt) : [...prev, opt]
    );
  };

  const toggleConstraint = (opt: string) => {
    setConstraints((prev) =>
      prev.includes(opt) ? prev.filter((c) => c !== opt) : [...prev, opt]
    );
  };

  const toggleAsset = (opt: string) => {
    setPreferredAssets((prev) =>
      prev.includes(opt) ? prev.filter((a) => a !== opt) : [...prev, opt]
    );
  };

  // ── Position helpers ───────────────────────────────────────────────────
  const addPosition = () => {
    const ticker = newTicker.trim().toUpperCase();
    const shares = parseFloat(newShares);
    if (!ticker || isNaN(shares) || shares <= 0) return;
    setPositions((prev) => {
      const existingIdx = prev.findIndex((pos) => pos.ticker === ticker);
      if (existingIdx >= 0) {
        // Update shares if ticker already present
        return prev.map((pos, i) => (i === existingIdx ? { ...pos, shares } : pos));
      }
      return [...prev, { ticker, shares }];
    });
    setNewTicker("");
    setNewShares("");
  };

  const removePosition = (ticker: string) => {
    setPositions((prev) => prev.filter((pos) => pos.ticker !== ticker));
  };

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await updateProfile({
        displayName: displayName.trim(),
        riskTolerance: riskFromPct(riskPct),
        riskTolerancePercent: riskPct,
        interests,
        defaultMarket: defaultMarket as "US" | "EU",
        baseCurrency: baseCurrency as "USD" | "EUR" | "GBP",
        telegramChatId: telegramChatId.trim(),
        dailyEmailDigest,
        alertNotifications,
        // v3 fields
        horizon,
        constraints,
        preferredAssets,
        positions,
      });
      if (ok) {
        toast({ title: "Settings saved", description: "Your preferences have been updated." });
      } else {
        toast({
          title: "Save failed",
          description: "Could not reach n8n. Check it's running.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Connection error.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const initials = (user?.username ?? "??").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <MarketStatusBar />

      {/* Page header */}
      <header className="px-6 py-4 border-b border-border/50 flex items-center gap-3 sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
        <User className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Profile</h1>
          <p className="text-xs text-muted-foreground">
            Manage your account and preferences
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-6 py-5 space-y-5 max-w-2xl mx-auto w-full">

        {/* Avatar + username row */}
        <div className="flex items-center gap-4 py-1">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold font-mono text-primary shrink-0">
            {initials}
          </div>
          <div>
            <p className="font-semibold text-foreground">{user?.username}</p>
            <p className="text-xs text-muted-foreground font-mono">ID: {user?.userId}</p>
          </div>
        </div>

        {/* ── ACCOUNT ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Username</Label>
              <Input
                value={user?.username ?? ""}
                readOnly
                className="font-mono bg-muted/30 text-muted-foreground cursor-default"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you want to be addressed"
                className="font-mono"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── MARKET PREFERENCES ──────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Market Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Default Market</Label>
                <Select value={defaultMarket} onValueChange={setDefaultMarket}>
                  <SelectTrigger className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKET_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m} className="font-mono">
                        {MARKET_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Base Currency</Label>
                <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                  <SelectTrigger className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c} className="font-mono">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Interests</Label>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {INTEREST_OPTIONS.map((opt) => (
                  <Badge
                    key={opt}
                    variant="outline"
                    className={`cursor-pointer text-xs transition-all select-none ${
                      interests.includes(opt)
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                    onClick={() => toggleInterest(opt)}
                  >
                    {INTEREST_LABELS[opt]}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── RISK PROFILE ────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Risk Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Risk Tolerance</Label>
              <span className="text-sm font-semibold text-foreground">
                {riskLabelFromPct(riskPct)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e.target.value))}
              className="w-full accent-primary cursor-pointer h-1.5 rounded-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>Conservative</span>
              <span>Balanced</span>
              <span>Aggressive</span>
            </div>
          </CardContent>
        </Card>

        {/* ── INVESTMENT PROFILE ──────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Investment Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">

            {/* Horizon pills */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Investment Horizon</Label>
              <div className="flex gap-2 pt-0.5">
                {HORIZON_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setHorizon(opt)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all select-none ${
                      horizon === opt
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    }`}
                  >
                    {HORIZON_LABELS[opt]}
                  </button>
                ))}
              </div>
            </div>

            {/* Preferred Assets toggles */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Preferred Assets</Label>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {ASSET_OPTIONS.map((opt) => (
                  <Badge
                    key={opt}
                    variant="outline"
                    className={`cursor-pointer text-xs transition-all select-none ${
                      preferredAssets.includes(opt)
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                    onClick={() => toggleAsset(opt)}
                  >
                    {ASSET_LABELS[opt]}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Constraints toggles */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Constraints</Label>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {CONSTRAINT_OPTIONS.map((opt) => (
                  <Badge
                    key={opt}
                    variant="outline"
                    className={`cursor-pointer text-xs transition-all select-none ${
                      constraints.includes(opt)
                        ? "bg-amber-500/15 text-amber-600 border-amber-500/40 dark:text-amber-400"
                        : "text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                    onClick={() => toggleConstraint(opt)}
                  >
                    {CONSTRAINT_LABELS[opt]}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Active constraints exclude non-compliant tickers from discovery signals.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── PORTFOLIO POSITIONS ──────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Portfolio Positions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Track holdings manually to boost watchlist relevance in your personalized signals.
            </p>

            {/* Existing positions list */}
            {positions.length > 0 && (
              <div className="space-y-1.5">
                {positions.map((pos) => (
                  <div
                    key={pos.ticker}
                    className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2"
                  >
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {pos.ticker}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono">
                        {pos.shares.toLocaleString()} shares
                      </span>
                      <button
                        type="button"
                        onClick={() => removePosition(pos.ticker)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Remove ${pos.ticker}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add position inline form */}
            <div className="flex gap-2 pt-1">
              <Input
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                placeholder="TICKER"
                className="font-mono w-28 uppercase"
                onKeyDown={(e) => e.key === "Enter" && addPosition()}
              />
              <Input
                type="number"
                value={newShares}
                onChange={(e) => setNewShares(e.target.value)}
                placeholder="Shares"
                className="font-mono w-28"
                min={0}
                step="any"
                onKeyDown={(e) => e.key === "Enter" && addPosition()}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPosition}
                className="gap-1 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── NOTIFICATIONS ───────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Telegram Chat ID</Label>
              <Input
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g. 123456789"
                className="font-mono max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Used to deliver personalized alerts via Telegram
              </p>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/50">
              <div className="flex items-center justify-between pt-3">
                <div className="space-y-0.5">
                  <p className="text-sm text-foreground">Daily Email Digest</p>
                  <p className="text-xs text-muted-foreground">
                    Receive a daily summary of your portfolio analysis
                  </p>
                </div>
                <Switch
                  checked={dailyEmailDigest}
                  onCheckedChange={setDailyEmailDigest}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm text-foreground">Alert Notifications</p>
                  <p className="text-xs text-muted-foreground">
                    Get notified when your price alerts are triggered
                  </p>
                </div>
                <Switch
                  checked={alertNotifications}
                  onCheckedChange={setAlertNotifications}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── SAVE / SIGN OUT ─────────────────────────────────── */}
        <div className="flex items-center justify-between pb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-muted-foreground hover:text-destructive text-xs"
          >
            Sign Out
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
