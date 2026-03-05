import { Navigate, Outlet } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { Sidebar } from "@/components/Sidebar";

export function ProtectedRoute() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="font-mono text-muted-foreground animate-pulse text-sm">
          Initializing...
        </span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      {/* pb-16 reserves space for the mobile bottom tab bar; cleared on md+ */}
      <main className="flex-1 min-w-0 overflow-auto pb-16 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
