import React from "react";
import { render } from "@testing-library/react-native";

import SlimActivityRow from "@/components/reports/SlimActivityRow";
import {
  collectionToEvent,
  customerAdjustmentToEvent,
  orderToEvent,
} from "@/lib/activityAdapter";
import type { CollectionEvent, CustomerAdjustment, Order } from "@/types/domain";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

jest.mock("@/lib/money", () => ({
  formatDisplayMoney: (value: number) => String(value),
  getCurrencySymbol: () => "$",
}));

const fmt = (value: number) => String(value);

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    customer_id: "cust-1",
    system_id: "sys-1",
    order_mode: "replacement",
    gas_type: "12kg",
    cylinders_installed: 1,
    cylinders_received: 0,
    price_total: 100,
    paid_amount: 0,
    debt_cash: 0,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    delivered_at: "2026-05-14T09:00:00Z",
    created_at: "2026-05-14T09:00:00Z",
    updated_at: null,
    note: null,
    is_deleted: false,
    ...overrides,
  } as Order;
}

function makeCollection(overrides: Partial<CollectionEvent> = {}): CollectionEvent {
  return {
    id: "col-1",
    customer_id: "cust-1",
    action_type: "payment",
    amount_money: 50,
    qty_12kg: 0,
    qty_48kg: 0,
    debt_cash: 0,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    effective_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    ...overrides,
  } as CollectionEvent;
}

function makeCustomerAdjustment(overrides: Partial<CustomerAdjustment> = {}): CustomerAdjustment {
  return {
    id: "adj-1",
    customer_id: "cust-1",
    amount_money: 50,
    count_12kg: 0,
    count_48kg: 0,
    effective_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    debt_cash: 100,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    ...overrides,
  } as CustomerAdjustment;
}

describe("pipeline: customer activities adapter -> SlimActivityRow", () => {
  it('replacement renders canonical label "Replace"', () => {
    const event = orderToEvent(makeOrder({ order_mode: "replacement" }));

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Replace").length).toBeGreaterThan(0);
  });

  it('sell_full renders canonical label "Sell full"', () => {
    const event = orderToEvent(makeOrder({ order_mode: "sell_iron" }));

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Sell full").length).toBeGreaterThan(0);
  });

  it('buy_empty_from_customer renders canonical label "Buy empties"', () => {
    const event = orderToEvent(makeOrder({ order_mode: "buy_iron" }));

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Buy empties").length).toBeGreaterThan(0);
  });

  it('payment_from_customer renders canonical label "Payment from customer"', () => {
    const event = collectionToEvent(makeCollection({ action_type: "payment", amount_money: 50 }));

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Payment from customer").length).toBeGreaterThan(0);
  });

  it('payment_to_customer renders canonical label "Payment to customer"', () => {
    const event = collectionToEvent(makeCollection({ action_type: "payout", amount_money: 30 }));

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Payment to customer").length).toBeGreaterThan(0);
  });

  it('customer_return_empties renders canonical label "Empties from customer"', () => {
    const event = collectionToEvent(
      makeCollection({ action_type: "return", qty_12kg: 2, qty_48kg: 0, debt_cylinders_12: 2 })
    );

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Empties from customer").length).toBeGreaterThan(0);
  });

  it('adjust_customer_balance renders canonical label "Adjust customer balance"', () => {
    const event = customerAdjustmentToEvent(makeCustomerAdjustment());

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Adjust customer balance").length).toBeGreaterThan(0);
  });
});
