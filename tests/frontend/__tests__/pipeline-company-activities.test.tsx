import React from "react";
import { render } from "@testing-library/react-native";

import SlimActivityRow from "@/components/reports/SlimActivityRow";
import {
  companyBalanceAdjustmentToEvent,
  companyPaymentToEvent,
  refillSummaryToEvent,
} from "@/lib/activityAdapter";
import type {
  CompanyBalanceAdjustment,
  CompanyPayment,
  InventoryRefillSummary,
} from "@/types/domain";

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

function makeRefill(overrides: Partial<InventoryRefillSummary> = {}): InventoryRefillSummary {
  return {
    refill_id: "r-1",
    date: "2026-05-14",
    effective_at: "2026-05-14T09:00:00Z",
    created_at: "2026-05-14T09:00:00Z",
    buy12: 0,
    return12: 0,
    buy48: 0,
    return48: 0,
    new12: 0,
    new48: 0,
    total_cost: 0,
    paid_amount: 0,
    debt_cash: 0,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    is_deleted: false,
    ...overrides,
  } as InventoryRefillSummary;
}

function makeCompanyPayment(overrides: Partial<CompanyPayment> = {}): CompanyPayment {
  return {
    id: "cp-1",
    happened_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    amount: 50,
    note: null,
    is_deleted: false,
    live_debt_cash: 100,
    ...overrides,
  } as CompanyPayment;
}

function makeCompanyAdjustment(overrides: Partial<CompanyBalanceAdjustment> = {}): CompanyBalanceAdjustment {
  return {
    id: "ca-1",
    happened_at: "2026-05-14T11:00:00Z",
    created_at: "2026-05-14T11:00:00Z",
    money_balance: 120,
    cylinder_balance_12: 3,
    cylinder_balance_48: -1,
    delta_money: 20,
    delta_cylinder_12: -2,
    delta_cylinder_48: 1,
    live_debt_cash: 120,
    live_debt_cylinders_12: 3,
    live_debt_cylinders_48: -1,
    note: null,
    is_deleted: false,
    ...overrides,
  } as CompanyBalanceAdjustment;
}

describe("pipeline: company activities adapter -> SlimActivityRow", () => {
  it('refill renders canonical label "Refill"', () => {
    const event = refillSummaryToEvent(makeRefill({ buy12: 3, return12: 1 }));

    expect(event.event_type).toBe("refill");

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Refill").length).toBeGreaterThan(0);
  });

  it('dist_return_empties renders "Empties to company", not "Refill"', () => {
    const event = refillSummaryToEvent(
      makeRefill({
        kind: "dist_return_empties",
        buy12: 0,
        buy48: 0,
        return12: 2,
        return48: 1,
        live_debt_cylinders_12: 4,
        live_debt_cylinders_48: 2,
      })
    );

    expect(event.event_type).toBe("dist_return_empties");

    const { getAllByText, queryByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Empties to company").length).toBeGreaterThan(0);
    expect(queryByText("Refill", { exact: true })).toBeNull();
  });

  it('buy_full_from_company renders canonical label "Buy fulls"', () => {
    const event = refillSummaryToEvent(
      makeRefill({
        kind: "buy_full_from_company",
        buy12: 2,
        buy48: 1,
        new12: 2,
        new48: 1,
        total_cost: 300,
        paid_amount: 100,
        live_debt_cash: 50,
      })
    );

    expect(event.event_type).toBe("buy_full_from_company");

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Buy fulls").length).toBeGreaterThan(0);
  });

  it('payment_to_company renders canonical label "Payment to company"', () => {
    const event = companyPaymentToEvent(makeCompanyPayment({ amount: 50, live_debt_cash: 100 }));

    expect(event.event_type).toBe("payment_to_company");
    expect(event.money_direction).toBe("out");

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Payment to company").length).toBeGreaterThan(0);
  });

  it('payment_from_company renders canonical label "Payment from company"', () => {
    const event = companyPaymentToEvent(makeCompanyPayment({ amount: -30, live_debt_cash: 70 }));

    expect(event.event_type).toBe("payment_from_company");
    expect(event.money_direction).toBe("in");

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Payment from company").length).toBeGreaterThan(0);
  });

  it('adjust_company_balance renders canonical label "Adjust company balance"', () => {
    const event = companyBalanceAdjustmentToEvent(makeCompanyAdjustment());

    expect(event.event_type).toBe("adjust_company_balance");

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Adjust company balance").length).toBeGreaterThan(0);
  });
});
