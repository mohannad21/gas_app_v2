import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockCreateRefillMutateAsync = jest.fn().mockResolvedValue({});
const mockCreateCompanyBuyIronMutateAsync = jest.fn().mockResolvedValue({});
const mockUpdateRefillMutateAsync = jest.fn().mockResolvedValue({});
const mockInitInventoryMutateAsync = jest.fn().mockResolvedValue({});

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/hooks/useInventory", () => ({
  useCreateCompanyBuyIron: () => ({ mutateAsync: mockCreateCompanyBuyIronMutateAsync, isPending: false }),
  useCreateRefill: () => ({ mutateAsync: mockCreateRefillMutateAsync, isPending: false }),
  useInitInventory: () => ({ mutateAsync: mockInitInventoryMutateAsync, isPending: false }),
  useInventoryRefillDetails: () => ({ data: null }),
  useInventorySnapshot: () => ({
    data: { full12: 10, empty12: 3, full48: 6, empty48: 1 },
  }),
  useUpdateRefill: () => ({ mutateAsync: mockUpdateRefillMutateAsync, isPending: false }),
}));

jest.mock("@/hooks/usePrices", () => ({
  usePriceSettings: () => ({
    data: [
      {
        id: "price-12",
        gas_type: "12kg",
        buying_price: 75,
        effective_from: "2026-01-01T00:00:00Z",
      },
      {
        id: "price-48",
        gas_type: "48kg",
        buying_price: 480,
        effective_from: "2026-01-01T00:00:00Z",
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

jest.mock("@/hooks/useCompanyBalances", () => ({
  useCompanyBalances: () => ({
    data: { company_money: 0, company_cyl_12: 2, company_cyl_48: -1 },
    isSuccess: true,
  }),
}));

jest.mock("@/components/InlineWalletFundingPrompt", () => () => null);

import { RefillForm, sanitizeBuyCountInput } from "@/components/AddRefillModal";

describe("AddRefillModal company activity behavior", () => {
  beforeEach(() => {
    mockCreateRefillMutateAsync.mockClear();
    mockCreateCompanyBuyIronMutateAsync.mockClear();
    mockUpdateRefillMutateAsync.mockClear();
    mockInitInventoryMutateAsync.mockClear();
  });

  it("does not cap buy-full quantities by empties", () => {
    expect(sanitizeBuyCountInput("8", 3, true)).toBe("8");
  });

  it("still caps non-buy quantities by available empties", () => {
    expect(sanitizeBuyCountInput("8", 3, false)).toBe("3");
  });

  it("uses the dedicated company buy path and hides refill return wording in buy mode", async () => {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const { getAllByText, getByText, queryByText } = render(
      <RefillForm visible onClose={onClose} onSaved={onSaved} mode="buy" walletBalance={500} />
    );

    expect(queryByText("12kg Return")).toBeNull();
    expect(queryByText("48kg Return")).toBeNull();

    fireEvent.press(getAllByText("+")[0]);

    await act(async () => {
      fireEvent.press(getByText("Save"));
    });

    await waitFor(() => {
      expect(mockCreateCompanyBuyIronMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          new12: 1,
          new48: 0,
          total_cost: 75,
          paid_now: 75,
        })
      );
    });
    expect(mockCreateRefillMutateAsync).not.toHaveBeenCalled();
  });

  it("shows each return balance line only in its matching gas box", () => {
    const { getAllByText } = render(
      <RefillForm visible onClose={jest.fn()} onSaved={jest.fn()} mode="return" walletBalance={500} />
    );

    expect(getAllByText("You owe company 2x12kg empties")).toHaveLength(1);
    expect(getAllByText("Company owes you 1x48kg empty")).toHaveLength(1);
  });
});
