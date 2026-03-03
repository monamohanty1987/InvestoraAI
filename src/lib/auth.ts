// InvestoraAI auth helpers
// Passwords are SHA-256 hashed client-side before leaving the browser.
// User records are stored in n8n's workflow static data (SQLite via Docker).
// Only { username, userId, profile } is cached in localStorage for session rehydration.

export interface UserProfile {
  riskTolerance: string;
  interests: string[];
  telegramChatId: string;
}

export interface Session {
  username: string;
  userId: string;
  profile: UserProfile;
}

export const INTEREST_OPTIONS = ["tech", "crypto", "energy", "forex", "commodities"] as const;
export const RISK_OPTIONS = ["low", "medium", "high"] as const;

const N8N_BASE = "http://localhost:5678/webhook";
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
