import { Navigate, Outlet } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";

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

  return <Outlet />;
}
