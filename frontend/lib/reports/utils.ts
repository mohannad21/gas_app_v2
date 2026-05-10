import { EVENT_LABELS } from "@/lib/eventLabels";

export function formatEventType(type: string, orderMode?: string | null, direction?: string | null) {
  if (type === "order") {
    const resolvedMode = orderMode || "replacement";
    if (resolvedMode === "replacement") return EVENT_LABELS.ORDER_REPLACEMENT;
    if (resolvedMode === "sell_iron") return EVENT_LABELS.ORDER_SELL_FULL;
    if (resolvedMode === "buy_iron") return EVENT_LABELS.ORDER_BUY_EMPTY;
    return EVENT_LABELS.ORDER_REPLACEMENT;
  }
  if (type === "collection_money") return EVENT_LABELS.COLLECTION_MONEY;
  if (type === "collection_payout") return EVENT_LABELS.COLLECTION_PAYOUT;
  if (type === "collection_empty") return EVENT_LABELS.COLLECTION_EMPTY;
  if (type === "refill") return EVENT_LABELS.REFILL;
  if (type === "company_payment") return direction === "in" ? EVENT_LABELS.COMPANY_PAYMENT_IN : EVENT_LABELS.COMPANY_PAYMENT_OUT;
  if (type === "company_buy_iron") return EVENT_LABELS.COMPANY_BUY_FULL;
  if (type === "cash_adjust") return EVENT_LABELS.WALLET_ADJUSTMENT;
  if (type === "adjust") return EVENT_LABELS.INVENTORY_ADJUSTMENT;
  if (type === "customer_adjust") return EVENT_LABELS.CUSTOMER_ADJUSTMENT;
  if (type === "company_adjustment") return EVENT_LABELS.COMPANY_ADJUSTMENT;
  if (type === "init_balance") return EVENT_LABELS.OPENING_BALANCE;
  if (type === "init_credit") return EVENT_LABELS.OPENING_BALANCE;
  if (type === "init_return") return EVENT_LABELS.OPENING_BALANCE;
  if (type === "init") return EVENT_LABELS.OPENING_BALANCE;
  return type
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function getInitInventoryAfter(events: any[]) {
  const out: { full12?: number; empty12?: number; full48?: number; empty48?: number } = {};
  events.forEach((ev) => {
    if (String(ev?.event_type ?? ev?.type ?? ev?.source_type) !== "init") return;
    const after = ev?.inventory_after ?? {};
    if (after.full12 != null) out.full12 = after.full12;
    if (after.empty12 != null) out.empty12 = after.empty12;
    if (after.full48 != null) out.full48 = after.full48;
    if (after.empty48 != null) out.empty48 = after.empty48;
  });
  return Object.keys(out).length ? out : null;
}

