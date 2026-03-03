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

interface UserContextType {
  user: Session | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  updateProfile: (profile: UserProfile) => Promise<boolean>;
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Rehydrate session from localStorage on mount (no network call needed)
  useEffect(() => {
    const session = getSession();
    setUser(session);
    setIsLoading(false);
  }, []);

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
    <UserContext.Provider value={{ user, isLoading, login, logout, updateProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
