export const EVENT_COLOR_MAP: Record<string, string> = {
  order: "#0a7ea4",
  refill: "#f97316",
  expense: "#16a34a",
  init: "#8b5cf6",
  adjust: "#64748b",
  cash_adjust: "#64748b",
  collection_money: "#22c55e",
  collection_payout: "#ef4444",
  collection_empty: "#14b8a6",
  company_payment: "#2563eb",
  company_buy_iron: "#f59e0b",
  bank_deposit: "#0ea5e9",
};

export function getEventColor(eventType: string): string {
  return EVENT_COLOR_MAP[eventType] ?? "#0a7ea4";
}

