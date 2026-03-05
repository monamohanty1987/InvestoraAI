import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserProvider } from "./contexts/UserContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import DisclaimerBanner from "./components/DisclaimerBanner";

// Eagerly loaded (critical path)
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

// Lazily loaded (code splitting — reduces initial bundle size)
const Index              = lazy(() => import("./pages/Index"));
const Profile            = lazy(() => import("./pages/Profile"));
const Watchlist          = lazy(() => import("./pages/Watchlist"));
const StockAnalysis      = lazy(() => import("./pages/StockAnalysis"));
const Alerts             = lazy(() => import("./pages/Alerts"));
const Strategy           = lazy(() => import("./pages/Strategy"));
const TermsOfService     = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy      = lazy(() => import("./pages/PrivacyPolicy"));
const FinancialDisclaimer = lazy(() => import("./pages/FinancialDisclaimer"));

// ── Query client with sensible defaults ──────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60_000,          // 1 minute
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// ── Loading fallback for lazy routes ─────────────────────
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <UserProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes */}
                <Route path="/login"      element={<Login />} />
                <Route path="/register"   element={<Register />} />
                <Route path="/terms"      element={<TermsOfService />} />
                <Route path="/privacy"    element={<PrivacyPolicy />} />
                <Route path="/disclaimer" element={<FinancialDisclaimer />} />

                {/* Protected routes — wrapped with Sidebar layout via ProtectedRoute */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/"                element={<Index />} />
                  <Route path="/watchlist"       element={<Watchlist />} />
                  <Route path="/stock"           element={<StockAnalysis />} />
                  <Route path="/stock/:ticker"   element={<StockAnalysis />} />
                  <Route path="/alerts"          element={<Alerts />} />
                  <Route path="/strategy"        element={<Strategy />} />
                  <Route path="/profile"         element={<Profile />} />
                </Route>

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>

            {/* Sticky financial disclaimer banner */}
            <DisclaimerBanner />
          </UserProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
