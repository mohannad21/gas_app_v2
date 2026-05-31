export type ActivityKind =
  | "replacement"
  | "sell_full"
  | "buy_empty_from_customer"
  | "payment_from_customer"
  | "payment_to_customer"
  | "customer_return_empties"
  | "adjust_customer_balance"
  | "refill"
  | "dist_return_empties"
  | "buy_full_from_company"
  | "payment_to_company"
  | "payment_from_company"
  | "adjust_company_balance"
  | "adjust_inventory"
  | "adjust_wallet"
  | "expense"
  | "bank_to_wallet"
  | "wallet_to_bank";

export const ALL_ACTIVITY_KINDS: readonly ActivityKind[] = [
  "replacement",
  "sell_full",
  "buy_empty_from_customer",
  "payment_from_customer",
  "payment_to_customer",
  "customer_return_empties",
  "adjust_customer_balance",
  "refill",
  "dist_return_empties",
  "buy_full_from_company",
  "payment_to_company",
  "payment_from_company",
  "adjust_company_balance",
  "adjust_inventory",
  "adjust_wallet",
  "expense",
  "bank_to_wallet",
  "wallet_to_bank",
];
