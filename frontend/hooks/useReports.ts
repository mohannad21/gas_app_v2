import { getDailyReport, listDailyReports } from "@/lib/api";
import { DailyReportCard, DailyReportDay } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";

export function useDailyReportsV2(from: string, to: string) {
  return useQuery<DailyReportCard[]>({
    queryKey: ["reports-v2", from, to],
    queryFn: () => listDailyReports({ from, to }),
  });
}

export function useDailyReportDayV2(date: string) {
  return useQuery<DailyReportDay>({
    queryKey: ["reports-day-v2", date],
    queryFn: () => getDailyReport(date),
    enabled: !!date,
  });
}

