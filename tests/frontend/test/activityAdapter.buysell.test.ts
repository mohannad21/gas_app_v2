import { orderToEvent } from "@/lib/activityAdapter";
import type { Order } from "@/types/domain";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    customer_id: "customer-1",
    system_id: "system-1",
    delivered_at: "2025-01-02T09:00:00.000Z",
    created_at: "2025-01-02T09:00:00.000Z",
    updated_at: null,
    order_mode: "replacement",
    gas_type: "12kg",
    cylinders_installed: 1,
    cylinders_received: 0,
    price_total: 100,
    paid_amount: 0,
    debt_cash: 0,
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

describe("orderToEvent money direction", () => {
  it("uses outgoing money direction for buy_iron with payment", () => {
    const event = orderToEvent(
      makeOrder({
        order_mode: "buy_iron",
        paid_amount: 5,
        price_total: 5,
        cylinders_received: 1,
      })
    );

    expect(event.money_direction).toBe("out");
  });

  it("uses incoming money direction for replacement with payment", () => {
    const event = orderToEvent(
      makeOrder({
        order_mode: "replacement",
        paid_amount: 100,
        price_total: 150,
      })
    );

    expect(event.money_direction).toBe("in");
  });

  it("uses incoming money direction for sell_iron with payment", () => {
    const event = orderToEvent(
      makeOrder({
        order_mode: "sell_iron",
        paid_amount: 50,
        price_total: 80,
      })
    );

    expect(event.money_direction).toBe("in");
  });

  it("returns null money direction when there is no payment", () => {
    const event = orderToEvent(
      makeOrder({
        order_mode: "buy_iron",
        paid_amount: 0,
        price_total: 0,
      })
    );

    expect(event.money_direction).toBeNull();
  });
});
