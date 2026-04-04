import { useEffect, useState } from "react";

export type AddMode = "customer_activities" | "company_activities" | "expenses" | "ledger_adjustments";
export type CustomerActivityFilter =
  | "all"
  | "replacement"
  | "late_payment"
  | "return_empties"
  | "payout"
  | "sell_full"
  | "buy_empty"
  | "adjustment";
export type CompanyActivityFilter = "all" | "refill" | "company_payment" | "buy_full";
export type ExpensePrimaryFilter = "all" | "expense" | "wallet_to_bank" | "bank_to_wallet";
export type ExpenseCategoryFilter = "all_categories" | string;
export type LedgerActivityFilter = "all" | "inventory_adjustment" | "cash_adjustment";

export function useActivityFilters() {
  const [mode, setMode] = useState<AddMode>("customer_activities");
  const [customerActivityFilter, setCustomerActivityFilter] = useState<CustomerActivityFilter>("all");
  const [companyActivityFilter, setCompanyActivityFilter] = useState<CompanyActivityFilter>("all");
  const [expensePrimaryFilter, setExpensePrimaryFilter] = useState<ExpensePrimaryFilter>("all");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<ExpenseCategoryFilter>("all_categories");
  const [ledgerActivityFilter, setLedgerActivityFilter] = useState<LedgerActivityFilter>("all");

  // Reset expenseCategoryFilter when expensePrimaryFilter changes
  useEffect(() => {
    if (expensePrimaryFilter !== "expense") {
      setExpenseCategoryFilter("all_categories");
    }
  }, [expensePrimaryFilter]);

  return {
    mode,
    setMode,
    customerActivityFilter,
    setCustomerActivityFilter,
    companyActivityFilter,
    setCompanyActivityFilter,
    expensePrimaryFilter,
    setExpensePrimaryFilter,
    expenseCategoryFilter,
    setExpenseCategoryFilter,
    ledgerActivityFilter,
    setLedgerActivityFilter,
  };
}
