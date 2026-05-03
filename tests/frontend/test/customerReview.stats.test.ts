jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: "customer-1" })),
}));

jest.mock("expo-linking", () => ({
  openURL: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock("@/constants/gas", () => ({
  gasColor: jest.fn(() => "#000"),
}));

jest.mock("@/lib/date", () => ({
  formatDateTimeMedium: jest.fn((value: string) => value),
}));

jest.mock("@/lib/money", () => ({
  getCurrencySymbol: jest.fn(() => "₪"),
  getMoneyDecimals: jest.fn(() => 2),
}));

jest.mock("@/hooks/useCollections", () => ({
  useCollections: jest.fn(),
  useDeleteCollection: jest.fn(),
}));

jest.mock("@/hooks/useCustomers", () => ({
  CUSTOMER_DELETE_BLOCKED_MESSAGE: "blocked",
  isCustomerDeleteBlockedError: jest.fn(() => false),
  useCustomerAdjustments: jest.fn(),
  useCustomerBalance: jest.fn(),
  useCustomers: jest.fn(),
  useDeleteCustomer: jest.fn(),
}));

jest.mock("@/hooks/useOrders", () => ({
  useDeleteOrder: jest.fn(),
  useOrders: jest.fn(),
}));

jest.mock("@/hooks/useSystems", () => ({
  useDeleteSystem: jest.fn(),
  useSystems: jest.fn(),
}));

jest.mock("@/components/reports/SlimActivityRow", () => "SlimActivityRow");

jest.mock("@/lib/activityAdapter", () => ({
  collectionToEvent: jest.fn(),
  customerAdjustmentToEvent: jest.fn(),
  orderToEvent: jest.fn(),
}));

import {
  getLastActiveOrder,
  getOrderCylinders,
  sortCustomerActivityEvents,
} from "@/app/customers/[id]";
import type { Order } from "@/types/domain";
import type { DailyReportEvent } from "@/types/report";

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

function makeEvent(overrides: Partial<DailyReportEvent> = {}): DailyReportEvent {
  return {
    event_type: "order",
    id: "event-1",
    effective_at: "2025-01-02T09:00:00.000Z",
    created_at: "2025-01-02T09:00:00.000Z",
    source_id: null,
    display_name: null,
    display_description: null,
    time_display: null,
    event_kind: null,
    activity_type: null,
    hero_primary: null,
    money_delta: null,
    status: null,
    context_line: null,
    notes: null,
    label: null,
    label_short: null,
    is_balanced: null,
    action_lines: null,
    status_mode: null,
    is_ok: null,
    is_atomic_ok: null,
    status_badge: null,
    action_pills: null,
    remaining_actions: null,
    has_other_outstanding_cylinders: null,
    has_other_outstanding_cash: null,
    counterparty: null,
    counterparty_display: null,
    system: null,
    hero: null,
    hero_text: null,
    money: null,
    money_amount: null,
    money_direction: null,
    money_received: null,
    transfer_direction: null,
    settlement: null,
    open_actions: null,
    order_mode: "replacement",
    gas_type: "12kg",
    customer_id: null,
    customer_name: null,
    customer_description: null,
    system_name: null,
    system_type: null,
    expense_type: null,
    reason: null,
    note: null,
    buy12: null,
    return12: null,
    buy48: null,
    return48: null,
    total_cost: null,
    paid_now: null,
    order_total: null,
    order_paid: null,
    order_installed: null,
    order_received: null,
    cash_before: null,
    cash_after: null,
    bank_before: null,
    bank_after: null,
    customer_money_before: null,
    customer_money_after: null,
    customer_12kg_before: null,
    customer_12kg_after: null,
    customer_48kg_before: null,
    customer_48kg_after: null,
    company_before: null,
    company_after: null,
    company_12kg_before: null,
    company_12kg_after: null,
    company_48kg_before: null,
    company_48kg_after: null,
    inventory_before: null,
    inventory_after: null,
    balance_transitions: null,
    ...overrides,
  };
}

describe("customer review derived stats", () => {
  it("returns the newest active order when the newest order is deleted", () => {
    const lastOrder = getLastActiveOrder([
      makeOrder({
        id: "deleted-newest",
        delivered_at: "2025-03-03T09:00:00.000Z",
        is_deleted: true,
      }),
      makeOrder({
        id: "active-middle",
        delivered_at: "2025-02-02T09:00:00.000Z",
      }),
      makeOrder({
        id: "active-oldest",
        delivered_at: "2025-01-01T09:00:00.000Z",
      }),
    ]);

    expect(lastOrder?.id).toBe("active-middle");
  });

  it("returns undefined when all orders are deleted", () => {
    const lastOrder = getLastActiveOrder([
      makeOrder({ id: "deleted-1", is_deleted: true }),
      makeOrder({ id: "deleted-2", is_deleted: true, delivered_at: "2025-01-03T09:00:00.000Z" }),
    ]);

    expect(lastOrder).toBeUndefined();
  });

  it("excludes deleted replacements from cylinders ordered", () => {
    const totals = getOrderCylinders([
      makeOrder({
        id: "active",
        gas_type: "12kg",
        cylinders_installed: 2,
      }),
      makeOrder({
        id: "deleted",
        gas_type: "12kg",
        cylinders_installed: 3,
        is_deleted: true,
      }),
    ]);

    expect(totals).toEqual({ "12kg": 2, "48kg": 0 });
  });

  it("excludes buy_iron orders from last active order date", () => {
    const lastOrder = getLastActiveOrder([
      makeOrder({
        id: "buy-iron-newest",
        order_mode: "buy_iron",
        delivered_at: "2025-03-03T09:00:00.000Z",
      }),
      makeOrder({
        id: "replacement-older",
        order_mode: "replacement",
        delivered_at: "2025-02-02T09:00:00.000Z",
      }),
    ]);

    expect(lastOrder?.id).toBe("replacement-older");
  });

  it("returns undefined when only buy_iron orders exist", () => {
    const lastOrder = getLastActiveOrder([
      makeOrder({ id: "buy-iron-1", order_mode: "buy_iron" }),
      makeOrder({ id: "buy-iron-2", order_mode: "buy_iron", delivered_at: "2025-03-03T09:00:00.000Z" }),
    ]);

    expect(lastOrder).toBeUndefined();
  });

  it("excludes buy_iron orders from cylinders ordered", () => {
    const totals = getOrderCylinders([
      makeOrder({
        id: "replacement",
        order_mode: "replacement",
        gas_type: "12kg",
        cylinders_installed: 2,
      }),
      makeOrder({
        id: "buy-empty",
        order_mode: "buy_iron",
        gas_type: "12kg",
        cylinders_installed: 5,
        cylinders_received: 5,
      }),
    ]);

    expect(totals).toEqual({ "12kg": 2, "48kg": 0 });
  });

  it("sorts activity events by effective_at before created_at", () => {
    const sorted = sortCustomerActivityEvents([
      makeEvent({
        id: "backdated-created-late",
        effective_at: "2025-01-01T09:00:00.000Z",
        created_at: "2025-03-01T09:00:00.000Z",
      }),
      makeEvent({
        id: "newer-effective",
        effective_at: "2025-02-01T09:00:00.000Z",
        created_at: "2025-02-01T09:00:00.000Z",
      }),
    ]);

    expect(sorted.map((event) => event.id)).toEqual(["newer-effective", "backdated-created-late"]);
  });
});
