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
import { formatDisplayMoney, getCurrencySymbol } from "@/lib/money";

const BASE: Pick<DailyReportEvent, "cash_before" | "cash_after"> = {
  cash_before: 0,
  cash_after: 0,
};

type BankDepositDisplayDirection = "wallet_to_bank" | "bank_to_wallet";

function takeNonZeroNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
      return value;
    }
  }
  return null;
}

function parseBankDepositAmountFromText(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = String(value).replace(/,/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveBankDepositDisplayDirection(
  event: Pick<DailyReportEvent, "transfer_direction" | "money_direction" | "label" | "display_name" | "context_line">
): BankDepositDisplayDirection | null {
  if (event.transfer_direction === "wallet_to_bank" || event.transfer_direction === "bank_to_wallet") {
    return event.transfer_direction;
  }
  if (event.money_direction === "out") return "wallet_to_bank";
  if (event.money_direction === "in") return "bank_to_wallet";
  const displayText = String(event.label ?? event.display_name ?? event.context_line ?? "");
  if (/wallet\s*[→-]\s*bank/i.test(displayText)) return "wallet_to_bank";
  if (/bank\s*[→-]\s*wallet/i.test(displayText)) return "bank_to_wallet";
  return null;
}

function buildBankDepositDisplay(direction: BankDepositDisplayDirection, amount: number) {
  const isOut = direction === "wallet_to_bank";
  const label = isOut ? "Wallet → Bank" : "Bank → Wallet";
  return {
    label,
    moneyDirection: isOut ? ("out" as const) : ("in" as const),
    heroText: isOut
      ? `Transferred ${getCurrencySymbol()}${formatDisplayMoney(amount)} to bank`
      : `Transferred ${getCurrencySymbol()}${formatDisplayMoney(amount)} to wallet`,
  };
}

export function normalizeBankDepositDisplayEvent(event: DailyReportEvent): DailyReportEvent {
  if (event.event_type !== "bank_deposit") return event;

  const direction = resolveBankDepositDisplayDirection(event);
  if (!direction) return event;

  const amountText =
    event.hero_primary ?? event.hero_text ?? event.label ?? event.display_name ?? event.context_line ?? null;
  const rawAmount =
    takeNonZeroNumber(
      typeof event.money_amount === "number" ? event.money_amount : null,
      typeof event.money_delta === "number" ? event.money_delta : null,
      typeof event.total_cost === "number" ? event.total_cost : null,
      typeof event.money?.amount === "number" ? event.money.amount : null,
      parseBankDepositAmountFromText(amountText)
    ) ?? 0;
  const amount = Math.abs(rawAmount);
  const display = buildBankDepositDisplay(direction, amount);
  const moneyAmount =
    takeNonZeroNumber(typeof event.money_amount === "number" ? event.money_amount : null, amount) ?? 0;
  const moneyDelta =
    takeNonZeroNumber(typeof event.money_delta === "number" ? event.money_delta : null, amount) ?? 0;
  const contextLine = event.context_line && event.context_line.trim() ? event.context_line : display.label;
  const heroText = event.hero_text && event.hero_text.trim() ? event.hero_text : display.heroText;
  const heroPrimary = event.hero_primary && event.hero_primary.trim() ? event.hero_primary : display.heroText;

  return {
    ...event,
    transfer_direction: direction,
    label: display.label,
    display_name: display.label,
    context_line: contextLine,
    money_amount: moneyAmount,
    money_direction: display.moneyDirection,
    money_delta: moneyDelta,
    hero_text: heroText,
    hero_primary: heroPrimary,
  };
}

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
  if (before === 0 && after === 0) return;
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
  if (refill.kind === "buy_iron") return "company_buy_iron" as const;
  const totals = getCompanyInventoryTotals(refill);
  const totalReturns = totals.return12 + totals.return48;
  if (totalReturns > 0 && totals.buy12 + totals.buy48 === 0) return "company_return_empties" as const;
  return "refill" as const;
}

export function getCompanyInventoryEditTab(refill: InventoryRefillSummary) {
  const eventType = getCompanyInventoryEventType(refill);
  if (eventType === "company_buy_iron") return "buy" as const;
  if (eventType === "company_return_empties") return "return" as const;
  return "refill" as const;
}

export function orderToEvent(
  order: Order,
  opts?: { customerName?: string; customerDescription?: string | null; systemName?: string }
): DailyReportEvent {
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
    eventType = "collection_money";
    contextLine = "Collection";
    if (amount > 0) {
      heroText = `Payment ${formatDisplayMoney(amount)}`;
      moneyDirection = "in";
      moneyDelta = amount;
    }
  } else if (actionType === "payout") {
    eventType = "collection_payout";
    contextLine = "Payout";
    if (amount > 0) {
      heroText = `Payout ${formatDisplayMoney(amount)}`;
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
    event_type: "customer_adjust",
    id: adj.id,
    effective_at: adj.effective_at,
    created_at: adj.created_at,
    context_line: "Adjustment",
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
    label: "Adjustment",
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
    event_type: "company_adjustment",
    id: adj.id,
    effective_at: adj.happened_at,
    created_at: adj.created_at ?? adj.happened_at,
    context_line: "Balance Adjustment",
    label: "Balance Adjustment",
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
    eventType === "company_buy_iron"
      ? "Buy full"
      : eventType === "company_return_empties"
        ? "Return empties"
        : "Refill";

  const transitions: NonNullable<DailyReportEvent["balance_transitions"]> = [];
  let cyl12Before = 0;
  let cyl12After = 0;
  let cyl48Before = 0;
  let cyl48After = 0;

  if (eventType !== "company_buy_iron") {
    cyl12After =
      refill.live_debt_cylinders_12 != null
        ? refill.live_debt_cylinders_12
        : Number(refill.debt_cylinders_12 ?? 0);
    cyl48After =
      refill.live_debt_cylinders_48 != null
        ? refill.live_debt_cylinders_48
        : Number(refill.debt_cylinders_48 ?? 0);
    cyl12Before = cyl12After - totals.return12 + totals.buy12;
    cyl48Before = cyl48After - totals.return48 + totals.buy48;
    pushTransition(transitions, "company", "cyl_12", cyl12Before, cyl12After);
    pushTransition(transitions, "company", "cyl_48", cyl48Before, cyl48After);
  }

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
    event_type: "company_payment",
    id: payment.id,
    effective_at: payment.happened_at,
    created_at: payment.happened_at,
    context_line: "Company Payment",
    label: "Company Payment",
    money_amount: Math.abs(amount),
    money_direction: amount >= 0 ? "out" : "in",
    money_delta: Math.abs(amount),
    hero_text: amount !== 0 ? `Amount ${formatDisplayMoney(Math.abs(amount))}` : null,
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
    context_line: "Expense",
    label: "Expense",
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
  const display = buildBankDepositDisplay(deposit.direction, amount);
  return {
    ...BASE,
    event_type: "bank_deposit",
    id: deposit.id,
    effective_at: deposit.happened_at,
    created_at: deposit.happened_at,
    transfer_direction: deposit.direction,
    context_line: display.label,
    label: display.label,
    display_name: display.label,
    money_amount: amount,
    money_direction: display.moneyDirection,
    money_delta: amount,
    hero_text: display.heroText,
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

export function cashAdjustmentToEvent(adj: CashAdjustment): DailyReportEvent {
  const delta = adj.delta_cash ?? 0;
  const formattedDelta = `${delta > 0 ? "+" : "-"}${formatDisplayMoney(Math.abs(delta))} ${getCurrencySymbol()}`;
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
    hero_text: `Wallet change: ${formattedDelta}`,
    note: adj.reason ?? null,
  };
}

export function inventoryAdjustmentGroupToEvent(adjustments: InventoryAdjustment[]): DailyReportEvent {
  if (adjustments.length === 0) {
    return {
      ...BASE,
      event_type: "adjust",
      id: "inventory-adjustment-group",
      effective_at: new Date(0).toISOString(),
      created_at: new Date(0).toISOString(),
      context_line: "Inventory Adjustment",
      label: "Inventory Adjustment",
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
    event_type: "adjust",
    id: primary.group_id ?? primary.id,
    effective_at: primary.effective_at,
    created_at: primary.created_at,
    context_line: "Inventory Adjustment",
    label: "Inventory Adjustment",
    reason,
    hero_text: lines.length > 0 ? lines.join("\n") : null,
    note: reason,
  };
}
