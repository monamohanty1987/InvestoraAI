import { usePersonalizedSignals as usePersonalizedSignalsFromReport } from "@/lib/report";

export function usePersonalizedSignals(userId: string | undefined) {
  return usePersonalizedSignalsFromReport(userId);
}

