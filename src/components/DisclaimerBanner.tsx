import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const BANNER_KEY = "investora_disclaimer_accepted";

/**
 * Sticky bottom banner reminding users that InvestoraAI
 * does not provide financial advice.
 * Dismissed permanently (localStorage) once the user accepts.
 */
const DisclaimerBanner = () => {
  const [accepted, setAccepted] = useState<boolean>(
    () => localStorage.getItem(BANNER_KEY) === "true"
  );

  if (accepted) return null;

  const handleAccept = () => {
    localStorage.setItem(BANNER_KEY, "true");
    setAccepted(true);
  };

  return (
    /* On mobile, offset above the bottom tab bar (h-16 = 4rem) */
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 border-t border-yellow-500/40 bg-yellow-500/10 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 text-sm text-foreground/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
          <p>
            <strong>Financial Disclaimer:</strong> InvestoraAI provides AI-generated analysis for
            informational purposes only — not financial advice. Always consult a qualified adviser.{" "}
            <Link to="/disclaimer" className="underline hover:text-primary">
              Read full disclaimer
            </Link>
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1 border-yellow-500/50 text-xs hover:bg-yellow-500/10"
          onClick={handleAccept}
        >
          <X className="h-3 w-3" /> I Understand
        </Button>
      </div>
    </div>
  );
};

export default DisclaimerBanner;
