export type SmartTicketLine = {
  text: string;
  tone?: "alert" | "ok";
};

export type SmartTicketFormatters = {
  formatMoney: (value: number) => string;
  formatCount: (value: number) => string;
  formatSigned: (value: number) => string;
};

export const shouldHideField = (value: number | string | null | undefined) => {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value) || Math.abs(value) < 0.0001;
  if (typeof value === "string") return value.trim().length === 0;
  return true;
};

export const buildCollapsedLines = (ctx: any, fmt: SmartTicketFormatters): SmartTicketLine[] => {
  const lines: SmartTicketLine[] = [];
  const pushLine = (text: string, tone?: "alert" | "ok") => lines.push({ text, tone });
  const ev = ctx.ev ?? {};
  const eventType = ctx.eventType ?? ev.event_type;
  const isBalanced = typeof ev?.is_balanced === "boolean" ? ev.is_balanced : false;
  const actionLines = Array.isArray(ev?.action_lines) ? ev.action_lines : [];
  const formatCount = (value: number) => fmt.formatCount(Math.abs(value));
  const formatMoney = (value: number) => fmt.formatMoney(Math.abs(value));
  const formatMoneySigned = (value: number) => {
    const sign = value < 0 ? "-" : value > 0 ? "+" : "";
    return `${sign}${formatMoney(value)}`;
  };
  const appendActions = () => {
    actionLines.forEach((line: unknown) => {
      const text = String(line ?? "").trim();
      if (text) pushLine(text, "alert");
    });
  };

  const installed = Number(ctx.installed ?? ev?.order_installed ?? 0);
  const received = Number(ctx.received ?? ev?.order_received ?? 0);
  const orderTotal = Number(ctx.orderTotal ?? ev?.order_total ?? 0);
  const orderPaid = Number(ctx.orderPaid ?? ev?.order_paid ?? 0);
  const orderQty = Number(ctx.orderQty ?? installed ?? received ?? 0);

  if (eventType === "order" && ctx.isReplacementOrder) {
    if (isBalanced) {
      pushLine(`Installed: ${formatCount(installed)} | Paid: ${formatMoney(orderPaid)} | \u2705 OK`, "ok");
      return lines;
    }
    if (!shouldHideField(installed) || !shouldHideField(received)) {
      pushLine(`Installed: ${formatCount(installed)} | Received: ${formatCount(received)}`);
    }
    if (!shouldHideField(orderTotal) || !shouldHideField(orderPaid)) {
      pushLine(`Total: ${formatMoney(orderTotal)} | Paid: ${formatMoney(orderPaid)}`);
    }
    appendActions();
    return lines;
  }

  if (eventType === "order" && ctx.isSellIronOrder) {
    if (isBalanced) {
      pushLine(`Sold: ${formatCount(orderQty)} | Paid: ${formatMoney(orderPaid)} | \u2705 OK`, "ok");
      return lines;
    }
    if (!shouldHideField(orderQty) || !shouldHideField(orderTotal) || !shouldHideField(orderPaid)) {
      pushLine(`Sold: ${formatCount(orderQty)} | Total: ${formatMoney(orderTotal)} | Paid: ${formatMoney(orderPaid)}`);
    }
    appendActions();
    return lines;
  }

  if (eventType === "order" && ctx.isBuyIronOrder) {
    if (isBalanced) {
      pushLine(
        `Bought: ${formatCount(orderQty)} | Paid: ${formatMoneySigned(-Math.abs(orderPaid))} | \u2705 OK`,
        "ok"
      );
      return lines;
    }
    if (!shouldHideField(orderQty) || !shouldHideField(orderTotal) || !shouldHideField(orderPaid)) {
      pushLine(
        `Bought: ${formatCount(orderQty)} | Total: ${formatMoneySigned(-Math.abs(orderTotal))} | Paid: ${formatMoneySigned(
          -Math.abs(orderPaid)
        )}`
      );
    }
    appendActions();
    return lines;
  }

  if (eventType === "collection_empty") {
    const parts: string[] = [];
    if (!shouldHideField(ctx.collectionEmpty12Display)) {
      parts.push(`Received: ${formatCount(ctx.collectionEmpty12Display)}x12kg`);
    }
    if (!shouldHideField(ctx.collectionEmpty48Display)) {
      parts.push(`${formatCount(ctx.collectionEmpty48Display)}x48kg`);
    }
    if (parts.length > 0) {
      pushLine(`${parts.join(" | ")} | \u2705 OK`, "ok");
    }
    return lines;
  }

  if (eventType === "collection_money") {
    const paid = Number(ctx.paymentAmount ?? 0);
    const hasPaid = !shouldHideField(paid);
    const paidText = `Paid: ${formatMoneySigned(Math.abs(paid))}`;
    if (typeof ctx.customerMoneyBefore === "number" && typeof ctx.customerMoneyAfter === "number") {
      const customerText = `Customer: ${formatMoney(ctx.customerMoneyBefore)} -> ${formatMoney(ctx.customerMoneyAfter)}`;
      pushLine(hasPaid ? `${paidText} | ${customerText}` : customerText);
    } else if (hasPaid) {
      pushLine(paidText);
    }
    return lines;
  }

  if (eventType === "company_payment") {
    const paid = Number(ctx.paymentAmount ?? 0);
    const hasPaid = !shouldHideField(paid);
    const paidText = `Paid: ${formatMoneySigned(-Math.abs(paid))}`;
    if (typeof ev?.company_before === "number" && typeof ev?.company_after === "number") {
      const companyText = `Company: ${formatMoney(ev.company_before)} -> ${formatMoney(ev.company_after)}`;
      pushLine(hasPaid ? `${paidText} | ${companyText}` : companyText);
    } else if (hasPaid) {
      pushLine(paidText);
    }
    return lines;
  }

  if (eventType === "refill") {
    const buy12 = Number(ctx.buy12 ?? ev?.buy12 ?? 0);
    const buy48 = Number(ctx.buy48 ?? ev?.buy48 ?? 0);
    const return12 = Number(ev?.return12 ?? 0);
    const return48 = Number(ev?.return48 ?? 0);
    const totalCost = Number(ev?.total_cost ?? ctx.refillTotal ?? 0);
    const paidNow = Number(ev?.paid_now ?? ctx.refillPaid ?? 0);
    const has12 = !shouldHideField(buy12) || !shouldHideField(return12);
    const has48 = !shouldHideField(buy48) || !shouldHideField(return48);

    if (isBalanced) {
      const buyParts: string[] = [];
      if (has12) buyParts.push(`${formatCount(buy12)}x12kg`);
      if (has48) buyParts.push(`${formatCount(buy48)}x48kg`);
      const boughtLabel = buyParts.length > 0 ? `Bought: ${buyParts.join(" | ")}` : "Bought";
      pushLine(`${boughtLabel} | Paid: ${formatMoneySigned(-Math.abs(paidNow))} | \u2705 OK`, "ok");
      return lines;
    }

    if (has12) {
      pushLine(`12kg Bought: ${formatCount(buy12)} | Returned: ${formatCount(return12)}`);
    }
    if (has48) {
      pushLine(`48kg Bought: ${formatCount(buy48)} | Returned: ${formatCount(return48)}`);
    }
    if (!shouldHideField(totalCost) || !shouldHideField(paidNow)) {
      pushLine(`Total: ${formatMoney(totalCost)} | Paid: ${formatMoneySigned(-Math.abs(paidNow))}`);
    }
    appendActions();
    return lines;
  }

  if (eventType === "company_buy_iron") {
    const buy12 = Number(ctx.buy12 ?? ev?.buy12 ?? 0);
    const buy48 = Number(ctx.buy48 ?? ev?.buy48 ?? 0);
    const paidNow = Number(ev?.paid_now ?? ctx.paymentAmount ?? 0);
    const parts: string[] = [];
    if (!shouldHideField(buy12)) parts.push(`${formatCount(buy12)}x12kg`);
    if (!shouldHideField(buy48)) parts.push(`${formatCount(buy48)}x48kg`);
    const boughtLabel = parts.length > 0 ? `Bought: ${parts.join(" | ")}` : "Bought shells";
    pushLine(`${boughtLabel} | Paid: ${formatMoneySigned(-Math.abs(paidNow))} | \u2705 OK`, "ok");
    return lines;
  }

  if (eventType === "expense" || eventType === "bank_deposit" || eventType === "cash_adjust" || eventType === "adjust") {
    const descriptor =
      ev?.expense_type ??
      ev?.reason ??
      ev?.note ??
      (typeof ctx.label === "string" && ctx.label.length ? ctx.label : eventType);
    let amount = 0;
    if (eventType === "expense") {
      amount = -Math.abs(Number(ev?.total_cost ?? ctx.expenseAmount ?? ctx.cashDelta ?? 0));
    } else if (eventType === "bank_deposit") {
      amount = Math.abs(Number(ev?.total_cost ?? ctx.expenseAmount ?? ctx.cashDelta ?? 0));
    } else if (eventType === "cash_adjust") {
      amount = Number(ev?.total_cost ?? ctx.cashDelta ?? 0);
    } else if (eventType === "adjust") {
      amount = Number(ctx.cashDelta ?? 0);
    }
    const hasAmount = !shouldHideField(amount);
    if (hasAmount) {
      pushLine(`${descriptor} ${formatMoneySigned(amount)}`);
    } else if (descriptor) {
      pushLine(String(descriptor));
    }
    return lines;
  }

  if (eventType === "collection_payout") {
    const paid = Number(ctx.paymentAmount ?? 0);
    if (!shouldHideField(paid)) {
      pushLine(`Paid: ${formatMoneySigned(-Math.abs(paid))}`);
    }
    return lines;
  }

  return lines;
};

