import { useEffect, useState } from "react";

export type AddMode = "customer_activities" | "company_activities" | "expenses" | "ledger_adjustments";
export type CustomerActivityFilter =
  | "replacement"
  | "late_payment"
  | "return_empties"
  | "payout"
  | "sell_full"
  | "buy_empty"
  | "adjustment";
export type CompanyActivityFilter = "refill" | "company_payment" | "received_from_company" | "buy_full" | "company_return" | "adjustment";
export type ExpensePrimaryFilter = "expense" | "wallet_to_bank" | "bank_to_wallet";
export type ExpenseCategoryFilter = string;
export type LedgerActivityFilter = "inventory_adjustment" | "cash_adjustment";

export function useActivityFilters() {
  const [mode, setMode] = useState<AddMode>("customer_activities");
  const [customerActivityFilter, setCustomerActivityFilter] = useState<CustomerActivityFilter | null>(null);
  const [companyActivityFilter, setCompanyActivityFilter] = useState<CompanyActivityFilter | null>(null);
  const [expensePrimaryFilter, setExpensePrimaryFilter] = useState<ExpensePrimaryFilter | null>(null);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<ExpenseCategoryFilter | null>(null);
  const [ledgerActivityFilter, setLedgerActivityFilter] = useState<LedgerActivityFilter | null>(null);

  // Reset expenseCategoryFilter when expensePrimaryFilter changes
  useEffect(() => {
    if (expensePrimaryFilter !== "expense") {
      setExpenseCategoryFilter(null);
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
