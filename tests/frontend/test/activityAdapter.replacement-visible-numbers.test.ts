import { orderToEvent } from "@/lib/activityAdapter";
import type { BalanceTransition, Order } from "@/types/domain";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    customer_id: "customer-a",
    system_id: "system-a",
    delivered_at: "2026-05-14T09:00:00.000Z",
    created_at: "2026-05-14T09:00:00.000Z",
    updated_at: null,
    order_mode: "replacement",
    gas_type: "12kg",
    cylinders_installed: 2,
    cylinders_received: 1,
    price_total: 100,
    paid_amount: 70,
    debt_cash: 30,
    debt_cylinders_12: 1,
    debt_cylinders_48: 0,
    applied_credit: null,
    money_balance_before: 0,
    money_balance_after: 30,
    cyl_balance_before: { "12kg": 0, "48kg": 0 },
    cyl_balance_after: { "12kg": 1, "48kg": 0 },
    note: null,
    is_deleted: false,
    ...overrides,
  };
}

function transition(
  transitions: BalanceTransition[] | null | undefined,
  component: BalanceTransition["component"]
): BalanceTransition | undefined {
  return transitions?.find((item) => item.scope === "customer" && item.component === component);
}

describe("orderToEvent replacement visible numbers", () => {
  it("maps the main 12kg replacement into Customer Review and Add Entry display fields", () => {
    const event = orderToEvent(makeOrder(), {
      customerName: "Customer A",
      systemName: "Kitchen",
    });

    expect(event.label).toBe("Replacement");
    expect(event.hero_text).toBe("Installed 2x12kg | Received 1 empties");
    expect(event.order_mode).toBe("replacement");
    expect(event.gas_type).toBe("12kg");
    expect(event.order_installed).toBe(2);
    expect(event.order_received).toBe(1);
    expect(event.order_total).toBe(100);
    expect(event.order_paid).toBe(70);
    expect(event.money_amount).toBe(70);
    expect(event.money_direction).toBe("in");

    expect(transition(event.balance_transitions, "money")).toMatchObject({
      scope: "customer",
      component: "money",
      before: 0,
      after: 30,
    });
    expect(transition(event.balance_transitions, "cyl_12")).toMatchObject({
      scope: "customer",
      component: "cyl_12",
      before: 0,
      after: 1,
    });
    expect(transition(event.balance_transitions, "cyl_48")).toBeUndefined();
  });

  it("omits money pills when fully paid and cylinder pills when installed equals received", () => {
    const fullyPaid = orderToEvent(
      makeOrder({
        paid_amount: 100,
        money_balance_before: 0,
        money_balance_after: 0,
      })
    );
    expect(transition(fullyPaid.balance_transitions, "money")).toBeUndefined();
    expect(transition(fullyPaid.balance_transitions, "cyl_12")).toMatchObject({ before: 0, after: 1 });

    const equalExchange = orderToEvent(
      makeOrder({
        cylinders_received: 2,
        money_balance_before: 0,
        money_balance_after: 30,
        cyl_balance_before: { "12kg": 1, "48kg": 0 },
        cyl_balance_after: { "12kg": 1, "48kg": 0 },
      })
    );
    expect(transition(equalExchange.balance_transitions, "money")).toMatchObject({ before: 0, after: 30 });
    expect(transition(equalExchange.balance_transitions, "cyl_12")).toBeUndefined();
  });

  it("keeps 48kg replacement balances isolated from 12kg balances", () => {
    const event = orderToEvent(
      makeOrder({
        gas_type: "48kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 200,
        paid_amount: 150,
        debt_cash: 50,
        debt_cylinders_12: 0,
        debt_cylinders_48: 1,
        money_balance_before: 0,
        money_balance_after: 50,
        cyl_balance_before: { "12kg": 0, "48kg": 0 },
        cyl_balance_after: { "12kg": 0, "48kg": 1 },
      })
    );

    expect(event.hero_text).toBe("Installed 1x48kg");
    expect(event.gas_type).toBe("48kg");
    expect(transition(event.balance_transitions, "money")).toMatchObject({ before: 0, after: 50 });
    expect(transition(event.balance_transitions, "cyl_48")).toMatchObject({ before: 0, after: 1 });
    expect(transition(event.balance_transitions, "cyl_12")).toBeUndefined();
  });

  it("matches the Daily Report customer balance meaning from equivalent /orders snapshots", () => {
    const dailyReportTransitions: BalanceTransition[] = [
      { scope: "customer", component: "money", before: 30, after: 70, display_name: "Customer A", display_description: null, intent: null },
      { scope: "customer", component: "cyl_12", before: 1, after: 2, display_name: "Customer A", display_description: null, intent: null },
    ];
    const event = orderToEvent(
      makeOrder({
        id: "later-order",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 40,
        paid_amount: 0,
        money_balance_before: 30,
        money_balance_after: 70,
        cyl_balance_before: { "12kg": 1, "48kg": 0 },
        cyl_balance_after: { "12kg": 2, "48kg": 0 },
      }),
      { customerName: "Customer A" }
    );

    expect(transition(event.balance_transitions, "money")).toMatchObject({
      scope: dailyReportTransitions[0].scope,
      component: dailyReportTransitions[0].component,
      before: dailyReportTransitions[0].before,
      after: dailyReportTransitions[0].after,
    });
    expect(transition(event.balance_transitions, "cyl_12")).toMatchObject({
      scope: dailyReportTransitions[1].scope,
      component: dailyReportTransitions[1].component,
      before: dailyReportTransitions[1].before,
      after: dailyReportTransitions[1].after,
    });
    expect(transition(event.balance_transitions, "cyl_48")).toBeUndefined();
  });
});
