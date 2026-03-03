import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Activity } from "lucide-react";
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
import { registerUser, INTEREST_OPTIONS } from "@/lib/auth";

const INTEREST_LABELS: Record<string, string> = {
  tech: "Tech",
  crypto: "Crypto",
  energy: "Energy",
  forex: "Forex",
  commodities: "Commodities",
};

const Register = () => {
  const navigate = useNavigate();
  const { login } = useUser();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [riskTolerance, setRiskTolerance] = useState("medium");
  const [interests, setInterests] = useState<string[]>(["tech"]);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (username.trim().length < 3) return setError("Username must be at least 3 characters");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirmPassword) return setError("Passwords do not match");
    if (interests.length === 0) return setError("Select at least one interest");

    setLoading(true);
    try {
      const result = await registerUser(username.trim(), password, {
        riskTolerance,
        interests,
        telegramChatId: telegramChatId.trim(),
      });

      if (!result.ok) {
        setError(result.error || "Registration failed");
        return;
      }

      // Auto-login after registration
      await login(username.trim(), password);
      navigate("/");
    } catch {
      setError("Connection error. Is n8n running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center glow-primary">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-xl font-mono font-bold text-gradient-primary">Investora AI</h1>
        </div>

        {/* Card */}
        <div className="bg-card border border-border/50 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-mono font-semibold text-foreground">Create Account</h2>
            <p className="text-sm text-muted-foreground font-mono mt-1">
              Set up your investor profile
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Username
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_username"
                className="font-mono bg-background/50"
                required
                autoComplete="username"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 chars"
                  className="font-mono bg-background/50"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Confirm
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat"
                  className="font-mono bg-background/50"
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Risk Tolerance
              </label>
              <Select value={riskTolerance} onValueChange={setRiskTolerance}>
                <SelectTrigger className="font-mono bg-background/50">
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
                Telegram Chat ID{" "}
                <span className="normal-case text-muted-foreground/60">(optional)</span>
              </label>
              <Input
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g. 123456789"
                className="font-mono bg-background/50"
              />
            </div>

            {error && <p className="text-xs font-mono text-destructive">{error}</p>}

            <Button type="submit" className="w-full font-mono" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>

            {/* Terms agreement notice */}
            <p className="text-xs font-mono text-muted-foreground/70 text-center leading-5">
              By creating an account you agree to our{" "}
              <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              <br />
              <Link to="/disclaimer" className="text-primary hover:underline">Financial Disclaimer</Link>
              {" "}— AI analysis is not financial advice.
            </p>
          </form>

          <p className="text-center text-sm font-mono text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
