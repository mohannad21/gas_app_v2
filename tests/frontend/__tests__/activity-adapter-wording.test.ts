import {
  collectionToEvent,
  companyBalanceAdjustmentToEvent,
  companyPaymentToEvent,
  customerAdjustmentToEvent,
  orderToEvent,
  refillSummaryToEvent,
} from "@/lib/activityAdapter";

describe("activity adapter wording", () => {
  it("uses Daily Report wording for customer activity labels", () => {
    expect(
      orderToEvent({
        id: "order-1",
        customer_id: "cust-1",
        system_id: "sys-1",
        order_mode: "sell_iron",
        gas_type: "12kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 40,
        paid_amount: 40,
        debt_cash: 0,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        delivered_at: "2026-05-05T10:00:00Z",
        created_at: "2026-05-05T10:00:00Z",
      } as any).label
    ).toBe("Sell Full");

    expect(
      collectionToEvent({
        id: "col-1",
        customer_id: "cust-1",
        action_type: "payment",
        amount_money: 20,
        debt_cash: 50,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        effective_at: "2026-05-05T10:00:00Z",
        created_at: "2026-05-05T10:00:00Z",
      } as any).label
    ).toBe("Received payment");

    expect(
      collectionToEvent({
        id: "col-2",
        customer_id: "cust-1",
        action_type: "return",
        qty_12kg: 1,
        qty_48kg: 0,
        debt_cash: 0,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        effective_at: "2026-05-05T10:00:00Z",
        created_at: "2026-05-05T10:00:00Z",
      } as any).label
    ).toBe("Returned empties");

    expect(
      customerAdjustmentToEvent({
        id: "adj-1",
        customer_id: "cust-1",
        amount_money: 0,
        count_12kg: 0,
        count_48kg: 0,
        debt_cash: 0,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        effective_at: "2026-05-05T10:00:00Z",
        created_at: "2026-05-05T10:00:00Z",
      } as any).label
    ).toBe("Balance adjustment");
  });

  it("uses Daily Report wording for company and ledger activity labels", () => {
    expect(
      companyPaymentToEvent({
        id: "pay-1",
        amount: 50,
        live_debt_cash: 100,
        happened_at: "2026-05-05T10:00:00Z",
        note: null,
      } as any).label
    ).toBe("Paid company");

    expect(
      companyBalanceAdjustmentToEvent({
        id: "adj-1",
        delta_money: 0,
        delta_cylinder_12: 0,
        delta_cylinder_48: 0,
        money_balance: 0,
        cylinder_balance_12: 0,
        cylinder_balance_48: 0,
        happened_at: "2026-05-05T10:00:00Z",
        created_at: "2026-05-05T10:00:00Z",
      } as any).label
    ).toBe("Balance adjustment");

    expect(
      refillSummaryToEvent({
        refill_id: "ref-1",
        date: "2026-05-05",
        effective_at: "2026-05-05T10:00:00Z",
        created_at: "2026-05-05T10:00:00Z",
        kind: "buy_iron",
        buy12: 1,
        buy48: 0,
        return12: 0,
        return48: 0,
        new12: 1,
        new48: 0,
        total_cost: 100,
        paid_now: 100,
        debt_cash: 0,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
      } as any).label
    ).toBe("Bought full");
  });
});
