import { pickBetter } from "@/hooks/useOrders";
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
    paid_amount: 50,
    debt_cash: 50,
    debt_cylinders_12: 1,
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

describe("pickBetter", () => {
  it("prefers active over deleted for the same public id", () => {
    const deleted = makeOrder({ is_deleted: true, price_total: 100 });
    const active = makeOrder({ is_deleted: false, price_total: 150 });

    expect(pickBetter(deleted, active)).toBe(active);
    expect(pickBetter(active, deleted)).toBe(active);
  });

  it("prefers newer delivered_at when both are active", () => {
    const older = makeOrder({ delivered_at: "2025-01-02T09:00:00.000Z" });
    const newer = makeOrder({ delivered_at: "2025-01-02T10:00:00.000Z" });

    expect(pickBetter(older, newer)).toBe(newer);
  });

  it("prefers newer created_at when delivered_at ties", () => {
    const older = makeOrder({ created_at: "2025-01-02T09:00:00.000Z" });
    const newer = makeOrder({ created_at: "2025-01-02T09:30:00.000Z" });

    expect(pickBetter(older, newer)).toBe(newer);
  });

  it("prefers newer delivered_at when both are deleted", () => {
    const older = makeOrder({ is_deleted: true, delivered_at: "2025-01-02T09:00:00.000Z" });
    const newer = makeOrder({ is_deleted: true, delivered_at: "2025-01-02T10:00:00.000Z" });

    expect(pickBetter(older, newer)).toBe(newer);
  });
});
