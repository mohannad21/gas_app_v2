export const EVENT_COLOR_MAP: Record<string, string> = {
  order: "#0a7ea4",
  replacement: "#0a7ea4",
  sell_full: "#0a7ea4",
  buy_empty_from_customer: "#0a7ea4",
  refill: "#f97316",
  company_buy_iron: "#f59e0b",
  company_buy_full: "#f59e0b",
  buy_full_from_company: "#f59e0b",
  dist_return_empties: "#14b8a6",
  company_return_empties: "#14b8a6",
  expense: "#16a34a",
  init: "#8b5cf6",
  adjust: "#64748b",
  adjust_inventory: "#64748b",
  cash_adjust: "#64748b",
  adjust_wallet: "#64748b",
  collection_money: "#22c55e",
  payment_from_customer: "#22c55e",
  collection_payout: "#ef4444",
  collection_empty: "#14b8a6",
  customer_return_empties: "#14b8a6",
  company_payment: "#2563eb",
  payment_to_company: "#2563eb",
  company_adjustment: "#64748b",
  adjust_company_balance: "#64748b",
  customer_adjust: "#64748b",
  adjust_customer_balance: "#64748b",
  bank_deposit: "#0ea5e9",
};

export function getEventColor(eventType: string): string {
  return EVENT_COLOR_MAP[eventType] ?? "#0a7ea4";
}

