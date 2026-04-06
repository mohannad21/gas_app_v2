import {
  BankDeposit,
  CashAdjustment,
  CollectionEvent,
  CompanyPayment,
  CustomerAdjustment,
  DailyReportV2Event,
  Expense,
  InventoryAdjustment,
  InventoryRefillSummary,
  Order,
} from "@/types/domain";
import { makeBalanceTransition } from "@/lib/balanceTransitions";

const BASE: Pick<DailyReportV2Event, "cash_before" | "cash_after"> = {
  cash_before: 0,
  cash_after: 0,
};

export function getCompanyInventoryTotals(refill: InventoryRefillSummary) {
  return {
    buy12: Number(refill.buy12 ?? 0) + Number(refill.new12 ?? 0),
    buy48: Number(refill.buy48 ?? 0) + Number(refill.new48 ?? 0),
    return12: Number(refill.return12 ?? 0),
    return48: Number(refill.return48 ?? 0),
  };
}

export function getCompanyInventoryEventType(refill: InventoryRefillSummary) {
  const totals = getCompanyInventoryTotals(refill);
  const totalBuys = totals.buy12 + totals.buy48;
  const totalReturns = totals.return12 + totals.return48;

  if (totalBuys > 0 && totalReturns === 0) return "company_buy_iron" as const;
  if (totalBuys === 0 && totalReturns > 0) return "collection_empty" as const;
  return "refill" as const;
}

export function getCompanyInventoryEditTab(refill: InventoryRefillSummary) {
  const eventType = getCompanyInventoryEventType(refill);
  if (eventType === "company_buy_iron") return "buy" as const;
  if (eventType === "collection_empty") return "return" as const;
  return "refill" as const;
}

export function orderToEvent(
  order: Order,
  opts?: { customerName?: string; customerDescription?: string | null; systemName?: string }
): DailyReportV2Event {
  const mode = order.order_mode ?? "replacement";
  const modeLabel =
    mode === "sell_iron" ? "Sell full" : mode === "buy_iron" ? "Buy empty" : "Replacement";
  const installed = order.cylinders_installed ?? 0;
  const received = order.cylinders_received ?? 0;
  const gas = order.gas_type ?? "12kg";

  let heroText: string | null = null;
  if (mode === "replacement" && installed > 0) {
    heroText = `Installed ${installed}x${gas}${received > 0 ? ` | Received ${received} empties` : ""}`;
  } else if (mode === "sell_iron" && installed > 0) {
    heroText = `Sold ${installed}x${gas}`;
  } else if (mode === "buy_iron") {
    const qty = received > 0 ? received : installed;
    if (qty > 0) heroText = `Bought ${qty}x${gas} empties`;
  }

  const unpaid = Math.max(0, (order.price_total ?? 0) - (order.paid_amount ?? 0));
  const moneyDelta = order.paid_amount ?? 0;

  const transitions = [];
  if ((order.debt_cash ?? 0) !== 0) {
    transitions.push(makeBalanceTransition("customer", "money", 0, order.debt_cash ?? 0));
  }
  if ((order.debt_cylinders_12 ?? 0) !== 0) {
    transitions.push(makeBalanceTransition("customer", "cyl_12", 0, order.debt_cylinders_12 ?? 0));
  }
  if ((order.debt_cylinders_48 ?? 0) !== 0) {
    transitions.push(makeBalanceTransition("customer", "cyl_48", 0, order.debt_cylinders_48 ?? 0));
  }

  return {
    ...BASE,
    event_type: "order",
    id: order.id,
    effective_at: order.delivered_at,
    created_at: order.created_at,
    order_mode: mode,
    gas_type: gas,
    order_installed: installed,
    order_received: received,
    order_total: order.price_total ?? 0,
    order_paid: order.paid_amount ?? 0,
    money_amount: moneyDelta > 0 ? moneyDelta : null,
    money_direction: moneyDelta > 0 ? "in" : null,
    money_delta: moneyDelta > 0 ? moneyDelta : null,
    context_line: "Order",
    display_name: opts?.customerName ?? null,
    display_description: opts?.customerDescription ?? null,
    customer_name: opts?.customerName ?? null,
    customer_description: opts?.customerDescription ?? null,
    system_name: opts?.systemName ?? null,
    hero_text: heroText,
    note: order.note ?? null,
    label: modeLabel,
    counterparty: opts?.customerName
      ? { type: "customer", display_name: opts.customerName, description: opts.customerDescription ?? null, display: null }
      : null,
    balance_transitions: transitions.length > 0 ? transitions : null,
    status: unpaid === 0 && (order.debt_cylinders_12 ?? 0) === 0 && (order.debt_cylinders_48 ?? 0) === 0 ? "atomic_ok" : "needs_action",
  };
}

export function collectionToEvent(
  col: CollectionEvent,
  opts?: { customerName?: string; customerDescription?: string | null }
): DailyReportV2Event {
  const actionType = col.action_type;
  const amount = col.amount_money ?? 0;
  const qty12 = col.qty_12kg ?? 0;
  const qty48 = col.qty_48kg ?? 0;

  let eventType: string;
  let contextLine: string;
  let heroText: string | null = null;
  let moneyDirection: "in" | "out" | null = null;
  let moneyDelta: number | null = null;

  if (actionType === "payment") {
    eventType = "collection_money";
    contextLine = "Collection";
    if (amount > 0) {
      heroText = `Payment ${amount.toFixed(0)}`;
      moneyDirection = "in";
      moneyDelta = amount;
    }
  } else if (actionType === "payout") {
    eventType = "collection_payout";
    contextLine = "Payout";
    if (amount > 0) {
      heroText = `Payout ${amount.toFixed(0)}`;
      moneyDirection = "out";
      moneyDelta = amount;
    }
  } else {
    eventType = "collection_empty";
    contextLine = "Return empties";
    const parts: string[] = [];
    if (qty12 > 0) parts.push(`${qty12}x12kg`);
    if (qty48 > 0) parts.push(`${qty48}x48kg`);
    heroText = parts.length > 0 ? `Returned ${parts.join(" | ")} empties` : "Returned empties";
  }

  const transitions = [];
  if ((col.debt_cash ?? 0) !== 0) {
    transitions.push(makeBalanceTransition("customer", "money", 0, col.debt_cash ?? 0));
  }
  if ((col.debt_cylinders_12 ?? 0) !== 0) {
    transitions.push(makeBalanceTransition("customer", "cyl_12", 0, col.debt_cylinders_12 ?? 0));
  }
  if ((col.debt_cylinders_48 ?? 0) !== 0) {
    transitions.push(makeBalanceTransition("customer", "cyl_48", 0, col.debt_cylinders_48 ?? 0));
  }

  return {
    ...BASE,
    event_type: eventType,
    id: col.id,
    effective_at: col.effective_at ?? col.created_at,
    created_at: col.created_at,
    context_line: contextLine,
    display_name: opts?.customerName ?? null,
    display_description: opts?.customerDescription ?? null,
    customer_name: opts?.customerName ?? null,
    customer_description: opts?.customerDescription ?? null,
    hero_text: heroText,
    note: col.note ?? null,
    money_amount: moneyDelta ?? null,
    money_direction: moneyDirection ?? null,
    money_delta: moneyDelta ?? null,
    return12: actionType === "return" ? qty12 : null,
    return48: actionType === "return" ? qty48 : null,
    counterparty: opts?.customerName
      ? { type: "customer", display_name: opts.customerName, description: opts.customerDescription ?? null, display: null }
      : null,
    balance_transitions: transitions.length > 0 ? transitions : null,
    label: contextLine,
  };
}

export function customerAdjustmentToEvent(
  adj: CustomerAdjustment,
  opts?: { customerName?: string; customerDescription?: string | null }
): DailyReportV2Event {
  const money = adj.amount_money ?? 0;
  const qty12 = adj.count_12kg ?? 0;
  const qty48 = adj.count_48kg ?? 0;

  const parts: string[] = [];
  if (money !== 0) parts.push(`Money ${money > 0 ? "+" : ""}${money.toFixed(0)}`);
  if (qty12 !== 0) parts.push(`12kg ${qty12 > 0 ? "+" : ""}${qty12}`);
  if (qty48 !== 0) parts.push(`48kg ${qty48 > 0 ? "+" : ""}${qty48}`);

  const transitions = [];
  if ((adj.debt_cash ?? 0) !== 0) {
    transitions.push(makeBalanceTransition("customer", "money", 0, adj.debt_cash ?? 0));
  }
  if ((adj.debt_cylinders_12 ?? 0) !== 0) {
    transitions.push(makeBalanceTransition("customer", "cyl_12", 0, adj.debt_cylinders_12 ?? 0));
  }
  if ((adj.debt_cylinders_48 ?? 0) !== 0) {
    transitions.push(makeBalanceTransition("customer", "cyl_48", 0, adj.debt_cylinders_48 ?? 0));
  }

  return {
    ...BASE,
    event_type: "customer_adjust",
    id: adj.id,
    effective_at: adj.effective_at,
    created_at: adj.created_at,
    context_line: "Adjustment",
    display_name: opts?.customerName ?? null,
    display_description: opts?.customerDescription ?? null,
    customer_name: opts?.customerName ?? null,
    customer_description: opts?.customerDescription ?? null,
    hero_text: parts.length > 0 ? parts.join(" | ") : "Manual adjustment",
    reason: adj.reason ?? null,
    note: adj.reason ?? null,
    counterparty: opts?.customerName
      ? { type: "customer", display_name: opts.customerName, description: opts.customerDescription ?? null, display: null }
      : null,
    balance_transitions: transitions.length > 0 ? transitions : null,
    label: "Adjustment",
  };
}

export function refillSummaryToEvent(refill: InventoryRefillSummary): DailyReportV2Event {
  const totals = getCompanyInventoryTotals(refill);
  const eventType = getCompanyInventoryEventType(refill);
  const parts: string[] = [];
  if (totals.buy12 > 0) parts.push(`Buy ${totals.buy12}x12kg`);
  if (totals.buy48 > 0) parts.push(`Buy ${totals.buy48}x48kg`);
  if (totals.return12 > 0) parts.push(`Return ${totals.return12}x12kg`);
  if (totals.return48 > 0) parts.push(`Return ${totals.return48}x48kg`);

  const contextLine =
    eventType === "company_buy_iron"
      ? "Buy full"
      : eventType === "collection_empty"
        ? "Return empties"
        : "Refill";

  return {
    ...BASE,
    event_type: eventType,
    id: refill.refill_id,
    effective_at: refill.effective_at,
    created_at: refill.effective_at,
    context_line: contextLine,
    label: contextLine,
    hero_text: parts.length > 0 ? parts.join(" | ") : null,
    buy12: totals.buy12,
    return12: totals.return12,
    buy48: totals.buy48,
    return48: totals.return48,
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
  };
}

export function companyPaymentToEvent(payment: CompanyPayment): DailyReportV2Event {
  const amount = payment.amount ?? 0;
  return {
    ...BASE,
    event_type: "company_payment",
    id: payment.id,
    effective_at: payment.happened_at,
    created_at: payment.happened_at,
    context_line: "Company Payment",
    label: "Company Payment",
    money_amount: Math.abs(amount),
    money_direction: amount >= 0 ? "out" : "in",
    money_delta: Math.abs(amount),
    hero_text: amount !== 0 ? `Amount ${Math.abs(amount).toFixed(0)}` : null,
    note: payment.note ?? null,
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
  };
}

export function expenseToEvent(expense: Expense): DailyReportV2Event {
  return {
    ...BASE,
    event_type: "expense",
    id: expense.id,
    effective_at: expense.created_at ?? expense.date,
    created_at: expense.created_at ?? expense.date,
    context_line: "Expense",
    label: "Expense",
    expense_type: expense.expense_type,
    money_amount: expense.amount,
    money_direction: "out",
    money_delta: expense.amount,
    note: expense.note ?? null,
    display_name: expense.expense_type,
    hero_text: expense.amount != null ? `${expense.amount.toFixed(0)}` : null,
  };
}

export function bankDepositToEvent(deposit: BankDeposit): DailyReportV2Event {
  const isOut = deposit.direction === "wallet_to_bank";
  const label = isOut ? "Wallet to Bank" : "Bank to Wallet";
  return {
    ...BASE,
    event_type: "bank_deposit",
    id: deposit.id,
    effective_at: deposit.happened_at,
    created_at: deposit.happened_at,
    context_line: label,
    label,
    display_name: label,
    money_amount: Math.abs(deposit.amount),
    money_direction: isOut ? "out" : "in",
    money_delta: Math.abs(deposit.amount),
    hero_text: `${Math.abs(deposit.amount).toFixed(0)}`,
    note: deposit.note ?? null,
  };
}

export function inventoryAdjustmentToEvent(adj: InventoryAdjustment): DailyReportV2Event {
  const gas = adj.gas_type ?? "12kg";
  const heroText = `${gas}: full ${adj.delta_full > 0 ? "+" : ""}${adj.delta_full} empty ${adj.delta_empty > 0 ? "+" : ""}${adj.delta_empty}`;
  return {
    ...BASE,
    event_type: "adjust",
    id: adj.id,
    effective_at: adj.effective_at,
    created_at: adj.created_at,
    context_line: "Inventory Adjustment",
    label: "Inventory Adjustment",
    gas_type: gas,
    reason: adj.reason ?? null,
    hero_text: heroText,
    note: adj.reason ?? null,
  };
}

export function cashAdjustmentToEvent(adj: CashAdjustment): DailyReportV2Event {
  const delta = adj.delta_cash ?? 0;
  return {
    ...BASE,
    event_type: "cash_adjust",
    id: adj.id,
    effective_at: adj.effective_at,
    created_at: adj.created_at,
    context_line: "Wallet Adjustment",
    label: "Wallet Adjustment",
    money_amount: Math.abs(delta),
    money_direction: delta >= 0 ? "in" : "out",
    money_delta: Math.abs(delta),
    reason: adj.reason ?? null,
    hero_text: adj.reason ?? `Amount ${delta > 0 ? "+" : ""}${delta.toFixed(0)}`,
    note: adj.reason ?? null,
  };
}
