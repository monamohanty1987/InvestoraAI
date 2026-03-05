import { useDashboard as useDashboardFromReport } from "@/lib/report";

export function useDashboard(userId: string | undefined) {
  return useDashboardFromReport(userId);
}

