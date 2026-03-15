import { useEffect, useMemo, useState } from "react";

import { useDailyReportsV2 } from "@/hooks/useReports";
import { getDailyReportV2 } from "@/lib/api";
import { DailyReportV2Day } from "@/types/domain";

const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function useDailyReportScreen(rangeDays = 30) {
  const today = getLocalDateString();
  const v2From = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - rangeDays);
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, "0");
    const day = String(start.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [rangeDays]);
  const v2To = today;

  const v2Query = useDailyReportsV2(v2From, v2To);
  const v2Rows = useMemo(() => {
    const rows = Array.isArray(v2Query.data) ? v2Query.data : [];
    return [...rows].sort((a, b) => String(b?.date ?? "").localeCompare(String(a?.date ?? "")));
  }, [v2Query.data]);

  const [v2Expanded, setV2Expanded] = useState<string[]>([]);
  const [v2DayByDate, setV2DayByDate] = useState<Record<string, DailyReportV2Day | null>>({});

  useEffect(() => {
    const wanted = new Set<string>(v2Expanded);
    if (wanted.size === 0) return;

    const missing = Array.from(wanted).filter((date) => !(date in v2DayByDate));
    if (missing.length === 0) return;

    let cancelled = false;
    const load = async () => {
      for (const date of missing) {
        try {
          const day = await getDailyReportV2(date);
          if (cancelled) return;
          setV2DayByDate((prev) => ({ ...prev, [date]: day }));
        } catch {
          if (cancelled) return;
          setV2DayByDate((prev) => ({ ...prev, [date]: null }));
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [v2Expanded, v2DayByDate, v2Rows]);

  useEffect(() => {
    if (!v2Query.data) return;
    setV2DayByDate({});
  }, [v2Query.data, v2Query.dataUpdatedAt]);

  return {
    v2Query,
    v2Rows,
    v2Expanded,
    setV2Expanded,
    v2DayByDate,
    setV2DayByDate,
    refetchV2: v2Query.refetch,
  };
}

