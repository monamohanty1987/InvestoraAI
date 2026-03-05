import { useState } from "react";
import { User, Save } from "lucide-react";
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

  // Form state — initialised from stored profile
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

  const toggleInterest = (opt: string) => {
    setInterests((prev) =>
      prev.includes(opt) ? prev.filter((i) => i !== opt) : [...prev, opt]
    );
  };

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
