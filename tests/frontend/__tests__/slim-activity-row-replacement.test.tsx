import React from "react";
import { render } from "@testing-library/react-native";

import SlimActivityRow from "@/components/reports/SlimActivityRow";
import type { DailyReportEvent } from "@/types/domain";

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

function makeReplacementEvent(overrides: Partial<DailyReportEvent> = {}): DailyReportEvent {
  return {
    id: "replacement-1",
    source_id: "replacement-1",
    event_type: "order",
    effective_at: "2026-05-14T09:00:00.000Z",
    created_at: "2026-05-14T09:00:00.000Z",
    display_name: "Customer A",
    display_description: null,
    label: "Replacement",
    context_line: "Order",
    order_mode: "replacement",
    gas_type: "12kg",
    order_installed: 2,
    order_received: 1,
    order_total: 100,
    order_paid: 70,
    money_amount: 70,
    money_direction: "in",
    customer_money_before: 0,
    customer_money_after: 30,
    customer_12kg_before: 0,
    customer_12kg_after: 1,
    customer_48kg_before: 0,
    customer_48kg_after: 0,
    balance_transitions: null,
    counterparty: { type: "customer", display_name: "Customer A", description: null, display: null },
    wallet_before: 0,
    wallet_after: 0,
    ...overrides,
  } as DailyReportEvent;
}

describe("SlimActivityRow replacement rendering", () => {
  it("renders 12kg partial-payment replacement wording and balance pills", () => {
    const { getByText } = render(<SlimActivityRow event={makeReplacementEvent()} formatMoney={(value) => String(value)} />);

    expect(getByText("Installed: 2x 12kg")).toBeTruthy();
    expect(getByText("Received: 1x 12kg")).toBeTruthy();
    expect(getByText(/Money balance: Settled.*30 \$ debts.*customer/)).toBeTruthy();
    expect(getByText(/12kg balance: Settled.*1 debt.*customer/)).toBeTruthy();
  });

  it("omits money and cylinder pills when both customer balances stay settled", () => {
    const { queryByText } = render(
      <SlimActivityRow
        event={makeReplacementEvent({
          order_received: 2,
          order_paid: 100,
          money_amount: 100,
          customer_money_before: 0,
          customer_money_after: 0,
          customer_12kg_before: 0,
          customer_12kg_after: 0,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(queryByText(/Money balance:/)).toBeNull();
    expect(queryByText(/12kg balance:/)).toBeNull();
    expect(queryByText(/48kg balance:/)).toBeNull();
  });

  it("renders only the cylinder pill when payment is full but cylinder debt remains", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeReplacementEvent({
          order_paid: 100,
          money_amount: 100,
          customer_money_before: 0,
          customer_money_after: 0,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(queryByText(/Money balance:/)).toBeNull();
    expect(getByText(/12kg balance: Settled.*1 debt.*customer/)).toBeTruthy();
  });

  it("renders only 48kg cylinder balance for a 48kg replacement", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeReplacementEvent({
          gas_type: "48kg",
          order_installed: 1,
          order_received: 0,
          order_total: 200,
          order_paid: 150,
          money_amount: 150,
          customer_money_before: 0,
          customer_money_after: 50,
          customer_12kg_before: 0,
          customer_12kg_after: 0,
          customer_48kg_before: 0,
          customer_48kg_after: 1,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("Installed: 1x 48kg")).toBeTruthy();
    expect(getByText("Received: 0x 48kg")).toBeTruthy();
    expect(getByText(/Money balance: Settled.*50 \$ debts.*customer/)).toBeTruthy();
    expect(getByText(/48kg balance: Settled.*1 debt.*customer/)).toBeTruthy();
    expect(queryByText(/12kg balance:/)).toBeNull();
  });

  it("shows updated later-card pills after a backdated replacement is added", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeReplacementEvent({
          id: "later-order-after-backdate",
          order_installed: 1,
          order_received: 0,
          order_total: 40,
          order_paid: 0,
          money_amount: null,
          customer_money_before: 30,
          customer_money_after: 70,
          customer_12kg_before: 1,
          customer_12kg_after: 2,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText(/Money balance: debts 30 \$.*70 \$ debts.*customer/)).toBeTruthy();
    expect(getByText(/12kg balance: debt 1.*2 debts.*customer/)).toBeTruthy();
    expect(queryByText(/Settled.*40 \$ debts/)).toBeNull();
  });

  it("shows reverted later-card pills after a backdated replacement is deleted", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeReplacementEvent({
          id: "later-order-after-backdate-delete",
          order_installed: 1,
          order_received: 0,
          order_total: 40,
          order_paid: 0,
          money_amount: null,
          customer_money_before: 0,
          customer_money_after: 40,
          customer_12kg_before: 0,
          customer_12kg_after: 1,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText(/Money balance: Settled.*40 \$ debts.*customer/)).toBeTruthy();
    expect(getByText(/12kg balance: Settled.*1 debt.*customer/)).toBeTruthy();
    expect(queryByText(/debts 30 \$.*70 \$ debts/)).toBeNull();
  });

  it("shows unchanged non-zero customer pills with unchanged wording", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeReplacementEvent({
          customer_money_before: 30,
          customer_money_after: 30,
          customer_12kg_before: 1,
          customer_12kg_after: 1,
          customer_48kg_before: 0,
          customer_48kg_after: 0,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText(/Money balance:.*unchanged/)).toBeTruthy();
    expect(getByText(/12kg balance:.*unchanged/)).toBeTruthy();
    expect(queryByText(/48kg balance:/)).toBeNull();
  });

  it("renders the same pill text from direct fields and balance_transitions fallback", () => {
    const direct = render(
      <SlimActivityRow
        event={makeReplacementEvent({
          customer_money_before: 30,
          customer_money_after: 70,
          customer_12kg_before: 1,
          customer_12kg_after: 2,
          balance_transitions: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );
    const fallback = render(
      <SlimActivityRow
        event={makeReplacementEvent({
          customer_money_before: null,
          customer_money_after: null,
          customer_12kg_before: null,
          customer_12kg_after: null,
          customer_48kg_before: null,
          customer_48kg_after: null,
          balance_transitions: [
            { scope: "customer", component: "money", before: 30, after: 70 },
            { scope: "customer", component: "cyl_12", before: 1, after: 2 },
          ],
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(direct.getByText(/Money balance: debts 30 \$.*70 \$ debts.*customer/)).toBeTruthy();
    expect(fallback.getByText(/Money balance: debts 30 \$.*70 \$ debts.*customer/)).toBeTruthy();
    expect(direct.getByText(/12kg balance: debt 1.*2 debts.*customer/)).toBeTruthy();
    expect(fallback.getByText(/12kg balance: debt 1.*2 debts.*customer/)).toBeTruthy();
  });
});
