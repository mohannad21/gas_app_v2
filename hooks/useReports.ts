import { listDailyReports } from "@/lib/api";
import { DailyReportRow } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";

export function useDailyReports() {
  return useQuery<DailyReportRow[]>({
    queryKey: ["reports"],
    queryFn: listDailyReports,
  });
}
