// InvestoraAI auth helpers
// Passwords are SHA-256 hashed client-side before leaving the browser.
// User records are stored in n8n's workflow static data (SQLite via Docker).
// Only { username, userId, profile } is cached in localStorage for session rehydration.

/** A manually entered portfolio position (v3). No cost basis in MVP. */
export interface Position {
  ticker: string;
  shares: number;
}

export interface UserProfile {
  // ── Existing fields ───────────────────────────────────────
  riskTolerance: "low" | "medium" | "high";
  interests: string[];
  telegramChatId: string;
  // ── New v2 fields (optional for backward-compat with old sessions) ──
  displayName?: string;
  email?: string;
  riskTolerancePercent?: number;   // 0-100 slider value
  defaultMarket?: "US" | "EU";
  baseCurrency?: "USD" | "EUR" | "GBP";
  dailyEmailDigest?: boolean;
  weeklyEmailDigest?: boolean;
  alertNotifications?: boolean;
  // ── New v3 fields ─────────────────────────────────────────
  horizon?: "short" | "medium" | "long";   // investment time horizon
  constraints?: string[];                   // e.g. ["no_crypto", "ESG", "max_20pct"]
  preferredAssets?: string[];               // e.g. ["stocks", "ETFs", "crypto"]
  positions?: Position[];                   // manually entered portfolio positions
}

export interface Session {
  username: string;
  userId: string;
  profile: UserProfile;
}

export const INTEREST_OPTIONS = ["tech", "crypto", "energy", "forex", "commodities"] as const;
export const RISK_OPTIONS = ["low", "medium", "high"] as const;
export const MARKET_OPTIONS = ["US", "EU"] as const;
export const CURRENCY_OPTIONS = ["USD", "EUR", "GBP"] as const;
// v3 options
export const HORIZON_OPTIONS = ["short", "medium", "long"] as const;
export const CONSTRAINT_OPTIONS = ["no_crypto", "ESG", "max_20pct"] as const;
export const ASSET_OPTIONS = ["stocks", "ETFs", "crypto"] as const;

const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL;
const SESSION_KEY = "investora_session";
const HASH_SALT = "investora_2026";

// --- Password hashing ---

export async function hashPassword(password: string): Promise<string> {
  const text = password + HASH_SALT;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- n8n webhook API calls ---

export async function registerUser(
  username: string,
  password: string,
  profile: UserProfile
): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();

  const res = await fetch(`${N8N_BASE}/investora/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, passwordHash, userId, profile }),
  });

  return res.json();
}

export async function loginUser(
  username: string,
  password: string
): Promise<{ ok: boolean; userId?: string; profile?: UserProfile; error?: string }> {
  const passwordHash = await hashPassword(password);

  const res = await fetch(`${N8N_BASE}/investora/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, passwordHash }),
  });

  return res.json();
}

export async function updateUserProfile(
  username: string,
  profile: UserProfile
): Promise<boolean> {
  try {
    const res = await fetch(`${N8N_BASE}/investora/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, profile }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

// --- localStorage session helpers ---

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(data: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
