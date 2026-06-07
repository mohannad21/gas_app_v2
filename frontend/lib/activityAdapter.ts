import {
  BankDeposit,
  CashAdjustment,
  CollectionEvent,
  CompanyBalanceAdjustment,
  CompanyPayment,
  CustomerAdjustment,
  DailyReportEvent,
  Expense,
  InventoryAdjustment,
  InventoryRefillSummary,
  Order,
} from "@/types/domain";
import { makeBalanceTransition } from "@/lib/balanceTransitions";
import { getActivityEventLabel } from "@/lib/activityKindMeta";
import { formatDisplayMoney, getCurrencySymbol } from "@/lib/money";

const BASE: Pick<DailyReportEvent, "wallet_before" | "wallet_after"> = {
  wallet_before: 0,
  wallet_after: 0,
};

const EVENT_LABELS = {
  ORDER_REPLACEMENT: getActivityEventLabel("replacement"),
  ORDER_SELL_FULL: getActivityEventLabel("sell_full"),
  ORDER_BUY_EMPTY: getActivityEventLabel("buy_empty_from_customer"),
  COLLECTION_MONEY: getActivityEventLabel("payment_from_customer"),
  COLLECTION_PAYOUT: getActivityEventLabel("payment_to_customer"),
  COLLECTION_EMPTY: getActivityEventLabel("customer_return_empties"),
  CUSTOMER_ADJUSTMENT: getActivityEventLabel("adjust_customer_balance"),
  REFILL: getActivityEventLabel("refill"),
  COMPANY_PAYMENT_OUT: getActivityEventLabel("payment_to_company"),
  COMPANY_PAYMENT_IN: getActivityEventLabel("payment_from_company"),
  COMPANY_BUY_FULL: getActivityEventLabel("buy_full_from_company"),
  COMPANY_RETURN: getActivityEventLabel("dist_return_empties"),
  COMPANY_ADJUSTMENT: getActivityEventLabel("adjust_company_balance"),
  EXPENSE: getActivityEventLabel("expense"),
  INVENTORY_ADJUSTMENT: getActivityEventLabel("adjust_inventory"),
  WALLET_ADJUSTMENT: getActivityEventLabel("adjust_wallet"),
} as const;

function getCylinderSnapshot(record: Record<string, number> | null | undefined, gas: "12kg" | "48kg") {
  if (!record) return null;
  if (typeof record[gas] === "number") return record[gas];
  const shortKey = gas === "12kg" ? "12" : "48";
  if (typeof record[shortKey] === "number") return record[shortKey];
  return null;
}

function pushTransition(
  transitions: NonNullable<DailyReportEvent["balance_transitions"]>,
  scope: "customer" | "company",
  component: "money" | "cyl_12" | "cyl_48",
  before: number,
  after: number
) {
  if (Math.abs(before) < 0.01 && Math.abs(after) < 0.01) return;
  transitions.push(makeBalanceTransition(scope, component, before, after));
}

export function getCompanyInventoryTotals(refill: InventoryRefillSummary) {
  return {
    buy12: Number(refill.buy12 ?? 0),
    buy48: Number(refill.buy48 ?? 0),
    return12: Number(refill.return12 ?? 0),
    return48: Number(refill.return48 ?? 0),
  };
}

export function getCompanyInventoryEventType(refill: InventoryRefillSummary) {
  if (refill.kind === "buy_full_from_company") return "buy_full_from_company" as const;
  if (refill.kind === "dist_return_empties") return "dist_return_empties" as const;
  return "refill" as const;
}

export function getCompanyInventoryEditTab(refill: InventoryRefillSummary) {
  const eventType = getCompanyInventoryEventType(refill);
  if (eventType === "buy_full_from_company") return "buy" as const;
  if (eventType === "dist_return_empties") return "return" as const;
  return "refill" as const;
}

export function orderToEvent(
  order: Order,
  opts?: { customerName?: string; customerDescription?: string | null; systemName?: string }
): DailyReportEvent {
  const mode = order.order_mode ?? "replacement";
  const modeLabel =
    mode === "sell_iron" ? EVENT_LABELS.ORDER_SELL_FULL : mode === "buy_iron" ? EVENT_LABELS.ORDER_BUY_EMPTY : EVENT_LABELS.ORDER_REPLACEMENT;
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
  const cylinderDelta = mode === "replacement" ? installed - received : 0;
  const moneyAfter = Number(order.money_balance_after ?? order.debt_cash ?? 0);
  const moneyBefore =
    order.money_balance_before != null
      ? Number(order.money_balance_before)
      : moneyAfter -
        (mode === "buy_iron"
          ? (order.paid_amount ?? 0) - (order.price_total ?? 0)
          : (order.price_total ?? 0) - (order.paid_amount ?? 0));
  const cyl12After =
    getCylinderSnapshot(order.cyl_balance_after ?? null, "12kg") ?? Number(order.debt_cylinders_12 ?? 0);
  const cyl48After =
    getCylinderSnapshot(order.cyl_balance_after ?? null, "48kg") ?? Number(order.debt_cylinders_48 ?? 0);
  const cyl12Before =
    getCylinderSnapshot(order.cyl_balance_before ?? null, "12kg") ??
    (gas === "12kg" ? cyl12After - cylinderDelta : cyl12After);
  const cyl48Before =
    getCylinderSnapshot(order.cyl_balance_before ?? null, "48kg") ??
    (gas === "48kg" ? cyl48After - cylinderDelta : cyl48After);

  const transitions: NonNullable<DailyReportEvent["balance_transitions"]> = [];
  pushTransition(transitions, "customer", "money", moneyBefore, moneyAfter);
  pushTransition(transitions, "customer", "cyl_12", cyl12Before, cyl12After);
  pushTransition(transitions, "customer", "cyl_48", cyl48Before, cyl48After);

  const orderEventType =
    mode === "sell_iron" ? "sell_full" as const :
    mode === "buy_iron" ? "buy_empty_from_customer" as const :
    "replacement" as const;

  return {
    ...BASE,
    event_type: orderEventType,
    id: order.id,
    effective_at: order.delivered_at,
    created_at: order.created_at,
    order_mode: mode,
    gas_type: gas,
    order_installed: installed,
    order_received: received,
    order_total: order.price_total ?? 0,
    order_paid: order.paid_amount ?? 0,
    customer_money_before: moneyBefore,
    customer_money_after: moneyAfter,
    customer_12kg_before: cyl12Before,
    customer_12kg_after: cyl12After,
    customer_48kg_before: cyl48Before,
    customer_48kg_after: cyl48After,
    money_amount: moneyDelta > 0 ? moneyDelta : null,
    money_direction: moneyDelta > 0 ? (mode === "buy_iron" ? "out" : "in") : null,
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
    balance_transitions: transitions,
    status: unpaid === 0 && (order.debt_cylinders_12 ?? 0) === 0 && (order.debt_cylinders_48 ?? 0) === 0 ? "atomic_ok" : "needs_action",
  };
}

export function collectionToEvent(
  col: CollectionEvent,
  opts?: { customerName?: string; customerDescription?: string | null }
): DailyReportEvent {
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
    eventType = "payment_from_customer";
    contextLine = EVENT_LABELS.COLLECTION_MONEY;
    if (amount > 0) {
      heroText = `Payment ${formatDisplayMoney(amount)}`;
      moneyDirection = "in";
      moneyDelta = amount;
    }
  } else if (actionType === "payout") {
    eventType = "payment_to_customer";
    contextLine = EVENT_LABELS.COLLECTION_PAYOUT;
    if (amount > 0) {
      heroText = `Payout ${formatDisplayMoney(amount)}`;
      moneyDirection = "out";
      moneyDelta = amount;
    }
  } else {
    eventType = "customer_return_empties";
    contextLine = EVENT_LABELS.COLLECTION_EMPTY;
    const parts: string[] = [];
    if (qty12 > 0) parts.push(`${qty12}x12kg`);
    if (qty48 > 0) parts.push(`${qty48}x48kg`);
    heroText = parts.length > 0 ? `Returned ${parts.join(" | ")} empties` : EVENT_LABELS.COLLECTION_EMPTY;
  }

  const moneyAfter =
    col.live_debt_cash != null ? col.live_debt_cash : Number(col.debt_cash ?? 0);
  const cyl12After =
    col.live_debt_cylinders_12 != null
      ? col.live_debt_cylinders_12
      : Number(col.debt_cylinders_12 ?? 0);
  const cyl48After =
    col.live_debt_cylinders_48 != null
      ? col.live_debt_cylinders_48
      : Number(col.debt_cylinders_48 ?? 0);
  const moneyBefore =
    actionType === "payment" ? moneyAfter + amount : actionType === "payout" ? moneyAfter - amount : moneyAfter;
  const cyl12Before = actionType === "return" ? cyl12After + qty12 : cyl12After;
  const cyl48Before = actionType === "return" ? cyl48After + qty48 : cyl48After;

  const transitions: NonNullable<DailyReportEvent["balance_transitions"]> = [];
  pushTransition(transitions, "customer", "money", moneyBefore, moneyAfter);
  pushTransition(transitions, "customer", "cyl_12", cyl12Before, cyl12After);
  pushTransition(transitions, "customer", "cyl_48", cyl48Before, cyl48After);

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
    customer_money_before: moneyBefore,
    customer_money_after: moneyAfter,
    customer_12kg_before: cyl12Before,
    customer_12kg_after: cyl12After,
    customer_48kg_before: cyl48Before,
    customer_48kg_after: cyl48After,
    money_amount: moneyDelta ?? null,
    money_direction: moneyDirection ?? null,
    money_delta: moneyDelta ?? null,
    return12: actionType === "return" ? qty12 : null,
    return48: actionType === "return" ? qty48 : null,
    counterparty: opts?.customerName
      ? { type: "customer", display_name: opts.customerName, description: opts.customerDescription ?? null, display: null }
      : null,
    balance_transitions: transitions,
    label: contextLine,
  };
}

export function customerAdjustmentToEvent(
  adj: CustomerAdjustment,
  opts?: { customerName?: string; customerDescription?: string | null }
): DailyReportEvent {
  const money = adj.amount_money ?? 0;
  const qty12 = adj.count_12kg ?? 0;
  const qty48 = adj.count_48kg ?? 0;

  const moneyAfter =
    adj.live_debt_cash != null ? adj.live_debt_cash : Number(adj.debt_cash ?? 0);
  const cyl12After =
    adj.live_debt_cylinders_12 != null
      ? adj.live_debt_cylinders_12
      : Number(adj.debt_cylinders_12 ?? 0);
  const cyl48After =
    adj.live_debt_cylinders_48 != null
      ? adj.live_debt_cylinders_48
      : Number(adj.debt_cylinders_48 ?? 0);
  const moneyBefore = moneyAfter - money;
  const cyl12Before = cyl12After - qty12;
  const cyl48Before = cyl48After - qty48;

  const transitions: NonNullable<DailyReportEvent["balance_transitions"]> = [];
  pushTransition(transitions, "customer", "money", moneyBefore, moneyAfter);
  pushTransition(transitions, "customer", "cyl_12", cyl12Before, cyl12After);
  pushTransition(transitions, "customer", "cyl_48", cyl48Before, cyl48After);

  return {
    ...BASE,
    event_type: "adjust_customer_balance",
    id: adj.id,
    effective_at: adj.effective_at,
    created_at: adj.created_at,
    context_line: EVENT_LABELS.CUSTOMER_ADJUSTMENT,
    display_name: opts?.customerName ?? null,
    display_description: opts?.customerDescription ?? null,
    customer_name: opts?.customerName ?? null,
    customer_description: opts?.customerDescription ?? null,
    hero_text: null,
    reason: adj.reason ?? null,
    note: adj.reason ?? null,
    customer_money_before: moneyBefore,
    customer_money_after: moneyAfter,
    customer_12kg_before: cyl12Before,
    customer_12kg_after: cyl12After,
    customer_48kg_before: cyl48Before,
    customer_48kg_after: cyl48After,
    counterparty: opts?.customerName
      ? { type: "customer", display_name: opts.customerName, description: opts.customerDescription ?? null, display: null }
      : null,
    balance_transitions: transitions,
    label: EVENT_LABELS.CUSTOMER_ADJUSTMENT,
  };
}

export function companyBalanceAdjustmentToEvent(adj: CompanyBalanceAdjustment): DailyReportEvent {
  const parts: string[] = [];
  const moneyDelta = Number(adj.delta_money ?? 0);
  const cyl12Delta = Number(adj.delta_cylinder_12 ?? 0);
  const cyl48Delta = Number(adj.delta_cylinder_48 ?? 0);
  const moneyAfter = adj.live_debt_cash != null ? adj.live_debt_cash : Number(adj.money_balance ?? 0);
  const cyl12After =
    adj.live_debt_cylinders_12 != null
      ? adj.live_debt_cylinders_12
      : Number(adj.cylinder_balance_12 ?? 0);
  const cyl48After =
    adj.live_debt_cylinders_48 != null
      ? adj.live_debt_cylinders_48
      : Number(adj.cylinder_balance_48 ?? 0);
  const moneyBefore = moneyAfter - moneyDelta;
  const cyl12Before = cyl12After - cyl12Delta;
  const cyl48Before = cyl48After - cyl48Delta;
  const transitions: NonNullable<DailyReportEvent["balance_transitions"]> = [];

  pushTransition(transitions, "company", "money", moneyBefore, moneyAfter);
  pushTransition(transitions, "company", "cyl_12", cyl12Before, cyl12After);
  pushTransition(transitions, "company", "cyl_48", cyl48Before, cyl48After);

  if (moneyDelta !== 0) parts.push(`Money ${formatDisplayMoney(Math.abs(moneyDelta))}`);
  if (cyl12Delta !== 0) parts.push(`12kg ${Math.abs(cyl12Delta)}`);
  if (cyl48Delta !== 0) parts.push(`48kg ${Math.abs(cyl48Delta)}`);

  return {
    ...BASE,
    event_type: "adjust_company_balance",
    id: adj.id,
    effective_at: adj.happened_at,
    created_at: adj.created_at ?? adj.happened_at,
    context_line: EVENT_LABELS.COMPANY_ADJUSTMENT,
    label: EVENT_LABELS.COMPANY_ADJUSTMENT,
    hero_text: parts.length > 0 ? parts.join(" | ") : null,
    note: adj.note ?? null,
    company_before: moneyBefore,
    company_after: moneyAfter,
    company_12kg_before: cyl12Before,
    company_12kg_after: cyl12After,
    company_48kg_before: cyl48Before,
    company_48kg_after: cyl48After,
    balance_transitions: transitions,
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
  };
}

export function refillSummaryToEvent(refill: InventoryRefillSummary): DailyReportEvent {
  const totals = getCompanyInventoryTotals(refill);
  const eventType = getCompanyInventoryEventType(refill);
  const parts: string[] = [];
  if (totals.buy12 > 0) parts.push(`Buy ${totals.buy12}x12kg`);
  if (totals.buy48 > 0) parts.push(`Buy ${totals.buy48}x48kg`);
  if (totals.return12 > 0) parts.push(`Return ${totals.return12}x12kg`);
  if (totals.return48 > 0) parts.push(`Return ${totals.return48}x48kg`);

  const contextLine =
    eventType === "buy_full_from_company"
      ? EVENT_LABELS.COMPANY_BUY_FULL
      : eventType === "dist_return_empties"
        ? EVENT_LABELS.COMPANY_RETURN
        : EVENT_LABELS.REFILL;

  const transitions: NonNullable<DailyReportEvent["balance_transitions"]> = [];
  const moneyAfter = refill.live_debt_cash != null ? refill.live_debt_cash : Number(refill.debt_cash ?? 0);
  const moneyDelta = Number(refill.total_cost ?? 0) - Number(refill.paid_amount ?? 0);
  const moneyBefore = moneyAfter - moneyDelta;
  let cyl12Before = 0;
  let cyl12After = 0;
  let cyl48Before = 0;
  let cyl48After = 0;

  cyl12After =
    refill.live_debt_cylinders_12 != null
      ? refill.live_debt_cylinders_12
      : Number(refill.debt_cylinders_12 ?? 0);
  cyl48After =
    refill.live_debt_cylinders_48 != null
      ? refill.live_debt_cylinders_48
      : Number(refill.debt_cylinders_48 ?? 0);

  pushTransition(transitions, "company", "money", moneyBefore, moneyAfter);

  if (eventType !== "buy_full_from_company") {
    cyl12Before = cyl12After - totals.return12 + totals.buy12;
    cyl48Before = cyl48After - totals.return48 + totals.buy48;
  } else {
    // Buying new shells changes company money, but not the tracked company cylinder debt.
    cyl12Before = cyl12After;
    cyl48Before = cyl48After;
  }

  pushTransition(transitions, "company", "cyl_12", cyl12Before, cyl12After);
  pushTransition(transitions, "company", "cyl_48", cyl48Before, cyl48After);

  return {
    ...BASE,
    event_type: eventType,
    id: refill.refill_id,
    effective_at: refill.effective_at,
    created_at: refill.created_at ?? refill.effective_at,
    context_line: contextLine,
    label: contextLine,
    hero_text: parts.length > 0 ? parts.join(" | ") : null,
    total_cost: Number(refill.total_cost ?? 0),
    paid_amount: Number(refill.paid_amount ?? 0),
    buy12: totals.buy12,
    return12: totals.return12,
    buy48: totals.buy48,
    return48: totals.return48,
    company_before: moneyBefore,
    company_after: moneyAfter,
    balance_transitions: transitions.length > 0 ? transitions : undefined,
    company_12kg_before: cyl12Before,
    company_12kg_after: cyl12After,
    company_48kg_before: cyl48Before,
    company_48kg_after: cyl48After,
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
  };
}

export function companyPaymentToEvent(payment: CompanyPayment): DailyReportEvent {
  const amount = payment.amount ?? 0;
  const direction = amount >= 0 ? ("out" as const) : ("in" as const);
  const label = direction === "out" ? EVENT_LABELS.COMPANY_PAYMENT_OUT : EVENT_LABELS.COMPANY_PAYMENT_IN;
  const transitions: NonNullable<DailyReportEvent["balance_transitions"]> = [];
  let companyMoneyBefore: number | null = null;
  let companyMoneyAfter: number | null = null;

  if (payment.live_debt_cash != null) {
    companyMoneyAfter = payment.live_debt_cash;
    // A payment reduces our debt to the company (amount >= 0 means we paid them)
    companyMoneyBefore = companyMoneyAfter + amount;
    pushTransition(transitions, "company", "money", companyMoneyBefore, companyMoneyAfter);
  }

  return {
    ...BASE,
    event_type: amount >= 0 ? "payment_to_company" as const : "payment_from_company" as const,
    id: payment.id,
    effective_at: payment.happened_at,
    created_at: payment.happened_at,
    context_line: label,
    label: label,
    money_amount: Math.abs(amount),
    money_direction: direction,
    money_delta: Math.abs(amount),
    hero_text: null,
    note: payment.note ?? null,
    company_before: companyMoneyBefore ?? undefined,
    company_after: companyMoneyAfter ?? undefined,
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
    balance_transitions: transitions.length > 0 ? transitions : undefined,
  };
}

export function expenseToEvent(expense: Expense): DailyReportEvent {
  return {
    ...BASE,
    event_type: "expense",
    id: expense.id,
    effective_at: expense.created_at ?? expense.date,
    created_at: expense.created_at ?? expense.date,
    context_line: EVENT_LABELS.EXPENSE,
    label: EVENT_LABELS.EXPENSE,
    expense_type: expense.expense_type,
    money_amount: expense.amount,
    money_direction: "out",
    money_delta: expense.amount,
    note: expense.note ?? null,
    display_name: expense.expense_type,
    hero_text: expense.amount != null ? `${formatDisplayMoney(expense.amount)}` : null,
  };
}

export function bankDepositToEvent(deposit: BankDeposit): DailyReportEvent {
  const isOut = deposit.direction === "wallet_to_bank";
  const label = isOut ? "Wallet → Bank" : "Bank → Wallet";
  const amount = Math.abs(deposit.amount);
  const moneyDirection = isOut ? ("out" as const) : ("in" as const);
  const heroText = isOut
    ? `Transferred ${getCurrencySymbol()}${formatDisplayMoney(amount)} to bank`
    : `Transferred ${getCurrencySymbol()}${formatDisplayMoney(amount)} to wallet`;
  return {
    ...BASE,
    event_type: deposit.direction,
    id: deposit.id,
    effective_at: deposit.happened_at,
    created_at: deposit.happened_at,
    context_line: label,
    label,
    display_name: label,
    money_amount: amount,
    money_direction: moneyDirection,
    money_delta: amount,
    hero_text: heroText,
    note: deposit.note ?? null,
  };
}

export function inventoryAdjustmentToEvent(adj: InventoryAdjustment): DailyReportEvent {
  const gas = adj.gas_type ?? "12kg";
  const parts: string[] = [];
  if (adj.delta_full !== 0) parts.push(`full ${adj.delta_full > 0 ? "+" : ""}${adj.delta_full}`);
  if (adj.delta_empty !== 0) parts.push(`empty ${adj.delta_empty > 0 ? "+" : ""}${adj.delta_empty}`);
  const heroText = parts.length > 0 ? `${gas}: ${parts.join(" | ")}` : null;
  return {
    ...BASE,
    event_type: "adjust_inventory",
    id: adj.id,
    effective_at: adj.effective_at,
    created_at: adj.created_at,
    context_line: EVENT_LABELS.INVENTORY_ADJUSTMENT,
    label: EVENT_LABELS.INVENTORY_ADJUSTMENT,
    gas_type: gas,
    reason: adj.reason ?? null,
    hero_text: heroText,
    note: adj.reason ?? null,
  };
}

export function cashAdjustmentToEvent(adj: CashAdjustment): DailyReportEvent {
  const delta = adj.delta_cash ?? 0;
  const formattedDelta = `${delta > 0 ? "+" : "-"}${formatDisplayMoney(Math.abs(delta))} ${getCurrencySymbol()}`;
  return {
    ...BASE,
    event_type: "adjust_wallet",
    id: adj.id,
    effective_at: adj.effective_at,
    created_at: adj.created_at,
    context_line: EVENT_LABELS.WALLET_ADJUSTMENT,
    label: EVENT_LABELS.WALLET_ADJUSTMENT,
    money_amount: Math.abs(delta),
    money_direction: delta >= 0 ? "in" : "out",
    money_delta: Math.abs(delta),
    reason: adj.reason ?? null,
    hero_text: `Wallet change: ${formattedDelta}`,
    note: adj.reason ?? null,
  };
}

export function inventoryAdjustmentGroupToEvent(adjustments: InventoryAdjustment[]): DailyReportEvent {
  if (adjustments.length === 0) {
    return {
      ...BASE,
      event_type: "adjust_inventory",
      id: "inventory-adjustment-group",
      effective_at: new Date(0).toISOString(),
      created_at: new Date(0).toISOString(),
      context_line: EVENT_LABELS.INVENTORY_ADJUSTMENT,
      label: EVENT_LABELS.INVENTORY_ADJUSTMENT,
      hero_text: null,
      note: null,
    };
  }

  const sorted = [...adjustments].sort((left, right) => {
    const gasOrder =
      (left.gas_type === "12kg" ? 0 : 1) - (right.gas_type === "12kg" ? 0 : 1);
    if (gasOrder !== 0) return gasOrder;
    return String(left.id).localeCompare(String(right.id));
  });
  const primary = sorted[0];
  const lines = sorted
    .map((adj) => {
      const parts: string[] = [];
      if (adj.delta_full !== 0) parts.push(`full ${adj.delta_full > 0 ? "+" : ""}${adj.delta_full}`);
      if (adj.delta_empty !== 0) parts.push(`empty ${adj.delta_empty > 0 ? "+" : ""}${adj.delta_empty}`);
      return parts.length > 0 ? `${adj.gas_type}: ${parts.join(" | ")}` : null;
    })
    .filter((line): line is string => Boolean(line));
  const reason = sorted.map((adj) => adj.reason).find((value) => value && value.trim()) ?? null;

  return {
    ...BASE,
    event_type: "adjust_inventory",
    id: primary.group_id ?? primary.id,
    effective_at: primary.effective_at,
    created_at: primary.created_at,
    context_line: EVENT_LABELS.INVENTORY_ADJUSTMENT,
    label: EVENT_LABELS.INVENTORY_ADJUSTMENT,
    reason,
    hero_text: lines.length > 0 ? lines.join("\n") : null,
    note: reason,
  };
}
