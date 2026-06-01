import React from "react";
import { render } from "@testing-library/react-native";

import SlimActivityRow from "@/components/reports/SlimActivityRow";
import {
  bankDepositToEvent,
  cashAdjustmentToEvent,
  expenseToEvent,
  inventoryAdjustmentGroupToEvent,
} from "@/lib/activityAdapter";
import type { BankDeposit, CashAdjustment, Expense } from "@/types/domain";
import type { InventoryAdjustment } from "@/types/inventory";

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

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    expense_type: "Fuel",
    amount: 45,
    date: "2026-05-14",
    created_at: "2026-05-14T08:00:00Z",
    note: null,
    is_deleted: false,
    ...overrides,
  } as Expense;
}

function makeBankDeposit(overrides: Partial<BankDeposit> = {}): BankDeposit {
  return {
    id: "bd-1",
    happened_at: "2026-05-14T12:00:00Z",
    amount: 200,
    direction: "wallet_to_bank",
    note: null,
    ...overrides,
  } as BankDeposit;
}

function makeCashAdjustment(overrides: Partial<CashAdjustment> = {}): CashAdjustment {
  return {
    id: "csh-1",
    delta_cash: 25,
    reason: null,
    effective_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    is_deleted: false,
    ...overrides,
  };
}

function makeInventoryAdjustment(overrides: Partial<InventoryAdjustment> = {}): InventoryAdjustment {
  return {
    id: "ia-1",
    gas_type: "12kg",
    delta_full: 2,
    delta_empty: -1,
    reason: null,
    effective_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    is_deleted: false,
    ...overrides,
  };
}

describe("pipeline: wallet / ledger activities adapter -> SlimActivityRow", () => {
  it('expense renders canonical label "Expense"', () => {
    const event = expenseToEvent(makeExpense());

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Expense").length).toBeGreaterThan(0);
  });

  it('wallet_to_bank renders canonical label "Wallet to bank" and negative amount', () => {
    const event = bankDepositToEvent(makeBankDeposit({ direction: "wallet_to_bank", amount: 200 }));

    const { getAllByText, getByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Wallet to bank").length).toBeGreaterThan(0);
    expect(getByText("-200 $")).toBeTruthy();
  });

  it('bank_to_wallet renders canonical label "Bank to wallet" and positive amount', () => {
    const event = bankDepositToEvent(makeBankDeposit({ direction: "bank_to_wallet", amount: 150 }));

    const { getAllByText, getByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Bank to wallet").length).toBeGreaterThan(0);
    expect(getByText("+150 $")).toBeTruthy();
  });

  it('adjust_wallet renders canonical label "Adjust wallet"', () => {
    const event = cashAdjustmentToEvent(makeCashAdjustment());

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Adjust wallet").length).toBeGreaterThan(0);
  });

  it('adjust_inventory renders canonical label "Adjust inventory"', () => {
    const event = inventoryAdjustmentGroupToEvent([makeInventoryAdjustment()]);

    const { getAllByText } = render(<SlimActivityRow event={event} formatMoney={fmt} />);
    expect(getAllByText("Adjust inventory").length).toBeGreaterThan(0);
  });
});
