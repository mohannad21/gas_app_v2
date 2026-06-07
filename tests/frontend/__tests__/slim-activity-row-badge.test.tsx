import React from "react";
import { render } from "@testing-library/react-native";

import SlimActivityRow from "@/components/reports/SlimActivityRow";
import type { DailyReportEvent } from "@/types/domain";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

jest.mock("@/lib/money", () => ({ getCurrencySymbol: () => "$" }));

const fmt = (value: number) => String(value);

function makeEvent(overrides: Partial<DailyReportEvent>): DailyReportEvent {
  return {
    id: "badge-test",
    source_id: "badge-test",
    effective_at: "2026-01-01T10:00:00Z",
    created_at: "2026-01-01T10:00:00Z",
    display_name: "Test",
    display_description: null,
    label: "Test",
    context_line: "Test",
    money_amount: null,
    money_direction: "none",
    money_delta: null,
    counterparty: null,
    buy12: null,
    buy48: null,
    return12: null,
    return48: null,
    total_cost: null,
    paid_amount: null,
    order_total: null,
    order_paid: null,
    wallet_before: null,
    wallet_after: null,
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
    balance_transitions: null,
    ...overrides,
  } as DailyReportEvent;
}

describe("SlimActivityRow badge - ratio kinds", () => {
  it("replacement shows +paid / total", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "replacement",
          order_total: 100,
          money_amount: 70,
          money_direction: "out",
        })}
        formatMoney={fmt}
      />
    );

    expect(getByText("+70 $")).toBeTruthy();
    expect(getByText(/\/ 100 \$/)).toBeTruthy();
  });

  it("sell_full shows +paid / total", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "sell_full",
          order_total: 120,
          money_amount: 80,
          money_direction: "out",
        })}
        formatMoney={fmt}
      />
    );

    expect(getByText("+80 $")).toBeTruthy();
    expect(getByText(/\/ 120 \$/)).toBeTruthy();
  });

  it("buy_empty_from_customer shows -paid / total", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "buy_empty_from_customer",
          order_total: 50,
          money_amount: 30,
          money_direction: "in",
        })}
        formatMoney={fmt}
      />
    );

    expect(getByText("-30 $")).toBeTruthy();
    expect(getByText(/\/ 50 \$/)).toBeTruthy();
  });

  it("buy_empty_from_customer zero-paid shows -0, not +0", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "buy_empty_from_customer",
          order_total: 50,
          money_amount: 0,
          money_direction: "none",
        })}
        formatMoney={fmt}
      />
    );

    expect(getByText("-0 $")).toBeTruthy();
    expect(queryByText("+0 $")).toBeNull();
  });

  it("refill shows -paid / total", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "refill",
          total_cost: 150,
          paid_amount: 100,
          money_direction: "in",
        })}
        formatMoney={fmt}
      />
    );

    expect(getByText("-100 $")).toBeTruthy();
    expect(getByText(/\/ 150 \$/)).toBeTruthy();
  });

  it("buy_full_from_company shows -paid / total", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "buy_full_from_company",
          total_cost: 200,
          paid_amount: 150,
          money_direction: "in",
        })}
        formatMoney={fmt}
      />
    );

    expect(getByText("-150 $")).toBeTruthy();
    expect(getByText(/\/ 200 \$/)).toBeTruthy();
  });

  it("ratio kinds show no badge when total is 0", () => {
    const { queryByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "sell_full",
          order_total: 0,
          money_amount: 0,
          money_direction: "in",
        })}
        formatMoney={fmt}
      />
    );

    expect(queryByText(/\$/)).toBeNull();
  });
});

describe("SlimActivityRow badge - money kinds", () => {
  it.each([
    ["payment_from_customer", { money_amount: 80, money_direction: "out" }, "+80 $"],
    ["payment_to_customer", { money_amount: 60, money_direction: "in" }, "-60 $"],
    ["payment_from_company", { money_amount: 300, money_direction: "out", total_cost: 999 }, "+300 $"],
    ["payment_to_company", { money_amount: 200, money_direction: "in", total_cost: 999 }, "-200 $"],
    ["expense", { money_amount: 45, money_direction: "in" }, "-45 $"],
    ["bank_to_wallet", { money_amount: 200, money_direction: "none" }, "+200 $"],
    ["wallet_to_bank", { money_amount: 150, money_direction: "none" }, "-150 $"],
  ] as const)("%s renders simple badge from registry", (eventType, overrides, expectedText) => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: eventType,
          ...overrides,
        })}
        formatMoney={fmt}
      />
    );

    expect(getByText(expectedText)).toBeTruthy();
    expect(queryByText(/\/ 999 \$/)).toBeNull();
  });
});

describe("SlimActivityRow badge - no-badge kinds", () => {
  it.each([
    "customer_return_empties",
    "adjust_customer_balance",
    "dist_return_empties",
    "adjust_company_balance",
    "adjust_inventory",
    "adjust_wallet",
  ] as const)("%s renders no money badge", (eventType) => {
    const { queryByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: eventType,
          money_amount: 99,
          money_delta: 99,
          money_direction: "in",
          total_cost: 100,
          paid_amount: 99,
          order_total: 100,
        })}
        formatMoney={fmt}
      />
    );

    expect(queryByText("+99 $")).toBeNull();
    expect(queryByText("-99 $")).toBeNull();
    expect(queryByText(/\/ 100 \$/)).toBeNull();
  });
});
