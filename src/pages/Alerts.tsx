import { Bell } from "lucide-react";
import { MarketStatusBar } from "@/components/MarketStatusBar";
import { CreateAlertForm } from "@/components/alerts/CreateAlertForm";
import { AlertsTable } from "@/components/alerts/AlertsTable";
import { useUser } from "@/contexts/UserContext";
import { useAlerts } from "@/lib/report";

export default function Alerts() {
  const { user } = useUser();
  const { data: alerts } = useAlerts(user?.userId);

  const activeCount    = alerts?.filter((a) => a.status === "active").length ?? 0;
  const triggeredToday = alerts?.filter((a) => {
    if (!a.last_triggered_at) return false;
    const d = new Date(a.last_triggered_at);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth()    === now.getMonth() &&
      d.getDate()     === now.getDate()
    );
  }).length ?? 0;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <MarketStatusBar />

      {/* Page header */}
      <header className="px-6 py-4 border-b border-border/50 flex items-center gap-3 sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
        <Bell className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Alerts</h1>
          <p className="text-xs text-muted-foreground">
            {activeCount} active
            {triggeredToday > 0 && (
              <> · <span className="text-amber-400">{triggeredToday} triggered today</span></>
            )}
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-6 py-5 space-y-4 max-w-[1200px] mx-auto w-full">
        <CreateAlertForm />
        <AlertsTable />
      </div>
    </div>
  );
}
