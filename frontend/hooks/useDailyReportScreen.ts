import { useEffect, useMemo, useState } from "react";

import { useCustomers } from "@/hooks/useCustomers";
import { useDailyReportsV2 } from "@/hooks/useReports";
import { getDailyReportV2 } from "@/lib/api";
import { DailyReportV2Day } from "@/types/domain";

type BalanceBucket = { count: number; total: number };
export type BalanceSummary = {
  money: { receivable: BalanceBucket; payable: BalanceBucket };
  cyl12: { receivable: BalanceBucket; payable: BalanceBucket };
  cyl48: { receivable: BalanceBucket; payable: BalanceBucket };
};

export type CompanySummary = {
  give12: number;
  receive12: number;
  give48: number;
  receive48: number;
  payCash: number;
  receiveCash: number;
};

const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function useDailyReportScreen(rangeDays = 30) {
  const customersQuery = useCustomers();

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
    const wanted = new Set<string>([...v2Expanded, ...((v2Query.data ?? []) as any[]).map((row) => row.date)]);
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
  }, [v2Expanded, v2DayByDate, v2Query.data]);

  useEffect(() => {
    if (!v2Query.data) return;
    setV2DayByDate({});
  }, [v2Query.data]);

  const balanceSummary: BalanceSummary = useMemo(() => {
    const customers = Array.isArray(customersQuery.data) ? customersQuery.data : [];
    const summary: BalanceSummary = {
      money: {
        receivable: { count: 0, total: 0 },
        payable: { count: 0, total: 0 },
      },
      cyl12: {
        receivable: { count: 0, total: 0 },
        payable: { count: 0, total: 0 },
      },
      cyl48: {
        receivable: { count: 0, total: 0 },
        payable: { count: 0, total: 0 },
      },
    };

    customers.forEach((customer) => {
      const money = Number(customer.money_balance || 0);
      if (money > 0) {
        summary.money.receivable.count += 1;
        summary.money.receivable.total += money;
      } else if (money < 0) {
        summary.money.payable.count += 1;
        summary.money.payable.total += Math.abs(money);
      }

      const cyl12 = Number(customer.cylinder_balance_12kg || 0);
      if (cyl12 > 0) {
        summary.cyl12.receivable.count += 1;
        summary.cyl12.receivable.total += cyl12;
      } else if (cyl12 < 0) {
        summary.cyl12.payable.count += 1;
        summary.cyl12.payable.total += Math.abs(cyl12);
      }

      const cyl48 = Number(customer.cylinder_balance_48kg || 0);
      if (cyl48 > 0) {
        summary.cyl48.receivable.count += 1;
        summary.cyl48.receivable.total += cyl48;
      } else if (cyl48 < 0) {
        summary.cyl48.payable.count += 1;
        summary.cyl48.payable.total += Math.abs(cyl48);
      }
    });

    return summary;
  }, [customersQuery.data]);

  const companySummary: CompanySummary = useMemo(() => {
    const latest = v2Rows[0];
    const net12 = Number(latest?.company_12kg_end ?? 0);
    const net48 = Number(latest?.company_48kg_end ?? 0);
    const cashNet = Number(latest?.company_end ?? 0);
    return {
      give12: Math.max(-net12, 0),
      receive12: Math.max(net12, 0),
      give48: Math.max(-net48, 0),
      receive48: Math.max(net48, 0),
      payCash: Math.max(cashNet, 0),
      receiveCash: Math.max(-cashNet, 0),
    };
  }, [v2Rows]);

  return {
    v2Query,
    v2Rows,
    v2Expanded,
    setV2Expanded,
    v2DayByDate,
    setV2DayByDate,
    balanceSummary,
    companySummary,
    refetchV2: v2Query.refetch,
    refetchCustomers: customersQuery.refetch,
  };
}
