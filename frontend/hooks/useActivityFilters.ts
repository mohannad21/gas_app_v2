import { useEffect, useState } from "react";

export type AddMode = "customer_activities" | "company_activities" | "expenses" | "ledger_adjustments";
export type CustomerActivityFilter = "all" | "replacement" | "payment" | "return" | "buy_empty" | "sell_full" | "adjustments";
export type CompanyActivityFilter = "all" | "refill" | "company_payment" | "buy_full";
export type ExpensePrimaryFilter = "all" | "expense" | "bank_deposit";
export type ExpenseCategoryFilter = "all_categories" | "fuel" | "food" | "car_test" | "car_repair" | "car_insurance" | "others";
export type LedgerActivityFilter = "all" | "inventory_adjust" | "cash_adjust" | "wallet_to_bank" | "bank_to_wallet";

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
