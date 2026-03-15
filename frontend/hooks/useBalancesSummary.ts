import { useMemo } from "react";

import { useCompanyBalances } from "@/hooks/useCompanyBalances";
import { useCustomers } from "@/hooks/useCustomers";

export type BalanceBucket = { count: number; total: number };
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

export function useBalancesSummary() {
  const customersQuery = useCustomers();
  const companyBalancesQuery = useCompanyBalances();

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
    const net12 = Number(companyBalancesQuery.data?.company_cyl_12 ?? 0);
    const net48 = Number(companyBalancesQuery.data?.company_cyl_48 ?? 0);
    const cashNet = Number(companyBalancesQuery.data?.company_money ?? 0);
    return {
      give12: Math.max(-net12, 0),
      receive12: Math.max(net12, 0),
      give48: Math.max(-net48, 0),
      receive48: Math.max(net48, 0),
      payCash: Math.max(cashNet, 0),
      receiveCash: Math.max(-cashNet, 0),
    };
  }, [companyBalancesQuery.data]);

  return {
    balanceSummary,
    companySummary,
    companyBalancesQuery,
    refetchCustomers: customersQuery.refetch,
  };
}
