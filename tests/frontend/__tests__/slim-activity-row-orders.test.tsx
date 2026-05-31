import React from "react";
import { render } from "@testing-library/react-native";

import SlimActivityRow from "@/components/reports/SlimActivityRow";
import { orderToEvent } from "@/lib/activityAdapter";
import type { Order } from "@/types/domain";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock("@/lib/money", () => ({
  getCurrencySymbol: () => "$",
}));

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

describe("SlimActivityRow order rendering", () => {
  it("renders a sell full 12kg row with money pill and no cylinder pills", () => {
    const event = orderToEvent(makeOrder(), { customerName: "Customer A", systemName: "Kitchen" });
    const { getByText, queryByText } = render(<SlimActivityRow event={event} formatMoney={(value) => String(value)} />);

    expect(getByText("Sell full")).toBeTruthy();
    expect(getByText("Customer A")).toBeTruthy();
    expect(getByText("System: Kitchen")).toBeTruthy();
    expect(getByText("Installed: 1x 12kg")).toBeTruthy();
    expect(queryByText("Received: 0x 12kg")).toBeNull();
    expect(getByText(/Money balance:.*30 \$ debts.*customer/i)).toBeTruthy();
    expect(queryByText(/12kg balance:/i)).toBeNull();
    expect(queryByText(/48kg balance:/i)).toBeNull();
  });

  it("renders a sell full 48kg row with the correct gas label and no cylinder pills", () => {
    const event = orderToEvent(
      makeOrder({
        id: "sell-48",
        gas_type: "48kg",
        system_id: "system-48",
        cylinders_installed: 1,
        price_total: 120,
        paid_amount: 80,
        debt_cash: 40,
      }),
      { customerName: "Customer A", systemName: "Boiler" }
    );
    const { getByText, queryByText } = render(<SlimActivityRow event={event} formatMoney={(value) => String(value)} />);

    expect(getByText("Sell full")).toBeTruthy();
    expect(getByText("Installed: 1x 48kg")).toBeTruthy();
    expect(getByText(/Money balance:.*40 \$ debts.*customer/i)).toBeTruthy();
    expect(queryByText(/12kg balance:/i)).toBeNull();
    expect(queryByText(/48kg balance:/i)).toBeNull();
  });

  it("renders a buy empty 12kg row with an outgoing money pill and unchanged cylinder pill", () => {
    const event = orderToEvent(
      makeOrder({
        id: "buy-12",
        order_mode: "buy_iron",
        system_id: null,
        gas_type: "12kg",
        cylinders_installed: 0,
        cylinders_received: 1,
        price_total: 40,
        paid_amount: 30,
        debt_cash: -10,
        debt_cylinders_12: 3,
      }),
      { customerName: "Customer A" }
    );
    const { getByText, queryByText } = render(<SlimActivityRow event={event} formatMoney={(value) => String(value)} />);

    expect(getByText("Buy empties")).toBeTruthy();
    expect(getByText("Received: 1x 12kg")).toBeTruthy();
    expect(queryByText("Installed: 0x 12kg")).toBeNull();
    expect(getByText(/Money balance:.*10 \$ credit.*customer/i)).toBeTruthy();
    expect(getByText(/12kg balance:.*unchanged.*debts 3.*customer/i)).toBeTruthy();
    expect(queryByText(/48kg balance:/i)).toBeNull();
  });

  it("renders a buy empty 48kg row with the correct gas label and unchanged cylinder pill", () => {
    const event = orderToEvent(
      makeOrder({
        id: "buy-48",
        order_mode: "buy_iron",
        system_id: null,
        gas_type: "48kg",
        cylinders_installed: 0,
        cylinders_received: 1,
        price_total: 60,
        paid_amount: 20,
        debt_cash: -40,
        debt_cylinders_48: 2,
      }),
      { customerName: "Customer A" }
    );
    const { getByText, queryByText } = render(<SlimActivityRow event={event} formatMoney={(value) => String(value)} />);

    expect(getByText("Buy empties")).toBeTruthy();
    expect(getByText("Received: 1x 48kg")).toBeTruthy();
    expect(getByText(/Money balance:.*40 \$ credit.*customer/i)).toBeTruthy();
    expect(queryByText(/12kg balance:/i)).toBeNull();
    expect(getByText(/48kg balance:.*unchanged.*debts 2.*customer/i)).toBeTruthy();
  });

  it("shows shifted later sell-full money pills after a backdated order changes same-customer history", () => {
    const event = orderToEvent(
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
      }),
      { customerName: "Customer A" }
    );
    const { getByText, queryByText } = render(<SlimActivityRow event={event} formatMoney={(value) => String(value)} />);

    expect(getByText(/Money balance:.*debts.*10.*→.*30.*debts.*customer/i)).toBeTruthy();
    expect(queryByText(/12kg balance:/i)).toBeNull();
    expect(queryByText(/unchanged/i)).toBeNull();
  });
});
