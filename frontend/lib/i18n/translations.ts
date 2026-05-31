export const translations = {
  en: {
    activities: {
      replacement:             { label: "Replace" },
      sell_full:               { label: "Sell full" },
      buy_empty_from_customer: { label: "Buy empties" },
      payment_from_customer:   { label: "Payment from customer" },
      payment_to_customer:     { label: "Payment to customer" },
      customer_return_empties: { label: "Empties from customer" },
      adjust_customer_balance: { label: "Adjust customer balance" },
      refill:                  { label: "Refill" },
      dist_return_empties:     { label: "Empties to company" },
      buy_full_from_company:   { label: "Buy fulls" },
      payment_to_company:      { label: "Payment to company" },
      payment_from_company:    { label: "Payment from company" },
      adjust_company_balance:  { label: "Adjust company balance" },
      adjust_inventory:        { label: "Adjust inventory" },
      adjust_wallet:           { label: "Adjust wallet" },
      expense:                 { label: "Expense" },
      bank_to_wallet:          { label: "Bank to wallet" },
      wallet_to_bank:          { label: "Wallet to bank" },
    },
    filterGroups: {
      customer: "Customer",
      company:  "Company",
      expenses: "Expenses",
      ledger:   "Ledger",
    },
  },
} as const;

type Translations = typeof translations;
type Language = keyof Translations;

let currentLang: Language = "en";

export function t(key: string): string | undefined {
  const parts = key.split(".");
  let node: any = translations[currentLang];
  for (const part of parts) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}
