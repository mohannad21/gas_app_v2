import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/hooks/useInventory", () => ({
  useCreateBuyFullFromCompany: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateRefill: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInitInventory: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInventoryRefillDetails: () => ({ data: null }),
  useInventoryLatest: () => ({
    data: { full12: 10, empty12: 5, full48: 6, empty48: 3 },
    isLoading: false,
  }),
  useInventorySnapshot: () => ({
    data: { full12: 10, empty12: 5, full48: 6, empty48: 3 },
  }),
  useUpdateRefill: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({
    data: [
      {
        id: "price-12",
        gas_type: "12kg",
        selling_price: 0,
        buying_price: 75,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-01-01T00:00:00Z",
      },
      {
        id: "price-48",
        gas_type: "48kg",
        selling_price: 0,
        buying_price: 480,
        selling_iron_price: 0,
        buying_iron_price: 0,
        company_iron_price: 0,
        effective_from: "2026-01-01T00:00:00Z",
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/components/InlineWalletFundingPrompt", () => () => null);

// Mutable — set in beforeEach per describe block
let mockCompanyData = { company_money: 0, company_cyl_12: -3, company_cyl_48: -2 };

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: mockCompanyData,
    isSuccess: true,
  }),
}));

import { RefillForm } from "@/components/AddRefillModal";

describe("dist_return_empties — real debt (owedReturn12=3, owedReturn48=2)", () => {
  beforeEach(() => {
    // company_cyl_12: -3  →  owedReturn12 = 3
    // company_cyl_48: -2  →  owedReturn48 = 2
    mockCompanyData = { company_money: 0, company_cyl_12: -3, company_cyl_48: -2 };
  });

  const renderReturn = () =>
    render(<RefillForm visible onClose={jest.fn()} onSaved={jest.fn()} mode="return" walletBalance={0} />);

  it("opens with 12kg field pre-filled to owed amount and toggle at S1", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getByDisplayValue("3")).toBeTruthy());
    expect(view.getAllByText("Didn't return").length).toBeGreaterThanOrEqual(1);
  });

  it("opens with 48kg field pre-filled to owed amount and toggle at S1", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getByDisplayValue("2")).toBeTruthy());
    expect(view.getAllByText("Didn't return").length).toBeGreaterThanOrEqual(2);
  });

  it("tapping 12kg toggle cycles S1 → S2 → S1", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getByDisplayValue("3")).toBeTruthy());

    // S1 on open
    const toggles = view.getAllByText("Didn't return");
    fireEvent.press(toggles[0]);

    // S2: field → 0
    await waitFor(() => expect(view.getAllByText("Return all").length).toBeGreaterThanOrEqual(1));
    expect(view.getByDisplayValue("0")).toBeTruthy();

    fireEvent.press(view.getAllByText("Return all")[0]);

    // Back to S1: field → 3
    await waitFor(() => expect(view.getAllByText("Didn't return").length).toBeGreaterThanOrEqual(1));
    expect(view.getByDisplayValue("3")).toBeTruthy();
  });

  it("typing the exact owed amount snaps 12kg toggle to S1", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getByDisplayValue("3")).toBeTruthy());

    // Move to S2
    fireEvent.press(view.getAllByText("Didn't return")[0]);
    await waitFor(() => expect(view.getAllByText("Return all").length).toBeGreaterThanOrEqual(1));

    // Type target → snaps back to S1
    fireEvent.changeText(view.getByDisplayValue("0"), "3");
    expect(view.getAllByText("Didn't return").length).toBeGreaterThanOrEqual(1);
  });

  it("typing 0 snaps 12kg toggle to S2", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getByDisplayValue("3")).toBeTruthy());
    fireEvent.changeText(view.getByDisplayValue("3"), "0");
    expect(view.getAllByText("Return all").length).toBeGreaterThanOrEqual(1);
  });

  it("typing a custom value preserves 12kg toggle state", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getByDisplayValue("3")).toBeTruthy());
    // S1 on open
    expect(view.getAllByText("Didn't return").length).toBeGreaterThanOrEqual(1);

    fireEvent.changeText(view.getByDisplayValue("3"), "1");
    // Still S1
    expect(view.getAllByText("Didn't return").length).toBeGreaterThanOrEqual(1);
  });

  it("12kg return field is editable", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getByDisplayValue("3")).toBeTruthy());
    const input = view.getByDisplayValue("3");
    expect(input.props.editable).not.toBe(false);
  });
});

describe("dist_return_empties — zero balance (owedReturn12=0, owedReturn48=0)", () => {
  beforeEach(() => {
    // company_cyl_12: 5  →  owedReturn12 = 0
    // company_cyl_48: 3  →  owedReturn48 = 0
    mockCompanyData = { company_money: 0, company_cyl_12: 5, company_cyl_48: 3 };
  });

  const renderReturn = () =>
    render(<RefillForm visible onClose={jest.fn()} onSaved={jest.fn()} mode="return" walletBalance={0} />);

  it("12kg field is editable even with zero balance", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getAllByText("Didn't return").length).toBeGreaterThanOrEqual(1));

    const inputs = view.getAllByDisplayValue("0");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    expect(inputs[0].props.editable).not.toBe(false);
  });

  it("toggle buttons are visible even with zero balance", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getAllByText("Didn't return").length).toBeGreaterThanOrEqual(2));
  });

  it("zero-balance toggle buttons are tappable without error", async () => {
    const view = renderReturn();

    await waitFor(() => expect(view.getAllByText("Didn't return").length).toBeGreaterThanOrEqual(2));

    const toggles = view.getAllByText("Didn't return");
    expect(() => fireEvent.press(toggles[0])).not.toThrow();
    expect(() => fireEvent.press(toggles[1])).not.toThrow();
  });
});
