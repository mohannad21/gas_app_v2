import { collectionToEvent } from "@/lib/activityAdapter";
import type { BalanceTransition } from "@/types/domain";

function transition(
  transitions: BalanceTransition[] | null | undefined,
  component: BalanceTransition["component"]
): BalanceTransition | undefined {
  return transitions?.find((item) => item.scope === "customer" && item.component === component);
}

describe("collectionToEvent visible numbers", () => {
  it("maps payment received into customer money before and after", () => {
    const event = collectionToEvent({
      id: "payment-1",
      customer_id: "customer-a",
      action_type: "payment",
      amount_money: 70,
      debt_cash: 30,
      debt_cylinders_12: 0,
      debt_cylinders_48: 0,
      live_debt_cash: 30,
      live_debt_cylinders_12: 0,
      live_debt_cylinders_48: 0,
      effective_at: "2026-05-14T09:00:00Z",
      created_at: "2026-05-14T09:00:00Z",
    } as any, {
      customerName: "Customer A",
    });

    expect(event.label).toBe("Customer paid");
    expect(event.hero_text).toBe("Payment 70.00");
    expect(event.money_direction).toBe("in");
    expect(event.money_amount).toBe(70);
    expect(event.customer_money_before).toBe(100);
    expect(event.customer_money_after).toBe(30);
    expect(transition(event.balance_transitions, "money")).toMatchObject({
      scope: "customer",
      component: "money",
      before: 100,
      after: 30,
    });
    expect(transition(event.balance_transitions, "cyl_12")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_48")).toBeUndefined();
  });

  it("maps payout into signed money before and after", () => {
    const event = collectionToEvent({
      id: "payout-1",
      customer_id: "customer-a",
      action_type: "payout",
      amount_money: 40,
      debt_cash: -60,
      debt_cylinders_12: 0,
      debt_cylinders_48: 0,
      live_debt_cash: -60,
      live_debt_cylinders_12: 0,
      live_debt_cylinders_48: 0,
      effective_at: "2026-05-14T10:00:00Z",
      created_at: "2026-05-14T10:00:00Z",
    } as any, {
      customerName: "Customer A",
    });

    expect(event.label).toBe("Paid customer");
    expect(event.hero_text).toBe("Payout 40.00");
    expect(event.money_direction).toBe("out");
    expect(event.money_amount).toBe(40);
    expect(event.customer_money_before).toBe(-100);
    expect(event.customer_money_after).toBe(-60);
    expect(transition(event.balance_transitions, "money")).toMatchObject({
      scope: "customer",
      component: "money",
      before: -100,
      after: -60,
    });
    expect(transition(event.balance_transitions, "cyl_12")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_48")).toBeUndefined();
  });

  it("maps 12kg-only return into a single cylinder transition", () => {
    const event = collectionToEvent({
      id: "return-12",
      customer_id: "customer-a",
      action_type: "return",
      qty_12kg: 2,
      qty_48kg: 0,
      debt_cash: 0,
      debt_cylinders_12: 1,
      debt_cylinders_48: 0,
      live_debt_cash: 0,
      live_debt_cylinders_12: 1,
      live_debt_cylinders_48: 0,
      effective_at: "2026-05-14T11:00:00Z",
      created_at: "2026-05-14T11:00:00Z",
    } as any, {
      customerName: "Customer A",
    });

    expect(event.label).toBe("Returned empties");
    expect(event.hero_text).toBe("Returned 2x12kg empties");
    expect(event.customer_12kg_before).toBe(3);
    expect(event.customer_12kg_after).toBe(1);
    expect(event.customer_48kg_before).toBe(0);
    expect(event.customer_48kg_after).toBe(0);
    expect(transition(event.balance_transitions, "money")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_12")).toMatchObject({
      before: 3,
      after: 1,
    });
    expect(transition(event.balance_transitions, "cyl_48")).toBeUndefined();
  });

  it("maps 48kg-only return into a single cylinder transition", () => {
    const event = collectionToEvent({
      id: "return-48",
      customer_id: "customer-a",
      action_type: "return",
      qty_12kg: 0,
      qty_48kg: 1,
      debt_cash: 0,
      debt_cylinders_12: 0,
      debt_cylinders_48: 1,
      live_debt_cash: 0,
      live_debt_cylinders_12: 0,
      live_debt_cylinders_48: 1,
      effective_at: "2026-05-14T12:00:00Z",
      created_at: "2026-05-14T12:00:00Z",
    } as any, {
      customerName: "Customer A",
    });

    expect(event.hero_text).toBe("Returned 1x48kg empties");
    expect(event.customer_12kg_before).toBe(0);
    expect(event.customer_12kg_after).toBe(0);
    expect(event.customer_48kg_before).toBe(2);
    expect(event.customer_48kg_after).toBe(1);
    expect(transition(event.balance_transitions, "money")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_12")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_48")).toMatchObject({
      before: 2,
      after: 1,
    });
  });

  it("keeps mixed return as one event with both cylinder transitions", () => {
    const event = collectionToEvent({
      id: "return-mixed",
      customer_id: "customer-a",
      action_type: "return",
      qty_12kg: 2,
      qty_48kg: 1,
      debt_cash: 0,
      debt_cylinders_12: 1,
      debt_cylinders_48: 1,
      live_debt_cash: 0,
      live_debt_cylinders_12: 1,
      live_debt_cylinders_48: 1,
      effective_at: "2026-05-14T13:00:00Z",
      created_at: "2026-05-14T13:00:00Z",
    } as any, {
      customerName: "Customer A",
    });

    expect(event.hero_text).toBe("Returned 2x12kg | 1x48kg empties");
    expect(transition(event.balance_transitions, "money")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_12")).toMatchObject({
      before: 3,
      after: 1,
    });
    expect(transition(event.balance_transitions, "cyl_48")).toMatchObject({
      before: 2,
      after: 1,
    });
  });

  it("shows time-dependent same-customer shift only when /collections live balances change", () => {
    const beforeBackdate = collectionToEvent({
      id: "later-payment",
      customer_id: "customer-a",
      action_type: "payment",
      amount_money: 20,
      live_debt_cash: 80,
      live_debt_cylinders_12: 0,
      live_debt_cylinders_48: 0,
      effective_at: "2026-05-14T09:00:00Z",
      created_at: "2026-05-14T09:00:00Z",
    } as any);
    const afterBackdate = collectionToEvent({
      id: "later-payment",
      customer_id: "customer-a",
      action_type: "payment",
      amount_money: 20,
      live_debt_cash: 10,
      live_debt_cylinders_12: 0,
      live_debt_cylinders_48: 0,
      effective_at: "2026-05-14T09:00:00Z",
      created_at: "2026-05-14T09:00:00Z",
    } as any);
    const otherCustomer = collectionToEvent({
      id: "later-other-customer",
      customer_id: "customer-b",
      action_type: "payment",
      amount_money: 10,
      live_debt_cash: 90,
      live_debt_cylinders_12: 0,
      live_debt_cylinders_48: 0,
      effective_at: "2026-05-14T10:00:00Z",
      created_at: "2026-05-14T10:00:00Z",
    } as any);

    expect(beforeBackdate.customer_money_before).toBe(100);
    expect(beforeBackdate.customer_money_after).toBe(80);
    expect(afterBackdate.customer_money_before).toBe(30);
    expect(afterBackdate.customer_money_after).toBe(10);
    expect(otherCustomer.customer_money_before).toBe(100);
    expect(otherCustomer.customer_money_after).toBe(90);
  });
});
