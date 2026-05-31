import { orderToEvent } from "@/lib/activityAdapter";
import type { BalanceTransition, Order } from "@/types/domain";

function transition(
  transitions: BalanceTransition[] | null | undefined,
  component: BalanceTransition["component"]
): BalanceTransition | undefined {
  return transitions?.find((item) => item.scope === "customer" && item.component === component);
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    customer_id: "customer-a",
    system_id: "system-1",
    delivered_at: "2026-05-14T09:00:00Z",
    created_at: "2026-05-14T09:00:00Z",
    updated_at: null,
    order_mode: "sell_iron",
    gas_type: "12kg",
    cylinders_installed: 1,
    cylinders_received: 0,
    price_total: 100,
    paid_amount: 70,
    debt_cash: 30,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    applied_credit: null,
    money_balance_before: null,
    money_balance_after: null,
    cyl_balance_before: null,
    cyl_balance_after: null,
    note: null,
    is_deleted: false,
    ...overrides,
  };
}

describe("orderToEvent visible numbers", () => {
  it("maps sell full 12kg into money-only customer balance transitions", () => {
    const event = orderToEvent(
      makeOrder({
        id: "sell-12",
        order_mode: "sell_iron",
        gas_type: "12kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 100,
        paid_amount: 70,
        debt_cash: 30,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
      }),
      { customerName: "Customer A" }
    );

    expect(event.label).toBe("Sold full");
    expect(event.hero_text).toBe("Sold 1x12kg");
    expect(event.money_direction).toBe("in");
    expect(event.money_amount).toBe(70);
    expect(event.customer_money_before).toBe(0);
    expect(event.customer_money_after).toBe(30);
    expect(event.customer_12kg_before).toBe(0);
    expect(event.customer_12kg_after).toBe(0);
    expect(event.customer_48kg_before).toBe(0);
    expect(event.customer_48kg_after).toBe(0);
    expect(transition(event.balance_transitions, "money")).toMatchObject({ before: 0, after: 30 });
    expect(transition(event.balance_transitions, "cyl_12")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_48")).toBeUndefined();
  });

  it("maps sell full 48kg into money-only customer balance transitions", () => {
    const event = orderToEvent(
      makeOrder({
        id: "sell-48",
        order_mode: "sell_iron",
        gas_type: "48kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 120,
        paid_amount: 80,
        debt_cash: 40,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
      }),
      { customerName: "Customer A" }
    );

    expect(event.label).toBe("Sold full");
    expect(event.hero_text).toBe("Sold 1x48kg");
    expect(event.customer_money_before).toBe(0);
    expect(event.customer_money_after).toBe(40);
    expect(transition(event.balance_transitions, "money")).toMatchObject({ before: 0, after: 40 });
    expect(transition(event.balance_transitions, "cyl_12")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_48")).toBeUndefined();
  });

  it("maps buy empty 12kg into money-only customer balance transitions", () => {
    const event = orderToEvent(
      makeOrder({
        id: "buy-12",
        order_mode: "buy_iron",
        gas_type: "12kg",
        cylinders_installed: 0,
        cylinders_received: 1,
        price_total: 40,
        paid_amount: 30,
        debt_cash: -10,
        debt_cylinders_12: 3,
        debt_cylinders_48: 0,
      }),
      { customerName: "Customer A" }
    );

    expect(event.label).toBe("Bought empty");
    expect(event.hero_text).toBe("Bought 1x12kg empties");
    expect(event.money_direction).toBe("out");
    expect(event.money_amount).toBe(30);
    expect(event.customer_money_before).toBe(0);
    expect(event.customer_money_after).toBe(-10);
    expect(event.customer_12kg_before).toBe(3);
    expect(event.customer_12kg_after).toBe(3);
    expect(event.customer_48kg_before).toBe(0);
    expect(event.customer_48kg_after).toBe(0);
    expect(transition(event.balance_transitions, "money")).toMatchObject({ before: 0, after: -10 });
    expect(transition(event.balance_transitions, "cyl_12")).toMatchObject({ before: 3, after: 3 });
    expect(transition(event.balance_transitions, "cyl_48")).toBeUndefined();
  });

  it("maps buy empty 48kg into money-only customer balance transitions", () => {
    const event = orderToEvent(
      makeOrder({
        id: "buy-48",
        order_mode: "buy_iron",
        gas_type: "48kg",
        cylinders_installed: 0,
        cylinders_received: 1,
        price_total: 60,
        paid_amount: 20,
        debt_cash: -40,
        debt_cylinders_12: 0,
        debt_cylinders_48: 2,
      }),
      { customerName: "Customer A" }
    );

    expect(event.label).toBe("Bought empty");
    expect(event.hero_text).toBe("Bought 1x48kg empties");
    expect(event.customer_money_before).toBe(0);
    expect(event.customer_money_after).toBe(-40);
    expect(event.customer_12kg_before).toBe(0);
    expect(event.customer_12kg_after).toBe(0);
    expect(event.customer_48kg_before).toBe(2);
    expect(event.customer_48kg_after).toBe(2);
    expect(transition(event.balance_transitions, "money")).toMatchObject({ before: 0, after: -40 });
    expect(transition(event.balance_transitions, "cyl_12")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_48")).toMatchObject({ before: 2, after: 2 });
  });

  it("shifts same-customer later money transitions after a backdated sell full while leaving a different customer unchanged", () => {
    const beforeBackdate = orderToEvent(
      makeOrder({
        id: "later-same-customer",
        order_mode: "sell_iron",
        gas_type: "12kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 20,
        paid_amount: 0,
        money_balance_before: 0,
        money_balance_after: 20,
        debt_cash: 20,
      })
    );
    const afterBackdate = orderToEvent(
      makeOrder({
        id: "later-same-customer",
        order_mode: "sell_iron",
        gas_type: "12kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 20,
        paid_amount: 0,
        money_balance_before: 10,
        money_balance_after: 30,
        debt_cash: 30,
      })
    );
    const differentCustomer = orderToEvent(
      makeOrder({
        id: "later-other-customer",
        customer_id: "customer-b",
        order_mode: "sell_iron",
        gas_type: "12kg",
        cylinders_installed: 1,
        cylinders_received: 0,
        price_total: 20,
        paid_amount: 0,
        money_balance_before: 0,
        money_balance_after: 20,
        debt_cash: 20,
      })
    );

    expect(beforeBackdate.customer_money_before).toBe(0);
    expect(beforeBackdate.customer_money_after).toBe(20);
    expect(afterBackdate.customer_money_before).toBe(10);
    expect(afterBackdate.customer_money_after).toBe(30);
    expect(differentCustomer.customer_money_before).toBe(0);
    expect(differentCustomer.customer_money_after).toBe(20);
  });
});
