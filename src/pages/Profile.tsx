import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { INTEREST_OPTIONS } from "@/lib/auth";

const INTEREST_LABELS: Record<string, string> = {
  tech: "Tech",
  crypto: "Crypto",
  energy: "Energy",
  forex: "Forex",
  commodities: "Commodities",
};

const Profile = () => {
  const { user, updateProfile, logout } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [riskTolerance, setRiskTolerance] = useState(user?.profile.riskTolerance ?? "medium");
  const [interests, setInterests] = useState<string[]>(user?.profile.interests ?? []);
  const [telegramChatId, setTelegramChatId] = useState(user?.profile.telegramChatId ?? "");
  const [saving, setSaving] = useState(false);

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const handleSave = async () => {
    if (interests.length === 0) {
      toast({ title: "Select at least one interest", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const ok = await updateProfile({
        riskTolerance,
        interests,
        telegramChatId: telegramChatId.trim(),
      });
      if (ok) {
        toast({ title: "Profile updated", description: "Your preferences have been saved." });
      } else {
        toast({
          title: "Update failed",
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
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-mono font-bold text-gradient-primary">Investora AI</h1>
          <span className="text-xs font-mono text-muted-foreground">/ Profile</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* User Info Card */}
        <div className="bg-card border border-border/50 rounded-xl p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-xl font-mono font-bold text-primary glow-primary shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-mono font-semibold text-foreground text-lg truncate">
              {user?.username}
            </p>
            <p className="font-mono text-xs text-muted-foreground truncate">
              ID: {user?.userId}
            </p>
          </div>
        </div>

        {/* Preferences Card */}
        <div className="bg-card border border-border/50 rounded-xl p-6 space-y-5">
          <h2 className="font-mono font-semibold text-foreground">Preferences</h2>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Risk Tolerance
            </label>
            <Select value={riskTolerance} onValueChange={setRiskTolerance}>
              <SelectTrigger className="font-mono bg-background/50 max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low — Conservative</SelectItem>
                <SelectItem value="medium">Medium — Balanced</SelectItem>
                <SelectItem value="high">High — Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Interests
            </label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((opt) => (
                <Badge
                  key={opt}
                  variant="outline"
                  className={`cursor-pointer font-mono text-xs transition-all select-none ${
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

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Telegram Chat ID
            </label>
            <Input
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="e.g. 123456789"
              className="font-mono bg-background/50 max-w-xs"
            />
            <p className="text-xs text-muted-foreground font-mono">
              Used for personalized Telegram alerts
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="font-mono gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        {/* Session */}
        <div className="bg-card border border-destructive/20 rounded-xl p-6">
          <h2 className="font-mono font-semibold text-foreground mb-3">Session</h2>
          <Button variant="destructive" onClick={logout} className="font-mono">
            Sign Out
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Profile;
