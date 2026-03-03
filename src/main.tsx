import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// ── Sentry Initialisation ─────────────────────────────────
// Set VITE_SENTRY_DSN in your .env file.
// Get your DSN at: https://sentry.io → Project Settings → Client Keys
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,           // "production" | "development"
    tracesSampleRate: 0.2,                        // capture 20% of transactions
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,               // always replay on errors
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Don't log to Sentry in development
    enabled: import.meta.env.PROD,
  });
}

createRoot(document.getElementById("root")!).render(<App />);
