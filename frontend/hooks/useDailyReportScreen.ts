import { useEffect, useMemo, useRef, useState } from "react";

import { useDailyReportsV2 } from "@/hooks/useReports";
import { getDailyReport } from "@/lib/api";
import { DailyReportDay } from "@/types/domain";

const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export type ReportDayLoadStatus = "idle" | "loading" | "success" | "error";

export function useDailyReportScreen(rangeDays = 30, selectedDate?: string | null) {
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
  const [v2DayByDate, setV2DayByDate] = useState<Record<string, DailyReportDay | null>>({});
  const [v2DayStatusByDate, setV2DayStatusByDate] = useState<Record<string, ReportDayLoadStatus>>({});
  const requestedDatesRef = useRef<Set<string>>(new Set());

  const wantedDates = useMemo(() => {
    const wanted = new Set<string>(v2Expanded);
    if (selectedDate) {
      wanted.add(selectedDate);
    }
    return Array.from(wanted);
  }, [selectedDate, v2Expanded]);

  useEffect(() => {
    if (wantedDates.length === 0) return;

    const missing = wantedDates.filter(
      (date) => !requestedDatesRef.current.has(date) && !(date in v2DayStatusByDate)
    );
    if (missing.length === 0) return;

    let cancelled = false;
    for (const date of missing) {
      requestedDatesRef.current.add(date);
    }
    setV2DayStatusByDate((prev) => {
      const next = { ...prev };
      for (const date of missing) {
        next[date] = "loading";
      }
      return next;
    });

    const load = async () => {
      for (const date of missing) {
        try {
          const day = await getDailyReport(date);
          if (cancelled) return;
          setV2DayByDate((prev) => ({ ...prev, [date]: day }));
          setV2DayStatusByDate((prev) => ({ ...prev, [date]: "success" }));
        } catch {
          if (cancelled) return;
          setV2DayStatusByDate((prev) => ({ ...prev, [date]: "error" }));
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [v2Query.dataUpdatedAt, wantedDates]);

  useEffect(() => {
    if (!v2Query.data) return;
    requestedDatesRef.current = new Set();
    setV2DayByDate({});
    setV2DayStatusByDate({});
  }, [v2Query.data, v2Query.dataUpdatedAt]);

  useEffect(() => {
    setV2DayByDate((prev) => {
      const wanted = new Set(wantedDates);
      const next = Object.fromEntries(Object.entries(prev).filter(([date]) => wanted.has(date)));
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && prevKeys.every((key) => prev[key] === next[key])) {
        return prev;
      }
      return next;
    });
    setV2DayStatusByDate((prev) => {
      const wanted = new Set(wantedDates);
      const next = Object.fromEntries(Object.entries(prev).filter(([date]) => wanted.has(date)));
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && prevKeys.every((key) => prev[key] === next[key])) {
        return prev;
      }
      return next;
    });
    requestedDatesRef.current = new Set(Array.from(requestedDatesRef.current).filter((date) => wantedDates.includes(date)));
  }, [wantedDates]);

  return {
    v2Query,
    v2Rows,
    v2Expanded,
    setV2Expanded,
    v2DayByDate,
    v2DayStatusByDate,
    refetchV2: v2Query.refetch,
  };
}

