import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Search } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: Route not found:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      {/* Large 404 */}
      <div className="select-none">
        <span className="text-9xl font-black text-primary/10">404</span>
      </div>

      {/* Icon */}
      <div className="rounded-full bg-muted p-5 -mt-8">
        <Search className="h-10 w-10 text-muted-foreground" />
      </div>

      {/* Text */}
      <div>
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-muted-foreground">
          The page{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono text-foreground">
            {location.pathname}
          </code>{" "}
          doesn't exist or has been moved.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Go Back
        </Button>
        <Button className="gap-2" onClick={() => navigate("/")}>
          <Home className="h-4 w-4" /> Dashboard
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
