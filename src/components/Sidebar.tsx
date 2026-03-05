import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  List,
  BarChart2,
  Bell,
  TrendingUp,
  User,
  LogOut,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  shortLabel?: string;
  end?: boolean;
}

const MARKETS_NAV: NavItem[] = [
  { to: "/",          icon: LayoutDashboard, label: "Dashboard",     shortLabel: "Home",     end: true },
  { to: "/watchlist", icon: List,            label: "Watchlist",     shortLabel: "Watch" },
  { to: "/stock",     icon: BarChart2,       label: "Stock Analysis", shortLabel: "Stocks" },
  { to: "/alerts",    icon: Bell,            label: "Alerts",        shortLabel: "Alerts" },
  { to: "/strategy",  icon: TrendingUp,      label: "Strategy",      shortLabel: "Strategy" },
];

const ACCOUNT_NAV: NavItem[] = [
  { to: "/profile", icon: User, label: "Profile", shortLabel: "Profile" },
];

// Flat list for mobile bottom bar (all items in one row)
const ALL_NAV_MOBILE = [...MARKETS_NAV, ...ACCOUNT_NAV];

// ── Desktop sidebar nav item ──────────────────────────────────────────────

function SidebarNavItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </NavLink>
  );
}

// ── Mobile bottom tab bar item ────────────────────────────────────────────

function BottomTabItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-w-0",
          isActive ? "text-primary" : "text-muted-foreground"
        )
      }
    >
      <item.icon className="h-5 w-5 shrink-0" />
      <span className="truncate w-full text-center leading-tight">
        {item.shortLabel ?? item.label}
      </span>
    </NavLink>
  );
}

// ── Sidebar component ─────────────────────────────────────────────────────

export function Sidebar() {
  const { user, logout } = useUser();

  return (
    <>
      {/* ── Desktop sidebar — hidden on mobile ─────────────────────── */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-card flex-col h-screen sticky top-0">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center glow-primary shrink-0">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <span className="font-mono font-bold text-base text-gradient-primary">
              Investora AI
            </span>
          </div>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-6">
          <div>
            <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Markets
            </p>
            <div className="space-y-0.5">
              {MARKETS_NAV.map((item) => (
                <SidebarNavItem key={item.to} item={item} />
              ))}
            </div>
          </div>

          <div>
            <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Account
            </p>
            <div className="space-y-0.5">
              {ACCOUNT_NAV.map((item) => (
                <SidebarNavItem key={item.to} item={item} />
              ))}
            </div>
          </div>
        </nav>

        {/* User info + Sign Out */}
        <div className="px-3 py-4 border-t border-border space-y-1">
          {user && (
            <p className="px-3 py-1 text-xs text-muted-foreground truncate">
              {user.username}
            </p>
          )}
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar — hidden on desktop ──────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-card/95 backdrop-blur-md safe-area-inset-bottom"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {ALL_NAV_MOBILE.map((item) => (
          <BottomTabItem key={item.to} item={item} />
        ))}
      </nav>
    </>
  );
}
