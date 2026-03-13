import { getDailyReportV2, listDailyReportsV2 } from "@/lib/api";
import { DailyReportV2Card, DailyReportV2Day } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";

export function useDailyReportsV2(from: string, to: string) {
  return useQuery<DailyReportV2Card[]>({
    queryKey: ["reports-v2", from, to],
    queryFn: () => listDailyReportsV2({ from, to }),
  });
}

export function useDailyReportDayV2(date: string) {
  return useQuery<DailyReportV2Day>({
    queryKey: ["reports-day-v2", date],
    queryFn: () => getDailyReportV2(date),
    enabled: !!date,
  });
}

