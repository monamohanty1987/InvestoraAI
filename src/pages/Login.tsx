import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useUser();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      if (result.ok) {
        navigate("/");
      } else {
        setError("Invalid username or password");
      }
    } catch {
      setError("Connection error. Is n8n running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
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
            <h2 className="text-lg font-mono font-semibold text-foreground">Sign in</h2>
            <p className="text-sm text-muted-foreground font-mono mt-1">Access your dashboard</p>
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

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="font-mono bg-background/50"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-xs font-mono text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full font-mono" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-center text-sm font-mono text-muted-foreground">
            No account?{" "}
            <Link to="/register" className="text-primary hover:underline">
              Create one
            </Link>
          </p>
        </div>

        {/* Legal links */}
        <div className="flex justify-center gap-4 mt-6 text-xs font-mono text-muted-foreground/60">
          <Link to="/terms" className="hover:text-primary transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
          <Link to="/disclaimer" className="hover:text-primary transition-colors">Disclaimer</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
