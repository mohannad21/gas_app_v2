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

function makeEvent(overrides: Partial<DailyReportEvent> = {}): DailyReportEvent {
  return {
    id: "collection-1",
    source_id: "collection-1",
    event_type: "collection_money",
    effective_at: "2026-05-14T09:00:00.000Z",
    created_at: "2026-05-14T09:00:00.000Z",
    display_name: "Customer A",
    display_description: null,
    label: "Customer paid",
    context_line: "Customer paid",
    hero_text: "Payment 70",
    customer_name: "Customer A",
    customer_money_before: 100,
    customer_money_after: 30,
    customer_12kg_before: 0,
    customer_12kg_after: 0,
    customer_48kg_before: 0,
    customer_48kg_after: 0,
    money_amount: 70,
    money_direction: "in",
    balance_transitions: null,
    counterparty: { type: "customer", display_name: "Customer A", description: null, display: null },
    wallet_before: null,
    wallet_after: null,
    return12: null,
    return48: null,
    ...overrides,
  } as DailyReportEvent;
}

describe("SlimActivityRow collection rendering", () => {
  it("renders payment wording with only the money pill", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow event={makeEvent()} formatMoney={(value) => String(value)} />
    );

    expect(getByText("Payment 70")).toBeTruthy();
    expect(getByText(/Money balance: debts 100 \$.*30 \$ debts.*customer/)).toBeTruthy();
    expect(queryByText(/12kg balance:/)).toBeNull();
    expect(queryByText(/48kg balance:/)).toBeNull();
  });

  it("renders payout wording with signed money before and after", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeEvent({
          id: "collection-payout",
          source_id: "collection-payout",
          event_type: "collection_payout",
          label: "Paid customer",
          context_line: "Paid customer",
          hero_text: "Payout 40",
          customer_money_before: -100,
          customer_money_after: -60,
          money_amount: 40,
          money_direction: "out",
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("Payout 40")).toBeTruthy();
    expect(getByText(/Money balance: credit 100 \$.*60 \$ credit.*customer/)).toBeTruthy();
    expect(queryByText(/12kg balance:/)).toBeNull();
    expect(queryByText(/48kg balance:/)).toBeNull();
  });

  it("renders mixed return with only cylinder pills", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeEvent({
          id: "collection-return",
          source_id: "collection-return",
          event_type: "collection_empty",
          label: "Returned empties",
          context_line: "Returned empties",
          hero_text: "Returned 2x12kg | 1x48kg empties",
          customer_money_before: 0,
          customer_money_after: 0,
          customer_12kg_before: 3,
          customer_12kg_after: 1,
          customer_48kg_before: 2,
          customer_48kg_after: 1,
          return12: 2,
          return48: 1,
          money_amount: null,
          money_direction: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("Returned 2x12kg | 1x48kg empties")).toBeTruthy();
    expect(queryByText(/Money balance:/)).toBeNull();
    expect(getByText(/12kg balance: debts 3.*1 debt.*customer/)).toBeTruthy();
    expect(getByText(/48kg balance: debts 2.*1 debt.*customer/)).toBeTruthy();
  });

  it("shows shifted same-customer payment pills after a backdated collection changes /collections live balances", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeEvent({
          id: "later-payment-after-backdate",
          source_id: "later-payment-after-backdate",
          hero_text: "Payment 20",
          customer_money_before: 30,
          customer_money_after: 10,
          money_amount: 20,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText(/Money balance: debts 30 \$.*10 \$ debts.*customer/)).toBeTruthy();
    expect(queryByText(/12kg balance:/)).toBeNull();
  });

  it("shows unchanged non-zero collection pills with unchanged wording", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          customer_money_before: 30,
          customer_money_after: 30,
          customer_12kg_before: 1,
          customer_12kg_after: 1,
          customer_48kg_before: 2,
          customer_48kg_after: 2,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText(/Money balance:.*unchanged/)).toBeTruthy();
    expect(getByText(/12kg balance:.*unchanged/)).toBeTruthy();
    expect(getByText(/48kg balance:.*unchanged/)).toBeTruthy();
  });
});
