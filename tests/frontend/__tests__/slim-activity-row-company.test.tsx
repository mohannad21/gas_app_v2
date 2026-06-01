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
    id: "company-event-1",
    source_id: "company-event-1",
    event_type: "refill",
    effective_at: "2026-05-14T09:00:00.000Z",
    created_at: "2026-05-14T09:00:00.000Z",
    display_name: "Company",
    display_description: null,
    label: "Refill",
    context_line: "Refill",
    money_amount: null,
    money_direction: "out",
    money_delta: null,
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
    buy12: null,
    buy48: null,
    return12: null,
    return48: null,
    total_cost: null,
    paid_amount: null,
    wallet_before: 500,
    wallet_after: 500,
    company_before: 0,
    company_after: 0,
    company_12kg_before: 0,
    company_12kg_after: 0,
    company_48kg_before: 0,
    company_48kg_after: 0,
    balance_transitions: null,
    ...overrides,
  } as DailyReportEvent;
}

describe("SlimActivityRow company activity rendering", () => {
  it("renders the refill icon and label", () => {
    const { getByTestId, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          buy12: 3,
          buy48: 1,
          return12: 2,
          return48: 1,
          total_cost: 150,
          paid_amount: 120,
          company_before: 40,
          company_after: 70,
          company_12kg_before: 5,
          company_12kg_after: 4,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByTestId("activity-icon")).toBeTruthy();
    expect(getByText("Refill")).toBeTruthy();
    expect(getByText("Bought: 3x 12kg | 1x 48kg")).toBeTruthy();
    expect(getByText("Returned: 2x 12kg | 1x 48kg")).toBeTruthy();
  });

  it("uses the canonical refill label for return-only refill rows", () => {
    const { getAllByText, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "refill",
          label: "Returned empties",
          context_line: "Returned empties",
          buy12: 0,
          buy48: 0,
          return12: 2,
          return48: 1,
          total_cost: 0,
          paid_amount: 0,
          company_12kg_before: -3,
          company_12kg_after: -1,
          company_48kg_before: -2,
          company_48kg_after: -1,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getAllByText("Refill").length).toBeGreaterThan(0);
    expect(getByText("Returned: 2x 12kg | 1x 48kg")).toBeTruthy();
  });

  it("renders dist_return_empties with the canonical empties-to-company label", () => {
    const { getAllByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "dist_return_empties",
          label: "Returned empties",
          context_line: "Returned empties",
          buy12: 0,
          buy48: 0,
          return12: 3,
          return48: 0,
          company_12kg_before: -5,
          company_12kg_after: -2,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getAllByText("Empties to company").length).toBeGreaterThan(0);
  });

  it("renders buy_full_from_company with the canonical buy fulls label", () => {
    const { getAllByText, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "buy_full_from_company",
          label: "Bought full",
          context_line: "Bought full",
          buy12: 4,
          buy48: 2,
          return12: 0,
          return48: 0,
          paid_amount: 250,
          total_cost: 300,
          company_before: 10,
          company_after: 60,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getAllByText("Buy fulls").length).toBeGreaterThan(0);
    expect(getByText("Bought: 4x 12kg | 2x 48kg")).toBeTruthy();
  });

  it("renders the expense icon and label", () => {
    const { getByTestId, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "expense",
          id: "expense-1",
          source_id: "expense-1",
          display_name: null,
          label: "Expense",
          context_line: "Expense",
          expense_type: "Fuel",
          money_amount: 45,
          money_direction: "out",
          wallet_before: 500,
          wallet_after: 455,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByTestId("activity-icon")).toBeTruthy();
    expect(getByText("Expense")).toBeTruthy();
    expect(getByText("Fuel")).toBeTruthy();
    expect(getByText("-45 $")).toBeTruthy();
  });

  it("renders the cash adjustment icon and label", () => {
    const { getAllByText, getByTestId, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "cash_adjust",
          id: "cash-adjust-1",
          source_id: "cash-adjust-1",
          display_name: null,
          label: "Wallet adjustment",
          context_line: "Wallet adjustment",
          reason: "Till correction",
          money_delta: 25,
          money_direction: "in",
          wallet_before: 455,
          wallet_after: 480,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByTestId("activity-icon")).toBeTruthy();
    expect(getAllByText("Adjust wallet").length).toBeGreaterThan(0);
    expect(getAllByText("Till correction").length).toBeGreaterThan(0);
    expect(getByText("+25 $")).toBeTruthy();
  });

  it("renders the bank deposit icon and label", () => {
    const { getByTestId, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "bank_deposit",
          id: "bank-deposit-1",
          source_id: "bank-deposit-1",
          display_name: "Bank transfer",
          label: "Wallet to bank",
          context_line: "Wallet to bank",
          money_amount: 200,
          money_direction: "out",
          transfer_direction: "wallet_to_bank",
          wallet_before: 480,
          wallet_after: 280,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByTestId("activity-icon")).toBeTruthy();
    expect(getByText("Wallet to bank")).toBeTruthy();
    expect(getByText("Bank transfer")).toBeTruthy();
    expect(getByText("-200 $")).toBeTruthy();
  });

  it("renders payment_from_company label and icon", () => {
    const { getByTestId, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "payment_from_company",
          id: "payment-from-company-1",
          source_id: "payment-from-company-1",
          display_name: "Company",
          label: "Payment from company",
          context_line: "Payment from company",
          money_amount: 300,
          money_direction: "in",
          counterparty: { type: "company", display_name: "Company", description: null, display: null },
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByTestId("activity-icon")).toBeTruthy();
    expect(getByText("Payment from company")).toBeTruthy();
  });

  it("renders payment_from_company canonical money direction", () => {
    const { getByTestId, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "payment_from_company",
          id: "payment-from-company-2",
          source_id: "payment-from-company-2",
          display_name: "Company",
          label: "Payment from company",
          context_line: "Payment from company",
          money_amount: 300,
          money_direction: "in",
          counterparty: { type: "company", display_name: "Company", description: null, display: null },
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByTestId("activity-icon")).toBeTruthy();
    expect(getByText("Payment from company")).toBeTruthy();
    expect(getByText("+300 $")).toBeTruthy();
  });

  it("bank_deposit + transfer_direction='bank_to_wallet' renders Bank to wallet label and positive amount", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "bank_deposit",
          id: "bank-btw-1",
          source_id: "bank-btw-1",
          display_name: "Bank transfer",
          label: "Bank to wallet",
          context_line: "Bank to wallet",
          money_amount: 200,
          money_direction: "in",
          transfer_direction: "bank_to_wallet",
          wallet_before: 280,
          wallet_after: 480,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("Bank to wallet")).toBeTruthy();
    expect(getByText("+200 $")).toBeTruthy();
  });

  it("canonical event_type 'wallet_to_bank' renders without needing transfer_direction field", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "wallet_to_bank",
          id: "wtb-canonical-1",
          source_id: "wtb-canonical-1",
          display_name: "Bank transfer",
          label: "Wallet to bank",
          context_line: "Wallet to bank",
          money_amount: 150,
          money_direction: "out",
          wallet_before: 500,
          wallet_after: 350,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("Wallet to bank")).toBeTruthy();
    expect(getByText("-150 $")).toBeTruthy();
  });

  it("canonical event_type 'bank_to_wallet' renders without needing transfer_direction field", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "bank_to_wallet",
          id: "btw-canonical-1",
          source_id: "btw-canonical-1",
          display_name: "Bank transfer",
          label: "Bank to wallet",
          context_line: "Bank to wallet",
          money_amount: 150,
          money_direction: "in",
          wallet_before: 350,
          wallet_after: 500,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("Bank to wallet")).toBeTruthy();
    expect(getByText("+150 $")).toBeTruthy();
  });

  it("bank direction comes from transfer_direction, not from label text", () => {
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "bank_deposit",
          id: "bank-anti-label-1",
          source_id: "bank-anti-label-1",
          display_name: "Bank transfer",
          label: "Wallet to bank",
          context_line: "Wallet to bank",
          money_amount: 100,
          money_direction: "in",
          transfer_direction: "bank_to_wallet",
          wallet_before: 200,
          wallet_after: 300,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("+100 $")).toBeTruthy();
    expect(queryByText("-100 $")).toBeNull();
  });
});
