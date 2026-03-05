import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSession,
  setSession,
  clearSession,
  loginUser,
  updateUserProfile,
  type Session,
  type UserProfile,
} from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

interface UserContextType {
  user: Session | null;
  isLoading: boolean;
  watchlist: string[];
  setWatchlist: (tickers: string[]) => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (profile: UserProfile) => Promise<boolean>;
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [watchlist, setWatchlistState] = useState<string[]>([]);
  const navigate = useNavigate();

  // Rehydrate session from localStorage on mount (no network call needed)
  useEffect(() => {
    const session = getSession();
    setUser(session);
    setIsLoading(false);
  }, []);

  // Load watchlist whenever the logged-in user changes
  useEffect(() => {
    if (!user) {
      setWatchlistState([]);
      return;
    }
    fetch(`${API_BASE}/user/${user.userId}/watchlist`)
      .then((r) => r.json())
      .then((data: unknown) => {
        // Backend returns { user_id, tickers: [] } — extract the array
        const tickers =
          Array.isArray(data)
            ? (data as string[])
            : Array.isArray((data as { tickers?: unknown }).tickers)
            ? ((data as { tickers: string[] }).tickers)
            : [];
        setWatchlistState(tickers);
      })
      .catch(() => {
        /* silently ignore — watchlist is non-critical */
      });
  }, [user?.userId]);

  /** Persist watchlist to backend and update local state */
  const setWatchlist = async (tickers: string[]): Promise<void> => {
    if (!user) return;
    const res = await fetch(`${API_BASE}/user/${user.userId}/watchlist`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers }),
    });
    if (!res.ok) throw new Error(`Watchlist save failed: ${res.status}`);
    setWatchlistState(tickers);
  };

  const login = async (username: string, password: string) => {
    const result = await loginUser(username, password);
    if (result.ok && result.userId && result.profile) {
      const session: Session = { username, userId: result.userId, profile: result.profile };
      setSession(session);
      setUser(session);
    }
    return { ok: result.ok, error: result.error };
  };

  const logout = () => {
    clearSession();
    setUser(null);
    setWatchlistState([]);
    navigate("/login");
  };

  const updateProfile = async (profile: UserProfile) => {
    if (!user) return false;
    const ok = await updateUserProfile(user.username, profile);
    if (ok) {
      const updated: Session = { ...user, profile };
      setSession(updated);
      setUser(updated);
    }
    return ok;
  };

  return (
    <UserContext.Provider
      value={{ user, isLoading, watchlist, setWatchlist, login, logout, updateProfile }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
