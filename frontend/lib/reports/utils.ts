import {
  calcCompanyCylinderUiResult,
  calcCustomerCylinderDelta,
  calcCustomerMoneyDelta,
  calcMoneyUiResult,
} from "@/lib/ledgerMath";

export type DaySummaryTotals = {
  newDebt: { cash: number; cyl12: number; cyl48: number };
  collections: { cash: number; cyl12: number; cyl48: number };
  business: { cash: number; cyl12: number; cyl48: number };
};

export function formatEventType(type: string, orderMode?: string | null) {
  if (type === "order") {
    const resolvedMode = orderMode || "replacement";
    if (resolvedMode === "replacement") return "Replace";
    if (resolvedMode === "sell_iron") return "SellFull";
    if (resolvedMode === "buy_iron") return "BuyEmpty";
    return "Replace";
  }
  if (type === "collection_money") return "LatePay";
  if (type === "collection_payout") return "Payout";
  if (type === "collection_empty") return "ReturnEmp";
  if (type === "refill") return "Refill";
  if (type === "company_payment") return "PayCompany";
  if (type === "company_buy_iron") return "BuyIron";
  if (type === "cash_adjust") return "CashAdjust";
  if (type === "adjust") return "InvAdjust";
  if (type === "init_balance") return "Init Co";
  if (type === "init_credit") return "Init Cr";
  if (type === "init_return") return "Init Ret";
  return type
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function summarizeOrderEvents(events: any[]) {
  const summary = {
    sold12: 0,
    missing12: 0,
    credit12: 0,
    sold48: 0,
    missing48: 0,
    credit48: 0,
    total: 0,
    paid: 0,
    missingCash: 0,
    creditCash: 0,
  };
  const perCustomerCyl12 = new Map<string, number>();
  const perCustomerCyl48 = new Map<string, number>();
  const perCustomerMoney = new Map<string, number>();
  events.forEach((ev) => {
    if (String(ev?.event_type ?? ev?.type ?? ev?.source_type) !== "order") return;
    const orderMode = String(ev?.order_mode ?? "replacement");
    const isReplacement = orderMode === "replacement";
    const isSaleOrder = orderMode !== "buy_iron";
    const installed = typeof ev?.order_installed === "number" ? ev.order_installed : 0;
    const received = typeof ev?.order_received === "number" ? ev.order_received : 0;
    const missing = calcCustomerCylinderDelta(orderMode, installed, received);
    const customerKey =
      (typeof ev?.customer_id === "string" && ev.customer_id) ||
      (typeof ev?.customer_name === "string" && ev.customer_name) ||
      `unknown:${ev?.source_id ?? ""}`;
    if (isSaleOrder && ev?.gas_type === "12kg") {
      summary.sold12 += installed;
    }
    if (isSaleOrder && ev?.gas_type === "48kg") {
      summary.sold48 += installed;
    }
    if (isReplacement && ev?.gas_type === "12kg") {
      perCustomerCyl12.set(customerKey, (perCustomerCyl12.get(customerKey) ?? 0) + missing);
    }
    if (isReplacement && ev?.gas_type === "48kg") {
      perCustomerCyl48.set(customerKey, (perCustomerCyl48.get(customerKey) ?? 0) + missing);
    }
    const orderTotal = typeof ev?.order_total === "number" ? ev.order_total : 0;
    const orderPaid = typeof ev?.order_paid === "number" ? ev.order_paid : 0;
    if (isSaleOrder) {
      summary.total += orderTotal;
      summary.paid += orderPaid;
    }
    const moneyDelta = calcCustomerMoneyDelta(orderMode, orderTotal, orderPaid);
    perCustomerMoney.set(customerKey, (perCustomerMoney.get(customerKey) ?? 0) + moneyDelta);
  });
  perCustomerCyl12.forEach((net) => {
    if (net > 0) summary.missing12 += net;
    if (net < 0) summary.credit12 += Math.abs(net);
  });
  perCustomerCyl48.forEach((net) => {
    if (net > 0) summary.missing48 += net;
    if (net < 0) summary.credit48 += Math.abs(net);
  });
  perCustomerMoney.forEach((net) => {
    if (net > 0) summary.missingCash += net;
    if (net < 0) summary.creditCash += Math.abs(net);
  });
  return summary;
}

export function summarizeDayNet(events: any[]) {
  const perCustomerMoney = new Map<string, number>();
  const perCustomerCyl12 = new Map<string, number>();
  const perCustomerCyl48 = new Map<string, number>();

  const addNet = (map: Map<string, number>, key: string, delta: number) => {
    map.set(key, (map.get(key) ?? 0) + delta);
  };

  events.forEach((ev) => {
    const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type);
    const customerKey =
      (typeof ev?.customer_id === "string" && ev.customer_id) ||
      (typeof ev?.customer_name === "string" && ev.customer_name) ||
      `unknown:${ev?.source_id ?? ""}`;

    if (eventType === "order") {
      const orderMode = String(ev?.order_mode ?? "replacement");
      const isReplacement = orderMode === "replacement";
      const installed = typeof ev?.order_installed === "number" ? ev.order_installed : 0;
      const received = typeof ev?.order_received === "number" ? ev.order_received : 0;
      const missing = calcCustomerCylinderDelta(orderMode, installed, received);
      if (isReplacement && ev?.gas_type === "12kg") addNet(perCustomerCyl12, customerKey, missing);
      if (isReplacement && ev?.gas_type === "48kg") addNet(perCustomerCyl48, customerKey, missing);

      const orderTotal = typeof ev?.order_total === "number" ? ev.order_total : 0;
      const orderPaid = typeof ev?.order_paid === "number" ? ev.order_paid : 0;
      const moneyDelta = calcCustomerMoneyDelta(orderMode, orderTotal, orderPaid);
      addNet(perCustomerMoney, customerKey, moneyDelta);
      return;
    }

    if (eventType === "collection_money") {
      const cashBefore = typeof ev?.cash_before === "number" ? ev.cash_before : null;
      const cashAfter = typeof ev?.cash_after === "number" ? ev.cash_after : null;
      const delta =
        cashBefore != null && cashAfter != null
          ? cashAfter - cashBefore
          : typeof ev?.collection_amount === "number"
            ? ev.collection_amount
            : typeof ev?.amount_money === "number"
              ? ev.amount_money
              : 0;
      if (delta !== 0) addNet(perCustomerMoney, customerKey, -delta);
      return;
    }

    if (eventType === "collection_payout") {
      const cashBefore = typeof ev?.cash_before === "number" ? ev.cash_before : null;
      const cashAfter = typeof ev?.cash_after === "number" ? ev.cash_after : null;
      const rawDelta =
        cashBefore != null && cashAfter != null
          ? cashAfter - cashBefore
          : typeof ev?.collection_amount === "number"
            ? ev.collection_amount
            : typeof ev?.amount_money === "number"
              ? ev.amount_money
              : 0;
      const amount = Math.abs(rawDelta);
      if (amount !== 0) addNet(perCustomerMoney, customerKey, amount);
      return;
    }

    if (eventType === "collection_empty") {
      const invBefore = ev?.inventory_before ?? {};
      const invAfter = ev?.inventory_after ?? {};
      const empty12Before =
        typeof invBefore?.empty12 === "number"
          ? invBefore.empty12
          : typeof ev?.inv12_empty_before === "number"
            ? ev.inv12_empty_before
            : null;
      const empty12After =
        typeof invAfter?.empty12 === "number"
          ? invAfter.empty12
          : typeof ev?.inv12_empty_after === "number"
            ? ev.inv12_empty_after
            : null;
      const empty48Before =
        typeof invBefore?.empty48 === "number"
          ? invBefore.empty48
          : typeof ev?.inv48_empty_before === "number"
            ? ev.inv48_empty_before
            : null;
      const empty48After =
        typeof invAfter?.empty48 === "number"
          ? invAfter.empty48
          : typeof ev?.inv48_empty_after === "number"
            ? ev.inv48_empty_after
            : null;
      const delta12 =
        empty12Before != null && empty12After != null
          ? empty12After - empty12Before
          : typeof ev?.collection_qty_12kg === "number"
            ? ev.collection_qty_12kg
            : typeof ev?.qty_12kg === "number"
              ? ev.qty_12kg
              : 0;
      const delta48 =
        empty48Before != null && empty48After != null
          ? empty48After - empty48Before
          : typeof ev?.collection_qty_48kg === "number"
            ? ev.collection_qty_48kg
            : typeof ev?.qty_48kg === "number"
              ? ev.qty_48kg
              : 0;
      if (delta12 !== 0) addNet(perCustomerCyl12, customerKey, -delta12);
      if (delta48 !== 0) addNet(perCustomerCyl48, customerKey, -delta48);
    }
  });

  let newDebtCash = 0;
  let newDebt12 = 0;
  let newDebt48 = 0;
  let collectedCash = 0;
  let collected12 = 0;
  let collected48 = 0;
  perCustomerMoney.forEach((net) => {
    if (net > 0) newDebtCash += net;
    if (net < 0) collectedCash += Math.abs(net);
  });
  perCustomerCyl12.forEach((net) => {
    if (net > 0) newDebt12 += net;
    if (net < 0) collected12 += Math.abs(net);
  });
  perCustomerCyl48.forEach((net) => {
    if (net > 0) newDebt48 += net;
    if (net < 0) collected48 += Math.abs(net);
  });

  return {
    collectedCash,
    collected12,
    collected48,
    newDebtCash,
    newDebt12,
    newDebt48,
  };
}

export function scanDaySummary(events: any[]): DaySummaryTotals {
  const summary: DaySummaryTotals = {
    newDebt: { cash: 0, cyl12: 0, cyl48: 0 },
    collections: { cash: 0, cyl12: 0, cyl48: 0 },
    business: { cash: 0, cyl12: 0, cyl48: 0 },
  };

  events.forEach((ev) => {
    const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type);

    if (eventType === "order") {
      const orderMode = String(ev?.order_mode ?? "replacement");
      const isReplacement = orderMode === "replacement";
      const orderTotal = typeof ev?.order_total === "number" ? ev.order_total : 0;
      const orderPaid = typeof ev?.order_paid === "number" ? ev.order_paid : 0;
      const installed = typeof ev?.order_installed === "number" ? ev.order_installed : 0;
      const received = typeof ev?.order_received === "number" ? ev.order_received : 0;
      const moneyDelta = calcCustomerMoneyDelta(orderMode, orderTotal, orderPaid);
      const cylDelta = calcCustomerCylinderDelta(orderMode, installed, received);
      if (moneyDelta === 0 && cylDelta === 0) return;
      if (ev?.gas_type === "12kg") summary.newDebt.cyl12 += cylDelta;
      if (ev?.gas_type === "48kg") summary.newDebt.cyl48 += cylDelta;
      summary.newDebt.cash += moneyDelta;
      return;
    }

    if (eventType === "collection_money") {
      const cashBefore = typeof ev?.cash_before === "number" ? ev.cash_before : null;
      const cashAfter = typeof ev?.cash_after === "number" ? ev.cash_after : null;
      const delta =
        cashBefore != null && cashAfter != null
          ? cashAfter - cashBefore
          : typeof ev?.collection_amount === "number"
            ? ev.collection_amount
            : typeof ev?.amount_money === "number"
              ? ev.amount_money
              : 0;
      if (delta !== 0) summary.collections.cash += delta;
      return;
    }

    if (eventType === "collection_payout") {
      const cashBefore = typeof ev?.cash_before === "number" ? ev.cash_before : null;
      const cashAfter = typeof ev?.cash_after === "number" ? ev.cash_after : null;
      const rawDelta =
        cashBefore != null && cashAfter != null
          ? cashAfter - cashBefore
          : typeof ev?.collection_amount === "number"
            ? ev.collection_amount
            : typeof ev?.amount_money === "number"
              ? ev.amount_money
              : 0;
      const amount = Math.abs(rawDelta);
      if (amount !== 0) summary.collections.cash -= amount;
      return;
    }
    if (eventType === "collection_empty") {
      let qty12 = typeof ev?.collection_qty_12kg === "number" ? ev.collection_qty_12kg : 0;
      let qty48 = typeof ev?.collection_qty_48kg === "number" ? ev.collection_qty_48kg : 0;
      if (qty12 === 0) qty12 = typeof ev?.qty_12kg === "number" ? ev.qty_12kg : 0;
      if (qty48 === 0) qty48 = typeof ev?.qty_48kg === "number" ? ev.qty_48kg : 0;

      const invBefore = ev?.inventory_before ?? {};
      const invAfter = ev?.inventory_after ?? {};
      if (qty12 === 0 && typeof invBefore?.empty12 === "number" && typeof invAfter?.empty12 === "number") {
        qty12 = invAfter.empty12 - invBefore.empty12;
      }
      if (qty48 === 0 && typeof invBefore?.empty48 === "number" && typeof invAfter?.empty48 === "number") {
        qty48 = invAfter.empty48 - invBefore.empty48;
      }

      if (qty12 !== 0) summary.collections.cyl12 += qty12;
      if (qty48 !== 0) summary.collections.cyl48 += qty48;
      return;
    }

    if (eventType === "refill") {
      const buy12 = typeof ev?.buy12 === "number" ? ev.buy12 : 0;
      const ret12 = typeof ev?.return12 === "number" ? ev.return12 : 0;
      const buy48 = typeof ev?.buy48 === "number" ? ev.buy48 : 0;
      const ret48 = typeof ev?.return48 === "number" ? ev.return48 : 0;
      if (buy12 || ret12) summary.business.cyl12 += calcCompanyCylinderUiResult(buy12, ret12);
      if (buy48 || ret48) summary.business.cyl48 += calcCompanyCylinderUiResult(buy48, ret48);
      return;
    }

    if (eventType === "expense") {
      const cashBefore = typeof ev?.cash_before === "number" ? ev.cash_before : null;
      const cashAfter = typeof ev?.cash_after === "number" ? ev.cash_after : null;
      const delta = cashBefore != null && cashAfter != null ? cashAfter - cashBefore : 0;
      if (delta !== 0) summary.business.cash += delta;
      return;
    }

    if (eventType === "init_balance") {
      const companyBefore = typeof ev?.company_before === "number" ? ev.company_before : null;
      const companyAfter = typeof ev?.company_after === "number" ? ev.company_after : null;
      const delta = companyBefore != null && companyAfter != null ? companyAfter - companyBefore : 0;
      if (delta !== 0) summary.business.cash += delta;
      return;
    }

    if (eventType === "init" || eventType === "init_credit" || eventType === "init_return") {
      const gas = ev?.gas_type;
      const invBefore = ev?.inventory_before ?? {};
      const invAfter = ev?.inventory_after ?? {};
      let fullDelta = 0;
      let emptyDelta = 0;
      if (gas === "12kg") {
        const beforeFull = typeof invBefore?.full12 === "number" ? invBefore.full12 : null;
        const afterFull = typeof invAfter?.full12 === "number" ? invAfter.full12 : null;
        const beforeEmpty = typeof invBefore?.empty12 === "number" ? invBefore.empty12 : null;
        const afterEmpty = typeof invAfter?.empty12 === "number" ? invAfter.empty12 : null;
        if (beforeFull != null && afterFull != null) fullDelta = afterFull - beforeFull;
        if (beforeEmpty != null && afterEmpty != null) emptyDelta = afterEmpty - beforeEmpty;
        summary.business.cyl12 += fullDelta + emptyDelta;
      }
      if (gas === "48kg") {
        const beforeFull = typeof invBefore?.full48 === "number" ? invBefore.full48 : null;
        const afterFull = typeof invAfter?.full48 === "number" ? invAfter.full48 : null;
        const beforeEmpty = typeof invBefore?.empty48 === "number" ? invBefore.empty48 : null;
        const afterEmpty = typeof invAfter?.empty48 === "number" ? invAfter.empty48 : null;
        if (beforeFull != null && afterFull != null) fullDelta = afterFull - beforeFull;
        if (beforeEmpty != null && afterEmpty != null) emptyDelta = afterEmpty - beforeEmpty;
        summary.business.cyl48 += fullDelta + emptyDelta;
      }
    }
  });

  return summary;
}

export function buildDaySummaryLines(
  summary: DaySummaryTotals,
  formatMoney: (value: number) => string,
  formatCount: (value: number) => string
) {
  const formatSignedCount = (value: number) => {
    if (value === 0) return "";
    const sign = value > 0 ? "+" : "-";
    return `${sign}${formatCount(Math.abs(value))}`;
  };
  const formatSignedMoney = (value: number) => {
    if (value === 0) return "";
    const sign = value > 0 ? "+" : "-";
    return `${sign}${formatMoney(Math.abs(value))}`;
  };
  const parts = (cash: number, cyl12: number, cyl48: number) => {
    const out: string[] = [];
    if (cyl12 !== 0) out.push(`${formatSignedCount(cyl12)}x 12kg`);
    if (cyl48 !== 0) out.push(`${formatSignedCount(cyl48)}x 48kg`);
    if (cash !== 0) out.push(`${formatSignedMoney(cash)}\u00c3\u00a2\u00e2\u0082\u00ac\u00c2\u00aa`);
    return out.length > 0 ? out.join(" | ") : null;
  };

  const lines: { label: string; color: string }[] = [];
  const debt = parts(summary.newDebt.cash, summary.newDebt.cyl12, summary.newDebt.cyl48);
  if (debt)
    lines.push({
      label: `\u00c3\u00b0\u00c5\u00b8\u00e2\u0080\u009d\u00c2\u00b4 New Debt: ${debt}`,
      color: "#b91c1c",
    });

  const collections = parts(summary.collections.cash, summary.collections.cyl12, summary.collections.cyl48);
  if (collections)
    lines.push({
      label: `\u00c3\u00b0\u00c5\u00b8\u00c5\u00b8\u00c2\u00a2 Collections: ${collections}`,
      color: "#16a34a",
    });

  const business = parts(summary.business.cash, summary.business.cyl12, summary.business.cyl48);
  if (business)
    lines.push({
      label: `\u00c3\u00b0\u00c5\u00b8\u00e2\u0080\u009d\u00c2\u00b5 Business Flow: ${business}`,
      color: "#0a7ea4",
    });

  return lines;
}

export function summarizeRefillEvents(events: any[]) {
  const summary = {
    buy12: 0,
    ret12: 0,
    buy48: 0,
    ret48: 0,
    total: 0,
    paid: 0,
    unpaid: 0,
  };
  events.forEach((ev) => {
    if (String(ev?.event_type ?? ev?.type ?? ev?.source_type) !== "refill") return;
    const totalCost = typeof ev?.total_cost === "number" ? ev.total_cost : 0;
    const paidNow = typeof ev?.paid_now === "number" ? ev.paid_now : 0;
    summary.buy12 += typeof ev?.buy12 === "number" ? ev.buy12 : 0;
    summary.ret12 += typeof ev?.return12 === "number" ? ev.return12 : 0;
    summary.buy48 += typeof ev?.buy48 === "number" ? ev.buy48 : 0;
    summary.ret48 += typeof ev?.return48 === "number" ? ev.return48 : 0;
    summary.total += totalCost;
    summary.paid += paidNow;
  });
  summary.unpaid = calcMoneyUiResult(summary.total, summary.paid);
  return summary;
}

export function summarizeEventTypes(events: any[]) {
  const map = new Map<string, number>();
  const hiddenTypes = new Set(["init", "init_credit", "init_return", "init_balance", "cash_init"]);
  events.forEach((ev) => {
    const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type ?? "event");
    if (hiddenTypes.has(eventType)) return;
    const labelShort = typeof ev?.label_short === "string" ? ev.label_short.trim() : "";
    if (labelShort) {
      const key = `label:${labelShort}`;
      map.set(key, (map.get(key) ?? 0) + 1);
      return;
    }
    const orderMode = eventType === "order" ? String(ev?.order_mode ?? "replacement") : "";
    const key = eventType === "order" ? `order:${orderMode}` : eventType;
    map.set(key, (map.get(key) ?? 0) + 1);
  });

  const labels: Record<string, string> = {
    "order:replacement": "Replace",
    "order:sell_iron": "SellFull",
    "order:buy_iron": "BuyEmpty",
    order: "Replace",
    refill: "Refill",
    expense: "Expense",
    init: "Init",
    adjust: "InvAdjust",
    cash_adjust: "CashAdjust",
    collection_money: "LatePay",
    collection_payout: "Payout",
    collection_empty: "ReturnEmp",
    company_payment: "PayCompany",
    company_buy_iron: "BuyIron",
  };
  const palette = ["#0a7ea4", "#16a34a", "#f97316", "#8b5cf6", "#e0b93f", "#64748b"];
  const out = Array.from(map.entries()).map(([type, count], i) => ({
    type,
    label: `${labels[type] ?? type.replace(/^label:/, "") ?? type} ${count}`,
    color: palette[i % palette.length],
  }));
  return out.slice(0, 6);
}

export function formatSigned(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}`;
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
